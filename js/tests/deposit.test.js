// Tests of a deposit as a standalone entity, of a mortgage + deposit pair, and of Simulation.run.
// Expected values are computed by hand (see the comments); the helpers are MC.tests.sim from classic.test.js.
(function () {
  'use strict';

  var H = MC.tests.sim;
  var round2 = MC.core.round2;

  // ---- A standalone deposit ----

  // A deposit: initial 100 000, 12% a year (1% a month), tax 13%, a 10 000 top-up every month, one-off in month 2: -5 000.
  //   m1: gross 1000.00, tax 130.00, net 870.00;    balance 100 000 + 870.00 + 10 000 = 110 870.00
  //   m2: gross 1108.70, tax 144.13 (144.131), net 964.57; 110 870 + 964.57 + (10 000 - 5 000) = 116 834.57
  //   m3: gross 1168.35 (1168.3457), tax 151.89 (151.8855), net 1016.46; 116 834.57 + 1016.46 + 10 000 = 127 851.03
  //   income after tax: 870 + 964.57 + 1016.46 = 2851.03; tax: 130 + 144.13 + 151.89 = 426.02
  function sampleDeposit(termMonths, reportMonth) {
    return H.deposit({
      term: termMonths, reportMonth: reportMonth, rate: 12, tax: 13,
      plan: { initial: 100000, payments: [{ amount: 10000, everyMonths: 1 }, { month: 2, amount: -5000 }] }
    });
  }

  test('deposit: capitalisation, tax and operations by month (a hand-worked example)', function () {
    var res = H.run(sampleDeposit(3, 3));
    var rows = res.rows;
    assertEqual(res.error, null);
    assertEqual(rows.length, 3);
    assertDeepEqual(rows.map(function (r) { return r.month; }), [1, 2, 3]);
    assertDeepEqual(rows.map(function (r) { return r.incomeNet; }), [870, 964.57, 1016.46]);
    assertDeepEqual(rows.map(function (r) { return r.tax; }), [130, 144.13, 151.89]);
    assertDeepEqual(rows.map(function (r) { return r.cumTax; }), [130, 274.13, 426.02]);
    assertDeepEqual(rows.map(function (r) { return r.flow; }), [10000, 5000, 10000]);
    assertDeepEqual(rows.map(function (r) { return r.balance; }), [110870, 116834.57, 127851.03]);
    assertDeepEqual(rows.map(function (r) { return r.cumFlow; }), [110000, 115000, 125000]);
    assertDeepEqual(rows.map(function (r) { return r.cumIncome; }), [870, 1834.57, 2851.03]);
    assertDeepEqual(rows.map(function (r) { return r.withdrawn; }), [0, 0, 0]);
    assertDeepEqual(rows.map(function (r) { return r.cumWithdrawn; }), [0, 0, 0]);
    var mt = res.metrics;
    assertEqual(mt.finalBalance, 127851.03);
    assertEqual(mt.incomeNet, 2851.03);
    assertEqual(mt.taxPaid, 426.02);
    assertEqual(mt.contributed, 125000);           // 100 000 + 10 000 + 5 000 + 10 000
    assertEqual(mt.balanceAtReport, 127851.03);
  });

  test('deposit: exactly termMonths rows; balanceAtReport by report.month, past the horizon - the last row', function () {
    assertEqual(H.run(H.deposit({ term: 36, rate: 8, tax: 13, plan: { initial: 1000 } })).rows.length, 36);
    assertEqual(H.run(H.deposit({ term: 1, rate: 8, tax: 13, plan: { initial: 1000 } })).rows.length, 1);
    assertEqual(H.run(sampleDeposit(3, 2)).metrics.balanceAtReport, 116834.57);
    assertEqual(H.run(sampleDeposit(3, 1)).metrics.balanceAtReport, 110870);
    assertEqual(H.run(sampleDeposit(3, 50)).metrics.balanceAtReport, 127851.03);
  });

  // A deposit rate schedule: 100 000, no tax or operations; 12% a year (1% a month) from month 1, 6% (0.5%) from month 3.
  //   m1: 100 000 · 1% = 1000.00 -> 101 000.00;  m2: 1010.00 -> 102 010.00;  m3: 102 010 · 0.5% = 510.05 -> 102 520.05
  test('deposit: a rate change mid-term (rateAt(m) at month m\'s accrual)', function () {
    var d = H.deposit({
      term: 3, tax: 0, plan: { initial: 100000 },
      rates: [{ fromMonth: 1, annualRate: 12 }, { fromMonth: 3, annualRate: 6 }]
    });
    var rows = H.run(d).rows;
    assertDeepEqual(rows.map(function (r) { return r.incomeNet; }), [1000, 1010, 510.05]);
    assertDeepEqual(rows.map(function (r) { return r.balance; }), [101000, 102010, 102520.05]);
    // the order of entries in the schedule does not matter
    d.rates.entries.reverse();
    assertDeepEqual(H.run(d).rows.map(function (r) { return r.balance; }), [101000, 102010, 102520.05]);
  });

  // Months before the first entry (fromMonth 3): the earliest entry is used (the RateSchedule rule), i.e. 12% from month 1.
  //   m1: 1000.00 -> 101 000.00;  m2: 1010.00 -> 102 010.00;  m3 (6% from month 5 is not in force yet): 1020.10 -> 103 030.10
  test('deposit: a month before the first schedule entry - the earliest entry\'s rate', function () {
    var d = H.deposit({
      term: 3, tax: 0, plan: { initial: 100000 },
      rates: [{ fromMonth: 3, annualRate: 12 }, { fromMonth: 5, annualRate: 6 }]
    });
    assertDeepEqual(H.run(d).rows.map(function (r) { return r.balance; }), [101000, 102010, 103030.1]);
  });

  // 1 000 000 at 8% (tax 13%): net by month 5800.00, 5833.64, 5867.47, 5901.51, 5935.73, 5970.17,
  // 6004.79, 6039.62, 6074.64, 6109.88, 6145.31, 6180.96 (gross = round2(balance · 0.08 / 12), tax = round2(gross · 0.13)).
  test('deposit 1 000 000 / 8% / 13%: balance and tax over a year', function () {
    var res = H.run(H.deposit({ term: 12, rate: 8, tax: 13, plan: { initial: 1000000 } }));
    var rows = res.rows;
    assertEqual(rows[0].balance, 1005800);
    assertEqual(rows[1].balance, 1011633.64);
    assertEqual(rows[2].balance, 1017501.11);
    assertEqual(rows[11].balance, 1071863.72);
    assertEqual(rows[11].cumIncome, 71863.72);
    assertEqual(res.metrics.taxPaid, 10738.26);
    assertEqual(res.metrics.contributed, 1000000);
  });

  test('deposit: a withdrawal above the balance is capped at zero (flow is the operation actually made)', function () {
    var rows = H.run(H.deposit({
      term: 3, rate: 12, tax: 13,
      plan: { initial: 1000, payments: [{ month: 1, amount: -5000 }] }
    })).rows;
    // m1: gross 10.00, tax 1.30, net 8.70 -> 1008.70; the 5000 withdrawal is capped: actually -1008.70 -> 0
    assertEqual(rows[0].incomeNet, 8.7);
    assertEqual(rows[0].tax, 1.3);
    assertEqual(rows[0].flow, -1008.7);
    assertEqual(rows[0].balance, 0);
    assertEqual(rows[0].cumFlow, -8.7);             // 1000 - 1008.70
    assertEqual(rows[1].incomeNet, 0);
    assertEqual(rows[1].flow, 0);
    assertEqual(rows[1].balance, 0);
  });

  test('deposit: tax 0%', function () {
    var rows = H.run(H.deposit({
      term: 2, rate: 12, tax: 0, plan: { initial: 1200, payments: [{ amount: 100, everyMonths: 1 }] }
    })).rows;
    // m1: 12.00 -> 1212 + 100 = 1312; m2: 13.12 -> 1325.12 + 100 = 1425.12
    assertEqual(rows[0].incomeNet, 12);
    assertEqual(rows[0].balance, 1312);
    assertEqual(rows[1].incomeNet, 13.12);
    assertEqual(rows[1].balance, 1425.12);
  });

  // A top-up every 12 months: initial 1200, 12% (1% a month), tax 0, +100 every 12 months, horizon 24.
  // The top-up happens only in months 12 and 24, AFTER the month's interest. The balance by month, rounded to kopecks:
  //   m1: 12.00 -> 1212.00 (flow 0); ... m11: 13.26 -> 1338.80;
  //   m12: interest 13.39 (1338.80 · 1%) -> 1352.19, then +100 -> 1452.19; m13: 14.52 -> 1466.71 (flow 0);
  //   ... m24: interest 16.20 -> 1636.36, then +100 -> 1736.36.
  test('deposit: a regular top-up every 12 months (only in months 12, 24)', function () {
    var rows = H.run(H.deposit({
      term: 24, rate: 12, tax: 0, plan: { initial: 1200, payments: [{ amount: 100, everyMonths: 12 }] }
    })).rows;
    assertEqual(rows.length, 24);
    rows.forEach(function (r, i) {
      assertEqual(r.flow, (i + 1) % 12 === 0 ? 100 : 0, 'month ' + (i + 1));
    });
    assertEqual(rows[0].balance, 1212);
    assertEqual(rows[10].balance, 1338.8);
    assertEqual(rows[11].incomeNet, 13.39);
    assertEqual(rows[11].balance, 1452.19);
    assertEqual(rows[12].incomeNet, 14.52);
    assertEqual(rows[12].balance, 1466.71);
    assertEqual(rows[23].incomeNet, 16.2);
    assertEqual(rows[23].balance, 1736.36);
    assertEqual(rows[23].cumFlow, 1400);
  });

  // One mixed list of deposit entries: initial 1200, 12% (1% a month), tax 0, horizon 6;
  // +10 every month, +100 every 3 months, one-off m2: -50 and m3: +25. Operations come after the interest.
  //   flow: m1 10; m2 10 - 50 = -40; m3 10 + 100 + 25 = 135; m4 10; m5 10; m6 10 + 100 = 110
  //   m1: 12.00 -> 1212 + 10 = 1222;  m2: 12.22 -> 1234.22 - 40 = 1194.22
  test('deposit: a mixed list of entries (every 1 and 3 + one-off, including a withdrawal)', function () {
    var rows = H.run(H.deposit({
      term: 6, rate: 12, tax: 0,
      plan: {
        initial: 1200,
        payments: [{ amount: 10, everyMonths: 1 }, { month: 2, amount: -50 }, { amount: 100, everyMonths: 3 }, { month: 3, amount: 25 }]
      }
    })).rows;
    assertDeepEqual(rows.map(function (r) { return r.flow; }), [10, -40, 135, 10, 10, 110]);
    assertEqual(rows[0].incomeNet, 12);
    assertEqual(rows[0].balance, 1222);
    assertEqual(rows[1].incomeNet, 12.22);
    assertEqual(rows[1].balance, 1194.22);
    assertEqual(rows[5].cumFlow, 1435);             // 1200 + 235
  });

  test('deposit: invariant balance == cumFlow + cumIncome - cumWithdrawn', function () {
    var plans = [
      { initial: 100000, payments: [{ amount: 10000, everyMonths: 1 }, { month: 2, amount: -5000 }] },
      { initial: 1000, payments: [{ month: 1, amount: -5000 }] },
      { initial: 5000, payments: [{ amount: -2000, everyMonths: 1 }] },
      { initial: 0, payments: [{ month: 2, amount: 3000 }, { month: 4, amount: -10000 }, { month: 5, amount: 700 }] }
    ];
    plans.forEach(function (plan, s) {
      var rows = H.run(H.deposit({ term: 24, rate: 12, tax: 13, plan: plan })).rows;
      assertEqual(rows.length, 24);
      rows.forEach(function (row, i) {
        var label = 'scenario ' + s + ', month ' + (i + 1);
        assertEqual(row.balance, round2(row.cumFlow + row.cumIncome - row.cumWithdrawn), label);
        assertTrue(row.balance >= 0, label);
        assertEqual(row.withdrawn, 0, label);
      });
    });
  });

  // ---- A pair without an interest overpayment ----

  test('a pair without useInterest: the mortgage is unchanged, the deposit equals the standalone one, withdrawn = 0', function () {
    var m = H.classic({ principal: 30000, term: 3, rate: 12, repayment: 'differentiated', reportMonth: 3 });
    var d = sampleDeposit(3, 3);
    var alone = H.run(m);
    var pair = H.runPair(m, d, false);
    assertDeepEqual(pair.rows, alone.rows);
    assertEqual(pair.error, null);
    assertEqual(pair.deposits[0].depositId, d.id);
    assertDeepEqual(pair.deposits[0].rows, H.run(d).rows);
    assertDeepEqual(pair.deposits[0].metrics, H.run(d).metrics);
    pair.deposits[0].rows.forEach(function (row) { assertEqual(row.withdrawn, 0); });
    assertDeepEqual(alone.deposits, []);
  });

  // Loan 30 000, 3 months, 12%, differentiated (interest 300 + 200 + 100 = 600); the deposit from the example above.
  test('pair metrics: income, tax, netCost, netCapitalAtReport = the deposit\'s balanceAtReport - debt', function () {
    var m = H.classic({ principal: 30000, term: 3, rate: 12, repayment: 'differentiated', reportMonth: 2 });
    var mt = H.runPair(m, sampleDeposit(3, 3), false).metrics;
    assertEqual(mt.overpayment, 600);
    assertEqual(mt.depositIncomeNet, 2851.03);
    assertEqual(mt.depositTax, 426.02);
    assertEqual(mt.netCost, -2251.03);                 // 600 - 2851.03
    assertEqual(mt.debtAtReport, 10000); // end of month 2: 30 000 - 2 · 10 000
    // the deposit balance at the MORTGAGE's report.month (2) = 116 834.57, not at the deposit's report.month (3)
    assertEqual(mt.netCapitalAtReport, 106834.57);     // 116 834.57 - 10 000

    var other = H.runPair(H.classic({ principal: 30000, term: 3, rate: 12, repayment: 'differentiated', reportMonth: 3 }),
      sampleDeposit(3, 2), false);
    assertEqual(other.metrics.debtAtReport, 0);
    assertEqual(other.metrics.netCapitalAtReport, 127851.03); // mortgage month 3
    assertEqual(other.deposits[0].metrics.balanceAtReport, 116834.57); // for the deposit itself, by its report.month = 2
  });

  // A deposit of 1 000 000 / 8% / 13% for 120 months with no top-ups: balance m30 1 189 457.48, m60 1 414 809.15, m120 2 001 685.03
  // (monthly gross = round2(balance · 0.08 / 12), tax = round2(gross · 0.13)).
  test('pair: the report month is the mortgage\'s report.month (N=60, deposit N=120), past the deposit horizon - the last row', function () {
    var d = H.deposit({ term: 120, reportMonth: 30, rate: 8, tax: 13, plan: { initial: 1000000 } });
    var at60 = H.runPair(H.classic({ principal: 5000000, term: 240, rate: 10, reportMonth: 60 }), d, false);
    assertEqual(at60.deposits[0].metrics.balanceAtReport, 1189457.48); // by the deposit's report.month (30)
    assertEqual(at60.metrics.netCapitalAtReport, round2(1414809.15 - at60.metrics.debtAtReport));
    var late = H.runPair(H.classic({ principal: 5000000, term: 240, rate: 10, reportMonth: 200 }), d, false);
    assertEqual(late.metrics.netCapitalAtReport, round2(2001685.03 - late.metrics.debtAtReport));
  });

  test('Metrics.compute knows nothing about a pair: the deposit fields are null, netCost = overpayment', function () {
    var m = H.classic({ principal: 30000, term: 3, rate: 12, repayment: 'differentiated', reportMonth: 2 });
    var mt = MC.sim.Metrics.compute(m, H.run(m).rows);
    assertEqual(mt.depositIncomeNet, null);
    assertEqual(mt.depositTax, null);
    assertEqual(mt.netCost, mt.overpayment);
    assertEqual(mt.netCapitalAtReport, -10000);
  });

  // ---- A pair with an interest overpayment ----

  // A deposit of 1 000 000, 8% a year, tax 13%, no top-ups (net by month - see above). Net interest
  // for the year = 71 863.72 -> goes to an overpayment in month 12, the deposit balance is 1 000 000.00 again.
  // In year 2 the balance starts from 1 000 000, so all the numbers repeat (m13 net 5800.00, m24 again 71 863.72).
  var YEAR_NET = 71863.72;
  var bigLoan = { principal: 5000000, term: 240, rate: 10 };

  function bigDeposit(term) {
    return H.deposit({ term: term || 240, rate: 8, tax: 13, plan: { initial: 1000000 } });
  }

  function pairOf(loan, deposit, useInterest) {
    return H.runPair(H.classic(loan), deposit, useInterest);
  }

  test('deposit interest to overpayment: month 12 - the net interest for the year, the debt and the deposit drop by exactly that', function () {
    var base = pairOf(bigLoan, bigDeposit(), false);
    var res = pairOf(bigLoan, bigDeposit(), true);
    var rows = res.rows;
    var dep = res.deposits[0].rows;
    assertEqual(base.deposits[0].rows[11].balance, 1071863.72);
    assertEqual(base.rows[11].overpayment, 0);
    assertEqual(rows[11].overpayment, YEAR_NET);
    assertEqual(rows[11].debtEnd, round2(base.rows[11].debtEnd - YEAR_NET));
    assertEqual(dep[11].incomeNet, 6180.96);
    assertEqual(dep[11].withdrawn, YEAR_NET);
    assertEqual(dep[11].balance, 1000000);
    assertEqual(dep[11].flow, 0);
    assertEqual(dep[11].cumFlow, 1000000);
    assertEqual(dep[11].cumIncome, YEAR_NET);
    assertEqual(dep[11].cumWithdrawn, YEAR_NET);
    for (var i = 0; i < 11; i++) {
      assertDeepEqual(rows[i], base.rows[i], 'mortgage, month ' + (i + 1));
      assertDeepEqual(dep[i], base.deposits[0].rows[i], 'deposit, month ' + (i + 1));
    }
  });

  test('deposit interest to overpayment: month 24 - interest is computed on the reduced balance', function () {
    var res = pairOf(bigLoan, bigDeposit(), true);
    var rows = res.rows;
    var dep = res.deposits[0].rows;
    assertEqual(dep[12].incomeNet, 5800); // on 1 000 000, not on 1 071 863.72
    assertEqual(dep[12].balance, 1005800);
    assertEqual(dep[23].incomeNet, 6180.96);
    assertEqual(rows[23].overpayment, YEAR_NET);
    assertEqual(dep[23].withdrawn, YEAR_NET);
    assertEqual(dep[23].balance, 1000000);
    assertEqual(dep[23].cumWithdrawn, 143727.44);     // 2 · 71 863.72
    assertEqual(dep[23].cumIncome, 143727.44);
    for (var j = 0; j < 24; j++) {
      if (j !== 11 && j !== 23) {
        assertEqual(rows[j].overpayment, 0, 'month ' + (j + 1));
        assertEqual(dep[j].withdrawn, 0, 'month ' + (j + 1));
      }
    }
  });

  test('deposit interest to overpayment: ReduceTerm shortens the term, ReducePayment recomputes the payment', function () {
    var base = pairOf(bigLoan, bigDeposit(), false).rows;
    var term = pairOf(bigLoan, bigDeposit(), true).rows;
    assertTrue(term.length < base.length, 'the term must shorten');
    assertEqual(term[12].payment, term[0].payment);
    assertEqual(term[term.length - 1].debtEnd, 0);

    var o = { principal: 5000000, term: 240, rate: 10, overEffect: 'reducePayment' };
    var pay = pairOf(o, bigDeposit(), true).rows;
    assertEqual(pay.length, 240);
    assertEqual(pay[11].payment, pay[0].payment);
    // the payment of month 13 = the annuity on the debt after the overpayment and 228 remaining months
    assertClose(pay[12].payment, H.annuity(pay[11].debtEnd, 0.1 / 12, 228), 0.0051);
    assertTrue(pay[12].payment < pay[11].payment);
  });

  test('deposit interest to overpayment: the loan closes before month 12k - no overpayment', function () {
    var o = { principal: 100000, term: 24, rate: 10, overPayments: [{ month: 3, amount: 95000 }] };
    var on = pairOf(o, bigDeposit(), true);
    assertTrue(on.rows.length < 12, 'the loan must close before month 12');
    assertDeepEqual(on.rows, pairOf(o, bigDeposit(), false).rows);
    on.deposits[0].rows.forEach(function (row) { assertEqual(row.withdrawn, 0); });
  });

  test('deposit interest to overpayment: at most the remaining debt, the deposit drops by the amount actually used', function () {
    var res = pairOf({ principal: 50000, term: 24, rate: 12 }, bigDeposit(24), true);
    var rows = res.rows;
    assertEqual(rows.length, 12);
    assertEqual(rows[11].debtEnd, 0);
    // the overpayment = the remainder after the scheduled payment of month 12 (< 71 863.72)
    var taken = round2(rows[10].debtEnd - rows[11].principal);
    assertTrue(taken < YEAR_NET);
    assertEqual(rows[11].overpayment, taken);
    assertEqual(res.deposits[0].rows[11].withdrawn, taken);
    assertEqual(res.deposits[0].rows[11].balance, round2(1071863.72 - taken));
  });

  test('deposit interest to overpayment: adds to the ordinary monthly overpayment', function () {
    var res = pairOf({ principal: 5000000, term: 240, rate: 10, overPayments: [{ amount: 1000, everyMonths: 1 }] }, bigDeposit(), true);
    assertEqual(res.rows[10].overpayment, 1000);
    assertEqual(res.rows[11].overpayment, 1000 + YEAR_NET);
    assertEqual(res.deposits[0].rows[11].balance, 1000000); // only the "for interest" part was withdrawn from the deposit
    assertEqual(res.deposits[0].rows[11].withdrawn, YEAR_NET);
  });

  // A deposit of 10 000, 12% (1% a month), tax 0. Balance after accrual: m10 11 046.22, m11 11 156.68.
  // In m11 we withdraw 11 056.68 -> 100.00 is left. M12: gross 1.00 -> 101.00; the interest for the year
  // (1156.68 + 1.00 = 1157.68) exceeds the balance, so the whole balance 101.00 goes to the overpayment.
  test('deposit interest to overpayment: the balance is below the interest - the whole balance is taken', function () {
    var d = H.deposit({
      term: 60, rate: 12, tax: 0,
      plan: { initial: 10000, payments: [{ month: 11, amount: -11056.68 }] }
    });
    var res = pairOf({ principal: 500000, term: 60, rate: 10 }, d, true);
    var dep = res.deposits[0].rows;
    assertEqual(dep[10].balance, 100);
    assertEqual(dep[11].incomeNet, 1);
    assertEqual(res.rows[11].overpayment, 101);
    assertEqual(dep[11].withdrawn, 101);
    assertEqual(dep[11].balance, 0);
    assertEqual(dep[11].flow, 0);
    assertEqual(dep[11].cumFlow, -1056.68);            // 10 000 - 11 056.68
    assertEqual(dep[11].cumIncome, 1157.68);
    assertEqual(dep[11].cumWithdrawn, 101);
  });

  test('deposit interest to overpayment: the balance invariant and the pair metrics', function () {
    var plans = [
      { initial: 500000, payments: [{ amount: 5000, everyMonths: 1 }, { month: 30, amount: -100000 }] },
      { initial: 200000, payments: [{ amount: -3000, everyMonths: 1 }] },
      { initial: 0, payments: [{ amount: 20000, everyMonths: 1 }, { month: 14, amount: 10000000 }] }
    ];
    plans.forEach(function (plan, s) {
      var d = H.deposit({ term: 120, rate: 8, tax: 13, plan: plan });
      var res = pairOf({ principal: 3000000, term: 120, rate: 10 }, d, true);
      var dep = res.deposits[0].rows;
      assertEqual(dep.length, 120);
      dep.forEach(function (row, i) {
        var label = 'scenario ' + s + ', month ' + (i + 1);
        assertEqual(row.balance, round2(row.cumFlow + row.cumIncome - row.cumWithdrawn), label);
        assertTrue(row.balance >= 0, label);
      });
      var income = 0;
      var tax = 0;
      dep.forEach(function (row) { income = round2(income + row.incomeNet); tax = round2(tax + row.tax); });
      assertEqual(res.metrics.depositIncomeNet, income);
      assertEqual(res.metrics.depositTax, tax);
      assertEqual(res.deposits[0].metrics.incomeNet, income);
      assertEqual(res.metrics.totalPaid, round2(H.sum(res.rows, 'payment') + H.sum(res.rows, 'overpayment')));
      assertEqual(res.metrics.overpayment, H.sum(res.rows, 'interest'));
      assertEqual(res.rows[res.rows.length - 1].cumPrincipal, 3000000);
      assertEqual(res.metrics.netCost, round2(res.metrics.overpayment - income));
      // withdrawals for overpayments = an overpayment by the deposit's rule: there are none with ordinary rules here
      assertEqual(dep[119].cumWithdrawn, H.sum(res.rows, 'overpayment'));
    });
  });

  // ---- The deposit horizon ----

  // A 30 000 / 3-month mortgage; a 36-month deposit (without useInterest) keeps growing after the loan closes.
  test('a deposit longer than the mortgage: keeps growing after the loan closes up to its termMonths', function () {
    var m = H.classic({ principal: 30000, term: 3, rate: 12, repayment: 'differentiated' });
    var d = sampleDeposit(36, 36);
    var res = H.runPair(m, d, false);
    assertEqual(res.rows.length, 3);
    assertEqual(res.deposits[0].rows.length, 36);
    assertDeepEqual(res.deposits[0].rows, H.run(d).rows);
    // m4: gross = round2(127 851.03 · 1%) = 1278.51, tax = round2(166.2063) = 166.21, net 1112.30;
    // balance 127 851.03 + 1112.30 + 10 000 (top-up) = 138 963.33
    var r4 = res.deposits[0].rows[3];
    assertEqual(r4.tax, 166.21);
    assertEqual(r4.incomeNet, 1112.3);
    assertEqual(r4.balance, 138963.33);
    assertEqual(res.deposits[0].metrics.finalBalance, res.deposits[0].rows[35].balance);
    assertTrue(res.deposits[0].metrics.finalBalance > 127851.03);
  });

  // An 18-month deposit of 1 000 000 (8%, 13%), a 240-month mortgage with useInterest: an overpayment in m12, none in m24.
  // The balance of m13..18 repeats year 1 (m18: 1 035 308.52), net of m13..18 = 5800.00 + 5833.64 + 5867.47 + 5901.51 + 5935.73 + 5970.17 = 35 308.52.
  test('a deposit shorter than the mortgage: after termMonths the deposit freezes, no interest overpayment', function () {
    var res = pairOf(bigLoan, bigDeposit(18), true);
    var dep = res.deposits[0].rows;
    assertEqual(dep.length, 18);
    assertEqual(res.rows[11].overpayment, YEAR_NET);
    assertEqual(res.rows[23].overpayment, 0);
    assertEqual(dep[17].balance, 1035308.52);
    assertEqual(res.deposits[0].metrics.finalBalance, 1035308.52);
    assertEqual(res.deposits[0].metrics.incomeNet, 107172.24);   // 71 863.72 + 35 308.52
    assertEqual(res.deposits[0].metrics.contributed, 1000000);
    assertEqual(res.metrics.depositIncomeNet, 107172.24);
    assertTrue(res.rows.length > 18);
  });

  // ---- Alignment by dates ----

  // A deposit of 100 000, 12% (1% a month), tax 0, no operations. Net interest by deposit month:
  //   j1 1000.00 -> 101 000.00; j2 1010.00 -> 102 010.00; j3 1020.10 -> 103 030.10; j4 1030.30 -> 104 060.40;
  //   j5 1040.60 -> 105 101.00; j6 1051.01 -> 106 152.01; j7 1061.52 -> 107 213.53
  function plainDeposit(start) {
    return H.deposit({ term: 60, rate: 12, tax: 0, plan: { initial: 100000 }, start: start });
  }
  var bigMortgage = { principal: 5000000, term: 240, rate: 10, start: { year: 2027, month: 1 } };

  test('DepositRow.date: month k = startDate + (k - 1); a standalone deposit runs on its own axis', function () {
    var rows = H.run(plainDeposit({ year: 2026, month: 11 })).rows;
    assertDeepEqual(rows[0].date, { year: 2026, month: 11 });
    assertDeepEqual(rows[2].date, { year: 2027, month: 1 });
    assertEqual(rows[5].balance, 106152.01);
    assertEqual(rows[0].month, 1);
  });

  // The deposit started 6 months before the mortgage (2026-07 vs 2027-01): offsetMonths = 6.
  // At mortgage month 1 (= deposit month 7) the balance is 107 213.53. The overpayment in mortgage month 12 (= j18) takes the net
  // interest for j7..j18 - that is 12 months (not j1..j12).
  test('a deposit started before the mortgage: a pre-run, the first overpayment takes the interest of deposit months 7..18', function () {
    var d = plainDeposit({ year: 2026, month: 7 });
    var alone = H.run(plainDeposit({ year: 2026, month: 7 })).rows;
    var res = H.runPair(H.classic(bigMortgage), d, true);
    var dep = res.deposits[0].rows;
    assertEqual(res.deposits[0].offsetMonths, 6);
    assertEqual(dep.length, 60);
    assertDeepEqual(dep[6].date, { year: 2027, month: 1 }); // j7 is mortgage month 1
    assertEqual(dep[5].balance, 106152.01);
    assertEqual(dep[6].balance, 107213.53);
    var sum = 0;
    for (var j = 7; j <= 18; j++) { sum = round2(sum + alone[j - 1].incomeNet); }
    assertEqual(res.rows[11].overpayment, sum);
    assertEqual(dep[17].withdrawn, sum);
    for (var i = 0; i < 17; i++) { assertEqual(dep[i].withdrawn, 0, 'j' + (i + 1)); }
    assertEqual(res.rows[5].overpayment, 0); // m6 (j12) is not a mortgage year end
    assertTrue(sum !== alone[11].cumIncome); // not the interest of j1..j12
    // metric: the mortgage's report.month 1 -> j = 7
    var mt = H.runPair(H.classic(bigMortgage), plainDeposit({ year: 2026, month: 7 }), false).metrics;
    assertEqual(mt.netCapitalAtReport, round2(107213.53 - mt.debtAtReport));
  });

  // The deposit started 6 months later (2027-07 vs 2027-01): offsetMonths = -6, j = m - 6.
  // Mortgage months 1..6 - the deposit is inactive (balance 0); m7 = j1 (balance 101 000.00, plan.initial appears here).
  // Mortgage month 12 = j6: only the interest of the 6 existing months j1..j6 is available = 1000 + 1010 + 1020.10 + 1030.30 + 1040.60 + 1051.01 = 6152.01.
  test('a deposit started after the mortgage: balance 0 before its start, in month 12 the interest of 6 months is available', function () {
    var res = H.runPair(H.classic(bigMortgage), plainDeposit({ year: 2027, month: 7 }), true);
    var dep = res.deposits[0].rows;
    assertEqual(res.deposits[0].offsetMonths, -6);
    assertEqual(dep.length, 60);
    assertEqual(dep[0].month, 1);
    assertDeepEqual(dep[0].date, { year: 2027, month: 7 });
    assertEqual(dep[0].balance, 101000);
    for (var m = 1; m <= 11; m++) { assertEqual(res.rows[m - 1].overpayment, 0, 'm' + m); }
    assertEqual(res.rows[11].overpayment, 6152.01);
    assertEqual(dep[5].withdrawn, 6152.01);
    assertEqual(dep[5].balance, 100000);
    // metrics: report.month 6 -> j0 (the deposit has not started) -> 0; report.month 7 -> j1
    var base = function (rm) {
      return H.runPair(H.classic({ principal: 5000000, term: 240, rate: 10, reportMonth: rm }), plainDeposit({ year: 2027, month: 7 }), false).metrics;
    };
    assertEqual(base(6).netCapitalAtReport, -base(6).debtAtReport);
    assertEqual(base(7).netCapitalAtReport, round2(101000 - base(7).debtAtReport));
  });

  test('a deposit started earlier and shorter: after termMonths the last row\'s balance; offsetMonths in the result', function () {
    // a 3-month deposit from 2026-07, a mortgage from 2027-01: by its start the deposit has ended (j7 > 3) -> the balance of j3 = 103 030.10
    var d = H.deposit({ term: 3, rate: 12, tax: 0, plan: { initial: 100000 }, start: { year: 2026, month: 7 } });
    var res = H.runPair(H.classic({ principal: 30000, term: 3, rate: 12, repayment: 'differentiated', reportMonth: 1,
      start: { year: 2027, month: 1 } }), d, true);
    assertEqual(res.deposits[0].rows.length, 3);
    assertEqual(res.deposits[0].offsetMonths, 6);
    assertEqual(res.metrics.netCapitalAtReport, round2(103030.1 - res.metrics.debtAtReport));
    assertEqual(H.run(d).error, null);
  });

  // ---- One deposit on two mortgages; Simulation.run ----

  test('one deposit on two mortgages: results are independent, the deposit product is unchanged by pairs', function () {
    var m1 = H.classic({ id: 'm1', principal: 5000000, term: 240, rate: 10 });
    var m2 = H.classic({ id: 'm2', principal: 50000, term: 24, rate: 12 });
    var d = bigDeposit(24);
    var p = H.portfolio([m1, m2, d]);
    p.addLink('m1', d.id); p.setUseInterest('m1', d.id, true);
    p.addLink('m2', d.id); p.setUseInterest('m2', d.id, true);
    var before = JSON.stringify(d.toJSON());
    var res = MC.sim.Simulation.run(p);
    assertEqual(JSON.stringify(d.toJSON()), before);

    var single1 = H.runPair(H.classic({ id: 'm1', principal: 5000000, term: 240, rate: 10 }), bigDeposit(24), true);
    var single2 = H.runPair(H.classic({ id: 'm2', principal: 50000, term: 24, rate: 12 }), bigDeposit(24), true);
    assertDeepEqual(res.m1, single1);
    assertDeepEqual(res.m2, single2);
    // for m1 the deposit gave 71 863.72, for m2 less (limited by the remaining debt): the deposit states differ
    assertEqual(res.m1.deposits[0].rows[11].withdrawn, YEAR_NET);
    assertTrue(res.m2.deposits[0].rows[11].withdrawn < YEAR_NET);
    assertEqual(res.m1.deposits[0].rows[11].balance, 1000000);
    assertTrue(res.m2.deposits[0].rows[11].balance > 1000000);
    // the deposit itself as a product - no withdrawals
    assertDeepEqual(res[d.id].rows, H.run(bigDeposit(24)).rows);
    assertEqual(res[d.id].rows[11].withdrawn, 0);
    assertEqual(res[d.id].rows[11].balance, 1071863.72);
  });

  test('Simulation.run: a portfolio of a linked classic mortgage, an offset mortgage and a deposit', function () {
    var c = H.classic({ id: 'c', principal: 30000, term: 3, rate: 12, repayment: 'differentiated' });
    var o = H.offset({ id: 'o', principal: 120000, term: 12, rate: 12, repayment: 'differentiated',
      offset: { initial: 50000 }, offsetEffect: 'offsetReducesPayment' });
    var d = sampleDeposit(3, 3);
    var p = H.portfolio([c, o, d]);
    p.addLink('c', d.id);
    var res = MC.sim.Simulation.run(p);
    assertDeepEqual(Object.keys(res).sort(), ['c', 'o', d.id].sort());

    assertEqual(res.c.rows.length, 3);
    assertEqual(res.c.error, null);
    assertEqual(res.c.deposits[0].depositId, d.id);
    assertEqual(res.c.metrics.depositIncomeNet, 2851.03);
    assertEqual(res.c.metrics.netCost, -2251.03);

    assertEqual(res.o.rows.length, 12);
    assertDeepEqual(res.o.deposits, []);
    assertEqual(res.o.metrics.depositIncomeNet, null);
    assertEqual(res.o.metrics.overpayment, 2800);
    assertEqual(res.o.rows[0].accountBalance, 50000);

    assertEqual(res[d.id].rows.length, 3);
    assertEqual(res[d.id].error, null);
    assertEqual(res[d.id].metrics.finalBalance, 127851.03);
    assertEqual(res[d.id].metrics.taxPaid, 426.02);
  });

  test('a mortgage ScheduleRow has no deposit fields; a classic one has accountBalance = null', function () {
    var row = H.run(H.classic({ principal: 30000, term: 3, rate: 12 })).rows[0];
    ['depositIncomeNet', 'depositTax', 'depositFlow', 'cumDepositFlow', 'cumDepositIncome'].forEach(function (k) {
      assertEqual(k in row, false, k);
    });
    assertEqual(row.accountBalance, null);
  });

  // ---- Several deposits on one mortgage ----

  // A mortgage run with deposits links = [[deposit, useInterest], ...] (links in this order).
  function runMulti(loan, links) {
    var m = H.classic(loan);
    var p = H.portfolio([m].concat(links.map(function (l) { return l[0]; })));
    links.forEach(function (l) {
      p.addLink(m.id, l[0].id);
      p.setUseInterest(m.id, l[0].id, l[1]);
    });
    return MC.sim.Simulation.run(p)[m.id];
  }

  function bigDep(id) {
    var d = bigDeposit();
    d.id = id;
    return d;
  }

  test('two deposits, both useInterest: the month 12 overpayment = the sum of both net interests', function () {
    var res = runMulti(bigLoan, [[bigDep('d1'), true], [bigDep('d2'), true]]);
    assertEqual(res.deposits.length, 2);
    assertDeepEqual(res.deposits.map(function (d) { return d.depositId; }), ['d1', 'd2']); // link order
    assertEqual(res.rows[10].overpayment, 0);
    assertEqual(res.rows[11].overpayment, 143727.44);       // 2 · 71 863.72
    res.deposits.forEach(function (d) {
      assertEqual(d.rows[11].withdrawn, YEAR_NET);
      assertEqual(d.rows[11].balance, 1000000);
    });
  });

  test('two deposits, useInterest only on the second: overpayment = the second\'s interest, the first is untouched', function () {
    var res = runMulti(bigLoan, [[bigDep('d1'), false], [bigDep('d2'), true]]);
    assertEqual(res.rows[11].overpayment, YEAR_NET);
    assertEqual(res.deposits[0].rows[11].withdrawn, 0);
    assertEqual(res.deposits[0].rows[11].balance, 1071863.72);
    assertEqual(res.deposits[1].rows[11].withdrawn, YEAR_NET);
    assertEqual(res.deposits[1].rows[11].balance, 1000000);
    // the result with one link (d2) equals that of a mortgage with one deposit
    var single = runMulti(bigLoan, [[bigDep('d2'), true]]);
    assertDeepEqual(single.rows, res.rows);
  });

  test('the remaining-debt limit is distributed in link order', function () {
    // The debt after the scheduled payment of m12 lies between 71 863.72 and 2 · 71 863.72
    var res = runMulti({ principal: 150000, term: 24, rate: 10 }, [[bigDep('d1'), true], [bigDep('d2'), true]]);
    var rows = res.rows;
    assertEqual(rows.length, 12);
    assertEqual(rows[11].debtEnd, 0);
    var remaining = round2(rows[10].debtEnd - rows[11].principal);
    assertTrue(remaining > YEAR_NET && remaining < 2 * YEAR_NET);
    assertEqual(rows[11].overpayment, remaining);
    assertEqual(res.deposits[0].rows[11].withdrawn, YEAR_NET); // the first takes the full amount
    assertEqual(res.deposits[1].rows[11].withdrawn, round2(remaining - YEAR_NET)); // the second gets what is left of the limit
  });

  test('pair metrics as a sum over deposits (netCost, netCapitalAtReport, each with its own offsetMonths)', function () {
    var m = { principal: 30000, term: 3, rate: 12, repayment: 'differentiated', reportMonth: 2 };
    var a = sampleDeposit(3, 3); a.id = 'a';
    var b = sampleDeposit(3, 3); b.id = 'b';
    b.startDate = { year: 2026, month: 11 }; // started 2 months before the mortgage: offsetMonths = 2
    var res = runMulti(m, [[a, false], [b, false]]);
    assertEqual(res.deposits[0].offsetMonths, 0);
    assertEqual(res.deposits[1].offsetMonths, 2);
    assertEqual(res.metrics.overpayment, 600);
    assertEqual(res.metrics.depositIncomeNet, 5702.06);        // 2 · 2851.03
    assertEqual(res.metrics.depositTax, 852.04);               // 2 · 426.02
    assertEqual(res.metrics.netCost, -5102.06);                // 600 - 5702.06
    // report at mortgage m2: deposit a - 116 834.57 (j=2); deposit b - j=4 > termMonths, the last row's balance 127 851.03
    assertEqual(res.metrics.netCapitalAtReport, 234685.6);     // 116 834.57 + 127 851.03 - 10 000
  });

  test('a mortgage with one deposit through Simulation.run: an array of one element, metrics as for a pair', function () {
    var res = runMulti({ principal: 30000, term: 3, rate: 12, repayment: 'differentiated', reportMonth: 2 }, [[sampleDeposit(3, 3), false]]);
    assertEqual(res.deposits.length, 1);
    assertEqual(res.metrics.netCost, -2251.03);
    assertEqual(res.metrics.netCapitalAtReport, 106834.57);
  });
})();
