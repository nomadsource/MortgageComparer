(function () {
  'use strict';

  var round2 = MC.core.round2;

  // Income for a month on balance: accrual, tax, income after tax.
  function monthIncome(balance, annualRate, taxRate) {
    var gross = round2(balance * annualRate / 100 / 12);
    var tax = round2(gross * taxRate / 100);
    return { gross: gross, tax: tax, net: round2(gross - tax) };
  }

  // Month-by-month evolution of a deposit for months 1..termMonths: capitalisation (net of tax),
  // then a top-up/withdrawal by the plan. After termMonths the deposit no longer changes (step does nothing).
  // A month's accrual can be made earlier (withdraw, netIncomeOver); it is not repeated.
  // Months go strictly in order: operations on month m are allowed once m - 1 steps are done.
  function create(deposit) {
    var horizon = Math.max(0, Math.floor(deposit.termMonths));
    var balance = Math.max(0, round2(deposit.plan.initial));
    var cumFlow = balance; // paid in: the initial amount + the plan operations actually made
    var cumIncome = 0; // net income, cumulative
    var cumTax = 0; // tax paid, cumulative
    var cumWithdrawn = 0; // taken out by external withdrawals, cumulative
    var nets = {}; // net income by month number
    var accrued = null; // accrual of the current month: {month, tax, net}
    var withdrawn = 0; // taken out by an external withdrawal in the current month
    var rows = [];

    function isOpen(m) { return m <= horizon && m === rows.length + 1; }

    function accrue(m) {
      if (accrued && accrued.month === m) { return accrued; }
      var income = monthIncome(balance, deposit.rates.rateAt(m), deposit.taxRate);
      balance = round2(balance + income.net);
      nets[m] = income.net;
      accrued = { month: m, tax: income.tax, net: income.net };
      return accrued;
    }

    function step(m) {
      if (!isOpen(m)) { return null; }
      var a = accrue(m);
      var before = balance; // after accrual and the external withdrawal
      balance = Math.max(0, round2(balance + deposit.plan.flowAt(m)));
      // The operation actually made by the plan: a withdrawal larger than the balance is capped at zero.
      var flow = round2(balance - before);
      cumFlow = round2(cumFlow + flow);
      cumIncome = round2(cumIncome + a.net);
      cumTax = round2(cumTax + a.tax);
      cumWithdrawn = round2(cumWithdrawn + withdrawn);
      var row = {
        month: m,
        date: MC.core.addMonths(deposit.startDate, m - 1),
        balance: balance,
        incomeNet: a.net,
        tax: a.tax,
        flow: flow,
        withdrawn: withdrawn,
        cumFlow: cumFlow,
        cumIncome: cumIncome,
        cumTax: cumTax,
        cumWithdrawn: cumWithdrawn
      };
      withdrawn = 0;
      rows.push(row);
      return row;
    }

    return {
      // Net interest over the last `months` months, including month m's accrual
      // (accrues month m if it has not been yet). Interest actually accrued; earlier withdrawals are not subtracted.
      // 0 if the deposit is already frozen (m > termMonths).
      netIncomeOver: function (m, months) {
        if (!isOpen(m)) { return 0; }
        accrue(m);
        var sum = 0;
        for (var k = m - months + 1; k <= m; k++) { sum = round2(sum + (nets[k] || 0)); }
        return sum;
      },
      // An external withdrawal in month m after interest accrual: at most the balance.
      // Returns the amount actually withdrawn (0 if the deposit is frozen).
      withdraw: function (m, amount) {
        if (!isOpen(m)) { return 0; }
        accrue(m);
        var taken = Math.max(0, Math.min(amount, balance));
        balance = round2(balance - taken);
        withdrawn = round2(withdrawn + taken);
        return taken;
      },
      step: step,
      // Runs the deposit to its horizon.
      complete: function () {
        for (var m = rows.length + 1; m <= horizon; m++) { step(m); }
        return rows;
      },
      rows: function () { return rows; }
    };
  }

  MC.sim.DepositEngine = { create: create };
})();
