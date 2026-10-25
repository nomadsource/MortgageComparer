(function () {
  'use strict';

  var round2 = MC.core.round2;

  // How many months a fixed payment takes to repay the debt at an unchanged rate r.
  // Infinity if the payment does not cover the interest or does not fit within cap months.
  function monthsToPayOff(debt, payment, r, cap) {
    var d = debt;
    for (var k = 1; k <= cap; k++) {
      var interest = round2(d * r);
      if (d + interest <= payment) { return k; }
      var body = payment - interest;
      if (body <= 0) { return Infinity; }
      d = round2(d - body);
    }
    return Infinity;
  }

  // The shared monthly loop. Everything that makes an offset different arrives through hooks:
  //   balanceAt()       - account balance at the start of the month (effective debt = debt - balance);
  //   offsetEffectKind  - 'offsetReducesTerm' | 'offsetReducesPayment' | null;
  //   extraOverpayment(m, maxAmount) - an optional extra overpayment on top of overpayments
  //                       (at most maxAmount), returns the amount actually applied;
  //   endOfMonth(m)     - end-of-month operations after the overpayment; may return {accountBalance}
  //                       (the offset account balance for the schedule row) or nothing.
  // Returns {rows, error}.
  function run(mortgage, hooks) {
    var terms = mortgage.terms;
    var rates = mortgage.rates;
    var repayment = mortgage.repayment;
    var overpayments = mortgage.overpayments;
    var offsetKind = hooks.offsetEffectKind || null;

    var isAnnuity = repayment.kind === 'annuity';
    var overpayReducesPayment = overpayments.effect.kind === 'reducePayment';
    // Modes in which the term is shortened rather than kept as originally set.
    var termShrinks = overpayments.effect.kind === 'reduceTerm' || offsetKind === 'offsetReducesTerm';

    var rows = [];
    var debt = round2(terms.loanAmount());
    var total = Math.floor(terms.termMonths);
    if (!(debt > 0) || !(total >= 1)) { return { rows: rows, error: null }; }

    var annuityPayment = 0; // annuity: the scheduled payment in force
    var bodyPart = 0; // differentiated: the principal share in force
    var prevAnnual = null;
    var prevR = 0;
    var error = null;
    // Whether the schedule became shorter than nominal (ReduceTerm overpayment or OffsetReducesTerm saving).
    var shortened = false;
    var cumInterest = 0;
    var cumPrincipal = 0;
    var cumOverpayment = 0;

    for (var m = 1; m <= total && debt > 0; m++) {
      var annual = rates.rateAt(m);
      var r = annual / 100 / 12;
      var left = total - m + 1;

      if (m === 1) {
        if (isAnnuity) { annuityPayment = repayment.payment(debt, r, left); }
        else { bodyPart = repayment.principalPart(debt, r, left); }
      } else if (isAnnuity && annual !== prevAnnual) {
        // Rate change: the payment is recomputed for the current debt.
        // OPEN QUESTION: see PLAN.md section 8
        // If the term is being shortened, the remaining term is the number of months to repay
        // at the old payment and old rate (at most the nominal remainder).
        // ASSUMPTION: the same rule applies to OffsetReducesTerm (a term shortened by the offset is
        // also computed from the old payment on the full debt, ignoring the account balance).
        var n = left;
        if (termShrinks) { n = Math.min(left, monthsToPayOff(debt, annuityPayment, prevR, left)); }
        annuityPayment = repayment.payment(debt, r, n);
      }

      // 1. Interest on the effective debt.
      var interestFull = round2(debt * r);
      var balance = hooks.balanceAt ? hooks.balanceAt() : 0;
      var interest = round2(Math.max(0, debt - balance) * r);

      // 2. The scheduled payment "as without an offset" and its principal share.
      var plannedPrincipal;
      var plannedPayment;
      if (isAnnuity) {
        plannedPayment = annuityPayment;
        plannedPrincipal = round2(annuityPayment - interestFull);
      } else {
        plannedPrincipal = bodyPart;
        plannedPayment = round2(bodyPart + interestFull);
      }

      if (offsetKind === 'offsetReducesTerm' && interest < interestFull) { shortened = true; }

      var payment;
      var principal;
      var isTail = false;
      if (offsetKind === 'offsetReducesPayment') {
        principal = plannedPrincipal;
        payment = round2(principal + interest);
      } else {
        payment = plannedPayment;
        principal = round2(payment - interest);
      }

      // The last payment is adjusted so that the debt becomes exactly 0.
      // ASSUMPTION: in month m === termMonths the debt is closed by force (accumulated rounding
      // error goes into the last payment); this also bounds the loop.
      if (m === total || principal >= debt) {
        // "Tail": the closing payment is smaller than scheduled because the term was shortened (not because of rounding).
        isTail = shortened && round2(debt + interest) < payment;
        principal = debt;
        payment = round2(debt + interest);
      } else if (principal <= 0) {
        // ASSUMPTION: if the payment does not cover the interest, the schedule stops at the previous
        // month (this month's row is not added) and error 'paymentTooLow' is returned.
        error = 'paymentTooLow';
        break;
      }
      debt = round2(debt - principal);

      // 3. Overpayment (at most the remaining debt).
      var overpayment = 0;
      if (debt > 0) {
        overpayment = Math.min(round2(Math.max(0, overpayments.amountAt(m))), debt);
        // An extra overpayment from an external source; the source decides how much to apply.
        if (hooks.extraOverpayment && overpayment < debt) {
          overpayment = round2(overpayment + hooks.extraOverpayment(m, round2(debt - overpayment)));
        }
        debt = round2(debt - overpayment);
        if (overpayment > 0 && !overpayReducesPayment) { shortened = true; }
        // ASSUMPTION: with ReducePayment + OffsetReducesTerm the payment after an overpayment is computed
        // for the nominal remaining term (a term already shortened by the offset is "forgotten").
        if (overpayment > 0 && debt > 0 && overpayReducesPayment) {
          if (isAnnuity) { annuityPayment = repayment.payment(debt, r, total - m); }
          else { bodyPart = repayment.principalPart(debt, r, total - m); }
        }
      }

      // 4. End-of-month operations (offset account etc.).
      var account = hooks.endOfMonth ? hooks.endOfMonth(m) : null;

      cumInterest = round2(cumInterest + interest);
      cumPrincipal = round2(cumPrincipal + principal + overpayment);
      cumOverpayment = round2(cumOverpayment + overpayment);

      rows.push(MC.sim.ScheduleRow.create({
        month: m,
        date: MC.core.addMonths(terms.startDate, m - 1),
        rate: annual,
        payment: payment,
        interest: interest,
        principal: principal,
        overpayment: overpayment,
        fee: MC.domain.Payments.amountAt(mortgage.fees || [], m),
        debtEnd: debt,
        accountBalance: account ? account.accountBalance : null,
        cumInterest: cumInterest,
        cumPrincipal: cumPrincipal,
        cumOverpayment: cumOverpayment,
        isTail: isTail
      }));

      prevAnnual = annual;
      prevR = r;
    }

    return { rows: rows, error: error };
  }

  MC.sim.LoanEngine = { run: run };
})();
