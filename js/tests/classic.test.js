// Tests of the classic mortgage simulation and metrics. Expected values are computed by hand / by formulas.
// NOTE: offset.test.js and deposit.test.js use the MC.tests.sim helpers declared below,
// so this file must be loaded before them.
(function () {
  'use strict';

  var round2 = MC.core.round2;

  // Shared helpers for the classic/offset/deposit simulation tests.
  var H = {};
  MC.tests = MC.tests || {};
  MC.tests.sim = H;

  // opts: principal, term, rate | rates, repayment, overPayments [{amount, everyMonths} | {amount, month}], overEffect,
  //       start, reportMonth, id; offset {initial, payments}, offsetEffect (offset mortgage)
  H.make = function (kind, o) {
    var json = {
      kind: kind,
      id: o.id || 'test-' + kind,
      name: 'test',
      terms: { principal: o.principal, termMonths: o.term, startDate: o.start || { year: 2027, month: 1 } },
      rates: { entries: o.rates || [{ fromMonth: 1, annualRate: o.rate }] },
      repayment: { kind: o.repayment || 'annuity' },
      overpayments: {
        payments: o.overPayments || [],
        effect: { kind: o.overEffect || 'reduceTerm' }
      },
      report: { month: o.reportMonth || 1 }
    };
    if (o.fees) { json.fees = o.fees; }
    if (kind === 'offset') {
      var acc = o.offset || {};
      json.offsetAccount = { initial: acc.initial || 0, payments: acc.payments || [] };
      json.offsetEffect = { kind: o.offsetEffect || 'offsetReducesTerm' };
    }
    return MC.domain.ProductRegistry.fromJSON(json);
  };

  H.classic = function (o) { return H.make('classic', o); };
  H.offset = function (o) { return H.make('offset', o); };

  // A deposit. opts: term (termMonths), plan {initial, payments}, rate, tax, reportMonth, id, start (by default as the mortgage's).
  H.deposit = function (o) {
    return MC.domain.ProductRegistry.fromJSON({
      kind: 'deposit',
      id: o.id || 'test-deposit',
      name: 'test',
      termMonths: o.term,
      startDate: o.start || { year: 2027, month: 1 },
      plan: { initial: o.plan.initial || 0, payments: o.plan.payments || [] },
      rates: { entries: o.rates || [{ fromMonth: 1, annualRate: o.rate }] },
      taxRate: o.tax,
      report: { month: o.reportMonth || 1 }
    });
  };

  H.portfolio = function (products, links) {
    return new MC.domain.Portfolio({ products: products, links: links || [] });
  };

  // The result of a single product (through Simulation.run of a one-product portfolio).
  H.run = function (product) {
    return MC.sim.Simulation.run(H.portfolio([product]))[product.id];
  };

  // A mortgage's result paired with a deposit: a portfolio with one link.
  H.runPair = function (mortgage, deposit, useInterest) {
    var p = H.portfolio([mortgage, deposit]);
    p.addLink(mortgage.id, deposit.id);
    p.setUseInterest(mortgage.id, deposit.id, useInterest === true);
    return MC.sim.Simulation.run(p)[mortgage.id];
  };

  H.sum = function (rows, field) {
    var s = 0;
    rows.forEach(function (row) { s = round2(s + row[field]); });
    return s;
  };

  // The annuity payment by the formula (unrounded).
  H.annuity = function (debt, r, n) {
    var g = Math.pow(1 + r, n);
    return debt * r * g / (g - 1);
  };

  test('annuity 1 000 000 / 12% / 120: payment 14 347.09, principal sum = principal, debt 0', function () {
    var res = H.run(H.classic({ principal: 1000000, term: 120, rate: 12 }));
    var rows = res.rows;
    assertEqual(res.error, null);
    assertEqual(rows.length, 120);
    assertEqual(rows[0].payment, 14347.09);
    assertEqual(rows[0].interest, 10000);
    assertEqual(rows[0].principal, 4347.09);
    assertEqual(rows[0].debtEnd, 995652.91);
    assertEqual(rows[0].rate, 12);
    assertEqual(rows[0].accountBalance, null);
    assertDeepEqual(res.deposits, []);
    assertEqual(rows[118].payment, 14347.09);
    // a shortfall from rounding the payment down accumulates and is repaid by the last payment
    var shortfall = (H.annuity(1000000, 0.01, 120) - 14347.09) * (Math.pow(1.01, 120) - 1) / 0.01;
    assertClose(rows[119].payment, 14347.09 + shortfall, 0.5);
    assertEqual(rows[119].debtEnd, 0);
    assertEqual(H.sum(rows, 'principal'), 1000000);
    assertDeepEqual(rows[0].date, { year: 2027, month: 1 });
    assertDeepEqual(rows[12].date, { year: 2028, month: 1 });
    assertDeepEqual(rows[119].date, { year: 2036, month: 12 });
  });

  // 120 000, 12 months, 12%: principal share 10 000; interest 1200, 1100, ..., 100.
  test('differentiated: the principal share is constant, the payment decreases, debt 0', function () {
    var res = H.run(H.classic({ principal: 120000, term: 12, rate: 12, repayment: 'differentiated' }));
    var rows = res.rows;
    assertEqual(rows.length, 12);
    for (var i = 0; i < 12; i++) {
      assertEqual(rows[i].principal, 10000, 'principal, month ' + (i + 1));
      assertEqual(rows[i].payment, 10000 + (12 - i) * 100, 'payment, month ' + (i + 1));
      assertEqual(rows[i].debtEnd, 120000 - 10000 * (i + 1), 'debt, month ' + (i + 1));
    }
    assertEqual(rows[0].payment, 11200);
    assertEqual(rows[11].payment, 10100);
    assertEqual(H.sum(rows, 'interest'), 7800);
  });

  test('cumulative totals: annuity - the last row matches the metrics and principal', function () {
    var res = H.run(H.classic({ principal: 1000000, term: 120, rate: 12 }));
    var rows = res.rows;
    assertEqual(rows[0].cumInterest, 10000);
    assertEqual(rows[0].cumPrincipal, 4347.09);
    assertEqual(rows[1].cumInterest, 19956.53);      // 10 000 + 9956.53
    assertEqual(rows[1].cumPrincipal, 8737.65);      // 4347.09 + 4390.56
    assertEqual(rows[119].cumInterest, res.metrics.overpayment);
    assertEqual(rows[119].cumPrincipal, 1000000);
  });

  test('cumulative totals: differentiated, cumPrincipal includes overpayments', function () {
    var plain = H.run(H.classic({ principal: 120000, term: 12, rate: 12, repayment: 'differentiated' })).rows;
    assertEqual(plain[0].cumInterest, 1200);
    assertEqual(plain[1].cumInterest, 2300);
    assertEqual(plain[2].cumInterest, 3300);
    assertEqual(plain[2].cumPrincipal, 30000);
    assertEqual(plain[11].cumInterest, 7800);

    var over = H.run(H.classic({
      principal: 120000, term: 12, rate: 12, repayment: 'differentiated',
      overPayments: [{ month: 3, amount: 30000 }]
    }));
    var rows = over.rows;
    assertEqual(rows[1].cumPrincipal, 20000);
    assertEqual(rows[2].cumPrincipal, 60000);         // 3 × 10 000 + an overpayment of 30 000
    assertEqual(rows[2].cumPrincipal, 120000 - rows[2].debtEnd);
    assertEqual(rows[2].cumOverpayment, 30000);
    assertEqual(rows[rows.length - 1].cumPrincipal, 120000);
    assertEqual(rows[rows.length - 1].cumInterest, over.metrics.overpayment);
  });

  test('rate 0%: annuity and differentiated without interest', function () {
    ['annuity', 'differentiated'].forEach(function (kind) {
      var res = H.run(H.classic({ principal: 120000, term: 12, rate: 0, repayment: kind }));
      assertEqual(res.rows.length, 12, kind);
      res.rows.forEach(function (row) {
        assertEqual(row.interest, 0, kind);
        assertEqual(row.payment, 10000, kind);
      });
      assertEqual(res.rows[11].debtEnd, 0, kind);
      assertEqual(res.metrics.overpayment, 0, kind);
      assertEqual(res.metrics.totalPaid, 120000, kind);
    });
    // 100 000 / 3 does not divide evenly: the last payment is adjusted (33 333.33 + 33 333.33 + 33 333.34)
    var odd = H.run(H.classic({ principal: 100000, term: 3, rate: 0 })).rows;
    assertEqual(odd[0].payment, 33333.33);
    assertEqual(odd[2].payment, 33333.34);
    assertEqual(odd[2].debtEnd, 0);
  });

  test('rate change, annuity: the payment is recomputed for the remaining debt and term', function () {
    var rates = [{ fromMonth: 1, annualRate: 12 }, { fromMonth: 7, annualRate: 6 }];
    var rows = H.run(H.classic({ principal: 120000, term: 12, rates: rates })).rows;
    assertEqual(rows.length, 12);
    assertClose(rows[0].payment, H.annuity(120000, 0.01, 12), 0.0051);
    assertEqual(rows[5].payment, rows[0].payment);
    var d6 = rows[5].debtEnd;
    assertEqual(rows[6].rate, 6);
    assertEqual(rows[6].interest, round2(d6 * 0.005));
    assertClose(rows[6].payment, H.annuity(d6, 0.005, 6), 0.0051);
    assertTrue(rows[6].payment < rows[5].payment, 'the payment must decrease');
    assertEqual(rows[10].payment, rows[6].payment);
    assertEqual(rows[11].debtEnd, 0);
    assertEqual(H.sum(rows, 'principal'), 120000);
  });

  test('rate change, differentiated: only the interest changes', function () {
    var rates = [{ fromMonth: 1, annualRate: 12 }, { fromMonth: 7, annualRate: 6 }];
    var rows = H.run(H.classic({ principal: 120000, term: 12, rates: rates, repayment: 'differentiated' })).rows;
    assertEqual(rows.length, 12);
    rows.forEach(function (row) { assertEqual(row.principal, 10000); });
    // month 6: debt at start 70 000 -> 700 at 1%; month 7: debt 60 000 -> 300 at 0.5%
    assertEqual(rows[5].interest, 700);
    assertEqual(rows[5].payment, 10700);
    assertEqual(rows[6].interest, 300);
    assertEqual(rows[6].payment, 10300);
    assertEqual(rows[11].debtEnd, 0);
  });

  // 120 000, 12 months, 12%, a one-off overpayment of 30 000 in month 3 (debt after the payment 90 000 -> 60 000).
  test('overpayment, differentiated: ReduceTerm shortens the term', function () {
    var rows = H.run(H.classic({
      principal: 120000, term: 12, rate: 12, repayment: 'differentiated',
      overPayments: [{ month: 3, amount: 30000 }], overEffect: 'reduceTerm'
    })).rows;
    assertEqual(rows[2].overpayment, 30000);
    assertEqual(rows[2].debtEnd, 60000);
    assertEqual(rows.length, 9);                 // 3 + 60 000 / 10 000
    assertEqual(rows[3].payment, 10600); // 10 000 + 1% of 60 000
    assertEqual(rows[8].debtEnd, 0);
  });

  test('overpayment, differentiated: ReducePayment lowers the payment with the same term', function () {
    var rows = H.run(H.classic({
      principal: 120000, term: 12, rate: 12, repayment: 'differentiated',
      overPayments: [{ month: 3, amount: 30000 }], overEffect: 'reducePayment'
    })).rows;
    assertEqual(rows.length, 12);
    assertEqual(rows[3].principal, 6666.67);     // round2(60 000 / 9)
    assertEqual(rows[3].payment, 7266.67); // + 600 interest
    assertEqual(rows[11].debtEnd, 0);
    assertEqual(H.sum(rows, 'principal') + 30000, 120000);
  });

  test('overpayment, annuity: ReduceTerm - the same payment, a shorter term', function () {
    var res = H.run(H.classic({
      principal: 1000000, term: 120, rate: 12,
      overPayments: [{ month: 12, amount: 200000 }], overEffect: 'reduceTerm'
    }));
    var rows = res.rows;
    assertEqual(rows[11].overpayment, 200000);
    assertEqual(rows[12].payment, 14347.09);
    // n = ln(P / (P - D*r)) / ln(1+r) months after the 12th
    var d = rows[11].debtEnd;
    var n = Math.log(14347.09 / (14347.09 - d * 0.01)) / Math.log(1.01);
    assertTrue(rows.length < 120);
    assertTrue(Math.abs(rows.length - (12 + Math.ceil(n))) <= 1, 'length ' + rows.length + ', expected ' + (12 + Math.ceil(n)) + ' ±1');
    assertEqual(rows[rows.length - 1].debtEnd, 0);
  });

  test('overpayment, annuity: ReducePayment - a lower payment, the same term', function () {
    var res = H.run(H.classic({
      principal: 1000000, term: 120, rate: 12,
      overPayments: [{ month: 12, amount: 200000 }], overEffect: 'reducePayment'
    }));
    var rows = res.rows;
    assertEqual(rows.length, 120);
    assertEqual(rows[11].payment, 14347.09);
    assertClose(rows[12].payment, H.annuity(rows[11].debtEnd, 0.01, 108), 0.0051);
    assertTrue(rows[12].payment < 14347.09);
    assertEqual(rows[119].debtEnd, 0);
  });

  test('an overpayment is at most the remaining debt; a monthly overpayment', function () {
    var big = H.run(H.classic({
      principal: 120000, term: 12, rate: 12, repayment: 'differentiated',
      overPayments: [{ month: 2, amount: 1000000000 }]
    })).rows;
    assertEqual(big.length, 2);
    assertEqual(big[1].overpayment, 120000 - 10000 - 10000);
    assertEqual(big[1].debtEnd, 0);

    // each month: principal 10 000 + overpayment 10 000; interest on 120, 100, 80, 60, 40, 20 thousand
    var monthly = H.run(H.classic({
      principal: 120000, term: 12, rate: 12, repayment: 'differentiated', overPayments: [{ amount: 10000, everyMonths: 1 }]
    })).rows;
    assertEqual(monthly.length, 6);
    assertEqual(H.sum(monthly, 'interest'), 4200);
    assertEqual(monthly[5].overpayment, 10000);
    assertEqual(monthly[5].debtEnd, 0);
  });

  // A regular overpayment: the rule {amount, everyMonths} pays in months M, 2M, 3M...
  test('a regular overpayment every 12 months, ReduceTerm: payments only in months 12/24/36', function () {
    // 480 000, 48 months, 12%, differentiated, principal share 10 000; overpayment 20 000 every 12 months
    // m12: 480 000 - 120 000 - 20 000 = 340 000; m24: 340 000 - 120 000 - 20 000 = 200 000;
    // m36: 200 000 - 120 000 - 20 000 = 60 000; then 6 payments of 10 000 -> closes in m42
    var rows = H.run(H.classic({
      principal: 480000, term: 48, rate: 12, repayment: 'differentiated',
      overPayments: [{ amount: 20000, everyMonths: 12 }], overEffect: 'reduceTerm'
    })).rows;
    assertEqual(rows.length, 42);
    assertEqual(rows[11].debtEnd, 340000);
    assertEqual(rows[23].debtEnd, 200000);
    assertEqual(rows[35].debtEnd, 60000);
    rows.forEach(function (row, i) {
      var expected = (i === 11 || i === 23 || i === 35) ? 20000 : 0;
      assertEqual(row.overpayment, expected, 'overpayment, month ' + (i + 1));
    });
    assertEqual(rows[41].debtEnd, 0);
  });

  test('a regular overpayment every 3 months: ReducePayment recomputes the principal share, ReduceTerm shortens the term', function () {
    // 120 000, 12 months, 12%, differentiated; 9 000 in months 3, 6, 9 (ReducePayment):
    //   m3: 90 000 - 9 000 = 81 000, principal 81 000 / 9 = 9000; m6: 54 000 - 9 000 = 45 000, principal 45 000 / 6 = 7500;
    //   m9: 22 500 - 9 000 = 13 500, principal 13 500 / 3 = 4500. Payments: m4 9000 + 810, m7 7500 + 450, m10 4500 + 135.
    var pay = H.run(H.classic({
      principal: 120000, term: 12, rate: 12, repayment: 'differentiated',
      overPayments: [{ amount: 9000, everyMonths: 3 }], overEffect: 'reducePayment'
    })).rows;
    assertEqual(pay.length, 12);
    assertDeepEqual(pay.map(function (r) { return r.overpayment; }), [0, 0, 9000, 0, 0, 9000, 0, 0, 9000, 0, 0, 0]);
    assertEqual(pay[3].payment, 9810);
    assertEqual(pay[6].payment, 7950);
    assertEqual(pay[9].payment, 4635);
    assertEqual(pay[11].debtEnd, 0);

    // ReduceTerm, 10 000 each in months 3, 6, 9: debt 90 000 -> 80 000 -> 50 000 -> 40 000 -> 10 000 -> 0 in m9
    var term = H.run(H.classic({
      principal: 120000, term: 12, rate: 12, repayment: 'differentiated',
      overPayments: [{ amount: 10000, everyMonths: 3 }], overEffect: 'reduceTerm'
    })).rows;
    assertEqual(term.length, 9);
    assertDeepEqual(term.map(function (r) { return r.overpayment; }), [0, 0, 10000, 0, 0, 10000, 0, 0, 10000]);
    assertEqual(term[8].debtEnd, 0);
  });

  test('a regular overpayment: several rules add up (every month + every 12)', function () {
    // differentiated 120 000 / 24 months (principal 5000): 1000 every month + 5000 every 12 months -> 6000 overpayment in m12
    var rows = H.run(H.classic({
      principal: 120000, term: 24, rate: 12, repayment: 'differentiated',
      overPayments: [{ amount: 1000, everyMonths: 1 }, { amount: 5000, everyMonths: 12 }]
    })).rows;
    assertEqual(rows[0].overpayment, 1000);
    assertEqual(rows[10].overpayment, 1000);
    assertEqual(rows[11].overpayment, 6000);
    assertTrue(rows.length < 24);
    assertEqual(MC.core.round2(H.sum(rows, 'principal') + H.sum(rows, 'overpayment')), 120000);
    assertEqual(rows[rows.length - 1].debtEnd, 0);
  });

  test('annuity + ReduceTerm + rate change (a provisional decision): the debt closes, no later than the term', function () {
    var res = H.run(H.classic({
      principal: 1000000, term: 120,
      rates: [{ fromMonth: 1, annualRate: 12 }, { fromMonth: 37, annualRate: 8 }],
      overPayments: [{ month: 24, amount: 300000 }], overEffect: 'reduceTerm'
    }));
    var rows = res.rows;
    assertEqual(res.error, null);
    assertTrue(rows.length < 120);
    assertEqual(rows[rows.length - 1].debtEnd, 0);
    // The payment from month 37 = the annuity on the debt, the 8% rate and the term in which the debt would be repaid
    // by the old payment at the old rate of 12%: n = ln(P / (P - d*r)) / ln(1+r).
    var d = rows[35].debtEnd;
    var p = rows[35].payment;
    var nOld = Math.log(p / (p - d * 0.01)) / Math.log(1.01);
    assertEqual(rows[36].rate, 8);
    assertClose(rows[36].payment, H.annuity(d, 0.08 / 12, Math.ceil(nOld)), 0.5);
    assertTrue(rows[36].payment < p);
  });

  test('the payment does not cover the interest: error paymentTooLow, the schedule breaks off', function () {
    var m = H.classic({ principal: 100000, term: 12, rate: 12 });
    m.repayment = { kind: 'annuity', payment: function () { return 1; }, principalPart: function () { return 1; } };
    var res = H.run(m);
    assertEqual(res.error, 'paymentTooLow');
    assertEqual(res.rows.length, 0);
    assertEqual(res.metrics.actualTermMonths, 0);
  });

  test('the simulation does not mutate the mortgage', function () {
    var m = H.classic({ principal: 500000, term: 60, rate: 9, overPayments: [{ amount: 1000, everyMonths: 1 }] });
    var d = H.deposit({ term: 60, plan: { initial: 1000, payments: [{ amount: 100, everyMonths: 1 }] }, rate: 5, tax: 13 });
    var beforeD = JSON.stringify(d.toJSON());
    var before = JSON.stringify(m.toJSON());
    H.runPair(m, d, true);
    assertEqual(JSON.stringify(m.toJSON()), before);
    assertEqual(JSON.stringify(d.toJSON()), beforeD);
    var o = H.offset({ principal: 500000, term: 60, rate: 9, offset: { initial: 100000, payments: [{ amount: 1000, everyMonths: 1 }] } });
    var beforeO = JSON.stringify(o.toJSON());
    H.run(o);
    assertEqual(JSON.stringify(o.toJSON()), beforeO);
  });

  // The "tail" (the closing payment smaller than scheduled because the term was shortened) is excluded from min/max
  // but included in totalPaid.
  test('metrics: with a ReduceTerm overpayment the tail is excluded from min/max and included in totalPaid', function () {
    var res = H.run(H.classic({
      principal: 1000000, term: 120, rate: 12,
      overPayments: [{ month: 12, amount: 200000 }], overEffect: 'reduceTerm'
    }));
    var rows = res.rows;
    var last = rows[rows.length - 1];
    assertTrue(last.isTail, 'the last row must be a tail');
    assertTrue(last.payment < 14347.09);
    assertEqual(rows.filter(function (r) { return r.isTail; }).length, 1);
    assertEqual(res.metrics.minPayment, 14347.09);
    assertEqual(res.metrics.maxPayment, 14347.09);
    assertEqual(res.metrics.firstPayment, 14347.09);
    assertEqual(res.metrics.totalPaid, MC.core.round2(H.sum(rows, 'payment') + 200000));
  });

  test('metrics: with ReducePayment there is no tail, the last payment counts as an ordinary one', function () {
    var res = H.run(H.classic({
      principal: 1000000, term: 120, rate: 12,
      overPayments: [{ month: 12, amount: 200000 }], overEffect: 'reducePayment'
    }));
    res.rows.forEach(function (row) { assertEqual(row.isTail, false); });
    var min = Math.min.apply(null, res.rows.map(function (r) { return r.payment; }));
    var max = Math.max.apply(null, res.rows.map(function (r) { return r.payment; }));
    assertEqual(res.metrics.minPayment, min);
    assertEqual(res.metrics.maxPayment, max);
  });

  test('metrics: the scheduled last payment of a differentiated loan is a true minimum, not a tail', function () {
    var plain = H.run(H.classic({ principal: 120000, term: 12, rate: 12, repayment: 'differentiated' }));
    assertEqual(plain.rows[11].isTail, false);
    assertEqual(plain.metrics.minPayment, 10100);
    // ReduceTerm overpayment: the closing payment (10 000 + 200) equals the scheduled one - not a tail either
    var over = H.run(H.classic({
      principal: 120000, term: 12, rate: 12, repayment: 'differentiated', overPayments: [{ amount: 10000, everyMonths: 1 }]
    }));
    assertEqual(over.rows[5].isTail, false);
    assertEqual(over.metrics.minPayment, 10200);
    // an overpayment of 25 000 in month 3: debt 120 000 - 30 000 - 25 000 = 65 000, then 6 payments of 10 000 principal
    // (debt 5000 at the end of month 9) and a tail in month 10: 5 000 + 50 interest instead of the scheduled 10 050
    var tail = H.run(H.classic({
      principal: 120000, term: 12, rate: 12, repayment: 'differentiated',
      overPayments: [{ month: 3, amount: 25000 }]
    }));
    var rows = tail.rows;
    assertEqual(rows.length, 10);
    assertEqual(rows[9].debtEnd, 0);
    assertEqual(rows[9].principal, 5000);
    assertEqual(rows[9].payment, 5050);
    assertTrue(rows[9].isTail);
    assertEqual(rows[8].payment, 10150); // the last uncut payment: 10 000 + 1% of 15 000
    assertEqual(tail.metrics.minPayment, 10150);
    assertEqual(tail.metrics.maxPayment, 11200);
    assertEqual(tail.metrics.totalPaid, MC.core.round2(120000 + H.sum(rows, 'interest')));
  });

  // 120 000 / 12 / 12% / differentiated, start November 2026. Interest: 1200 + 1100 + ... + 100 = 7800.
  test('classic mortgage metrics without a deposit', function () {
    var res = H.run(H.classic({
      principal: 120000, term: 12, rate: 12, repayment: 'differentiated',
      start: { year: 2026, month: 11 }, reportMonth: 6
    }));
    var mt = res.metrics;
    assertEqual(mt.firstPayment, 11200);
    assertEqual(mt.maxPayment, 11200);
    assertEqual(mt.minPayment, 10100);
    assertEqual(mt.overpayment, 7800);
    assertEqual(mt.totalPaid, 127800);
    assertEqual(mt.actualTermMonths, 12);
    assertDeepEqual(mt.closeDate, { year: 2027, month: 10 });
    assertEqual(mt.debtAtReport, 60000);
    assertEqual(mt.depositIncomeNet, null);
    assertEqual(mt.depositTax, null);
    assertEqual(mt.netCost, 7800);
    assertEqual(mt.netCapitalAtReport, -60000);
  });

  test('metrics: overpayments count toward totalPaid; a report after the loan closes', function () {
    // a monthly overpayment of 10 000: interest 4200, total paid 120 000 + 4200
    var res = H.run(H.classic({
      principal: 120000, term: 12, rate: 12, repayment: 'differentiated', overPayments: [{ amount: 10000, everyMonths: 1 }], reportMonth: 10
    }));
    assertEqual(res.metrics.overpayment, 4200);
    assertEqual(res.metrics.totalPaid, 124200);
    assertEqual(res.metrics.actualTermMonths, 6);
    assertEqual(res.metrics.debtAtReport, 0);
    assertEqual(res.metrics.netCapitalAtReport, 0);
    assertEqual(res.metrics.firstPayment, 11200); // the scheduled payment without an overpayment
  });

  test('a mortgage in percent-of-value mode (10 000 000 × 80%) = a mortgage with an amount of 8 000 000', function () {
    var base = { term: 120, rate: 12, overPayments: [{ amount: 5000, everyMonths: 1 }] };
    var byAmount = H.run(H.classic(Object.assign({ principal: 8000000 }, base)));
    var pct = H.classic(Object.assign({ principal: 1 }, base));
    pct.terms.principalMode = 'percent';
    pct.terms.propertyValue = 10000000;
    pct.terms.principalPercent = 80;
    var byPercent = H.run(pct);
    assertEqual(JSON.stringify(byPercent.rows), JSON.stringify(byAmount.rows));
    assertEqual(JSON.stringify(byPercent.metrics), JSON.stringify(byAmount.metrics));
    assertTrue(byAmount.rows.length > 0);
  });
})();
