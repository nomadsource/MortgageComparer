(function () {
  'use strict';

  var round2 = MC.core.round2;

  // The year for the deposit-interest overpayment is 12 consecutive months from the mortgage start.
  var MONTHS_IN_YEAR = 12;

  function monthIndex(date) { return date.year * 12 + date.month; }

  // The only place that knows both the mortgage and the deposits. A classic mortgage + linked deposits
  // (pairs = [{deposit, link}] in link order): each deposit is aligned with the mortgage by dates: mortgage month m =
  // deposit month j = m + offsetMonths, where offsetMonths = (mortgage start - deposit start) in months. A deposit started
  // earlier (offsetMonths > 0) has already run offsetMonths months with no withdrawals before mortgage month 1; one started
  // later is inactive until j = 1 (balance 0, nothing withdrawn). For a link with useInterest, once a year the net
  // interest of its deposit goes into an overpayment. Each pair has its own deposit state: the engine is created anew.
  // ASSUMPTION: each deposit's horizon is its own termMonths, not the mortgage term: if the mortgage closes earlier,
  // the deposit keeps growing to termMonths; if the mortgage is longer than the deposit, the deposit freezes after termMonths.
  // ASSUMPTION: withdrawals for several useInterest links go in link order; the shared limit is the debt left
  // after the regular overpayment: each next link may take (remainder - already withdrawn this month).
  function run(mortgage, pairs) {
    var items = pairs.map(function (pair) {
      var engine = MC.sim.DepositEngine.create(pair.deposit);
      var offset = monthIndex(mortgage.terms.startDate) - monthIndex(pair.deposit.startDate);
      // Pre-run: the deposit's months before the mortgage's first month (no withdrawals).
      for (var pre = 1; pre <= offset; pre++) { engine.step(pre); }
      return { deposit: pair.deposit, link: pair.link, engine: engine, offset: offset };
    });
    var hooks = {
      endOfMonth: function (m) {
        items.forEach(function (it) { if (m + it.offset >= 1) { it.engine.step(m + it.offset); } });
      }
    };
    if (items.some(function (it) { return it.link.useInterest === true; })) {
      // The overpayment happens only in the last month of each year (m divisible by MONTHS_IN_YEAR): the amount per link is
      // the deposit's net interest for the year (including month m), at most the remaining limit and the deposit balance.
      // LoanEngine calls the hook only while debt remains after the payment, so there is no overpayment in the month the
      // payment closes the loan or after it; an incomplete last year gives none; for m > the deposit's termMonths
      // the deposit engine returns 0.
      // ASSUMPTION: the year's amount is the net interest actually accrued in months m-11..m; earlier withdrawals
      // are not subtracted; an unspent remainder stays on the deposit; if the balance is below the amount, the whole balance is taken.
      hooks.extraOverpayment = function (m, maxAmount) {
        if (m % MONTHS_IN_YEAR !== 0) { return 0; }
        var taken = 0;
        items.forEach(function (it) {
          if (it.link.useInterest !== true) { return; }
          // Deposit month j = m + offset; j < 1 (the deposit has not started) gives 0.
          var j = m + it.offset;
          if (j < 1) { return; }
          var cap = round2(maxAmount - taken);
          if (cap <= 0) { return; }
          taken = round2(taken + it.engine.withdraw(j, Math.min(it.engine.netIncomeOver(j, MONTHS_IN_YEAR), cap)));
        });
        return taken;
      };
    }
    var loan = MC.sim.ClassicSimulator.run(mortgage, hooks);

    // Mortgage metrics come from Metrics; the pair fields are written over them (sums over all deposits).
    var metrics = MC.sim.Metrics.compute(mortgage, loan.rows);
    var incomeNet = 0;
    var taxPaid = 0;
    var balanceSum = 0;
    var deposits = items.map(function (it) {
      var rows = it.engine.complete();
      var dm = MC.sim.DepositMetrics.compute(it.deposit, rows);
      incomeNet = round2(incomeNet + dm.incomeNet);
      taxPaid = round2(taxPaid + dm.taxPaid);
      // ASSUMPTION: the deposit balance at deposit month j = the MORTGAGE's report.month + offsetMonths; j < 1 (not started) gives 0;
      // j past the deposit's termMonths gives the last row's balance (report.month < 1 is treated as 1;
      // a deposit with no rows gives the initial amount from DepositMetrics).
      var reportJ = Math.max(1, mortgage.report.month) + it.offset;
      balanceSum += rows.length === 0
        ? dm.finalBalance
        : (reportJ < 1 ? 0 : rows[Math.min(reportJ, rows.length) - 1].balance);
      return { depositId: it.deposit.id, rows: rows, metrics: dm, offsetMonths: it.offset };
    });
    if (items.length) {
      metrics.depositIncomeNet = incomeNet;
      metrics.depositTax = taxPaid;
      metrics.netCost = round2(metrics.overpayment + metrics.feesTotal - incomeNet);
      metrics.netCapitalAtReport = round2(balanceSum - metrics.debtAtReport);
    }

    return { rows: loan.rows, metrics: metrics, error: loan.error, deposits: deposits };
  }

  MC.sim.PairSimulator = { run: run, MONTHS_IN_YEAR: MONTHS_IN_YEAR };
})();
