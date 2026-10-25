(function () {
  'use strict';

  var round2 = MC.core.round2;

  // Effective rate, % a year: the IRR of the borrower's flows. ASSUMPTION: +loan amount at time 0, then at the end of each
  // month m the row's -(payment + overpayment [+ fee]); month m's payment happens at the end of month m (an upfront fee is month 1).
  // The monthly rate i is found by bisection of NPV(i)=0 on [-0.5; 10]; annual effective = ((1+i)^12 - 1) * 100. No root: null.
  function effectiveRateOf(loanAmount, rows, withFees) {
    var flows = rows.map(function (r) { return r.payment + r.overpayment + (withFees ? r.fee : 0); });
    function npv(i) {
      var s = loanAmount;
      for (var k = 0; k < flows.length; k++) { s -= flows[k] / Math.pow(1 + i, k + 1); }
      return s;
    }
    var lo = -0.5;
    var hi = 10;
    if (!(npv(lo) < 0) || !(npv(hi) > 0)) { return null; }
    for (var it = 0; it < 200; it++) {
      var mid = (lo + hi) / 2;
      if (npv(mid) > 0) { hi = mid; } else { lo = mid; }
    }
    var i = (lo + hi) / 2;
    // "+ 0" turns -0 (a rate rounded to zero from below) into a plain 0 so "-0,00" is never shown
    return round2((Math.pow(1 + i, 12) - 1) * 100) + 0;
  }

  // Mortgage-only metrics. The pair fields (depositIncomeNet, depositTax, netCost, netCapitalAtReport)
  // are written over the result by PairSimulator.
  function compute(mortgage, rows) {
    var terms = mortgage.terms;
    var n = rows.length;

    // ASSUMPTION: an empty schedule (zero amount or term) gives all-zero metrics, close date = start date.
    if (n === 0) {
      return {
        firstPayment: 0, maxPayment: 0, minPayment: 0, overpayment: 0, totalPaid: 0, feesTotal: 0, overpaymentTotal: 0, effectiveRate: null, effectiveRateNoFees: null,
        actualTermMonths: 0, closeDate: { year: terms.startDate.year, month: terms.startDate.month }, debtAtReport: 0,
        depositIncomeNet: null, depositTax: null, netCost: 0, netCapitalAtReport: 0, contributed: null
      };
    }

    // ASSUMPTION (agreed with the user): min/max payment ignore the "tail" (row.isTail) -
    // the closing payment smaller than scheduled because overpayments/offset shortened the term. The first payment
    // always counts; the scheduled last payment of a differentiated loan remains a true minimum.
    // The tail is included in totalPaid.
    var maxPayment = rows[0].payment;
    var minPayment = rows[0].payment;
    var interestSum = 0;
    var totalPaid = 0;
    var feesTotal = 0;
    for (var i = 0; i < n; i++) {
      var row = rows[i];
      if (!row.isTail) {
        if (row.payment > maxPayment) { maxPayment = row.payment; }
        if (row.payment < minPayment) { minPayment = row.payment; }
      }
      interestSum = round2(interestSum + row.interest);
      totalPaid = round2(totalPaid + row.payment + row.overpayment + row.fee);
      feesTotal = round2(feesTotal + row.fee);
    }

    // Without fees both rates coincide, so the bisection runs once
    var effectiveRate = effectiveRateOf(round2(terms.loanAmount()), rows, true);

    // ASSUMPTION: report.month < 1 is treated as 1.
    var reportMonth = Math.max(1, mortgage.report.month);
    // If the loan closed before month N, the debt is 0 and the offset balance comes from the last row.
    // ASSUMPTION (agreed with the user): the offset account balance is frozen when the loan closes
    // and does not develop further.
    var atReport = rows[Math.min(reportMonth, n) - 1];
    var debtAtReport = reportMonth > n ? 0 : atReport.debtEnd;
    // Offset account balance; 0 for a classic mortgage (a deposit balance for a pair is handled by PairSimulator).
    var balanceAtReport = atReport.accountBalance === null ? 0 : atReport.accountBalance;

    return {
      firstPayment: rows[0].payment,
      maxPayment: maxPayment,
      minPayment: minPayment,
      overpayment: interestSum,
      totalPaid: totalPaid,
      feesTotal: feesTotal,
      // Total overpayment: interest + extra payments (insurance, fees)
      overpaymentTotal: round2(interestSum + feesTotal),
      effectiveRate: effectiveRate,
      effectiveRateNoFees: feesTotal === 0 ? effectiveRate : effectiveRateOf(round2(terms.loanAmount()), rows, false),
      actualTermMonths: n,
      closeDate: { year: rows[n - 1].date.year, month: rows[n - 1].date.month },
      debtAtReport: debtAtReport,
      depositIncomeNet: null,
      depositTax: null,
      netCost: round2(interestSum + feesTotal),
      netCapitalAtReport: round2(balanceAtReport - debtAtReport),
      // Paid onto the offset account (initial amount + applied operations); an offset balance does not grow on its own, so this is the balance at loan close
      contributed: rows[n - 1].accountBalance === null ? null : rows[n - 1].accountBalance
    };
  }

  // Deposit metrics from its DepositRow rows (exactly termMonths of them).
  function computeDeposit(deposit, rows) {
    var n = rows.length;
    // ASSUMPTION: with termMonths < 1 there are no rows - balance and "paid in" equal the initial amount, the rest 0.
    if (n === 0) {
      var initial = Math.max(0, round2(deposit.plan.initial));
      return { finalBalance: initial, incomeNet: 0, taxPaid: 0, contributed: initial, balanceAtReport: initial };
    }
    var tax = 0;
    for (var i = 0; i < n; i++) { tax = round2(tax + rows[i].tax); }
    // ASSUMPTION: report.month < 1 is treated as 1; report.month > termMonths gives the last row's balance.
    var reportMonth = Math.max(1, deposit.report.month);
    return {
      finalBalance: rows[n - 1].balance,
      incomeNet: rows[n - 1].cumIncome,
      taxPaid: tax,
      contributed: rows[n - 1].cumFlow,
      balanceAtReport: rows[Math.min(reportMonth, n) - 1].balance
    };
  }

  MC.sim.Metrics = { compute: compute };
  MC.sim.DepositMetrics = { compute: computeDeposit };
})();
