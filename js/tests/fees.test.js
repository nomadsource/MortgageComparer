// Tests of extra payments (insurance, fees): ScheduleRow.fee, feesTotal, netCost, the effective rate. Expected values are computed by hand / by formulas.
(function () {
  'use strict';

  var H = MC.tests.sim;
  var round2 = MC.core.round2;

  function feesOf(rows) { return rows.map(function (r) { return r.fee; }); }

  // An independent NPV estimate of the borrower's flows at monthly rate i
  function npv(loan, rows, i, withFees) {
    var s = loan;
    rows.forEach(function (r, k) { s -= (r.payment + r.overpayment + (withFees ? r.fee : 0)) / Math.pow(1 + i, k + 1); });
    return s;
  }
  function monthlyFromAnnual(pct) { return Math.pow(1 + pct / 100, 1 / 12) - 1; }

  test('fee: every month, every 12 months, one-off; 0 without extras', function () {
    var o = { principal: 12000, term: 24, rate: 12 };
    assertDeepEqual(feesOf(H.run(H.classic(o)).rows), new Array(24).fill(0));
    o.fees = [{ amount: 10, everyMonths: 1 }];
    assertDeepEqual(feesOf(H.run(H.classic(o)).rows), new Array(24).fill(10));
    o.fees = [{ amount: 100, everyMonths: 12 }];
    var f = feesOf(H.run(H.classic(o)).rows);
    assertEqual(f[11], 100); assertEqual(f[23], 100); assertEqual(f[0], 0); assertEqual(f[12], 0);
    o.fees = [{ amount: 50, month: 1 }, { amount: 5, month: 3 }, { amount: 7, everyMonths: 3 }];
    f = feesOf(H.run(H.classic(o)).rows);
    assertEqual(f[0], 50); assertEqual(f[1], 0); assertEqual(f[2], 12); assertEqual(f[5], 7);
  });

  test('fee: no extras after the loan closes, paid in the closing month', function () {
    var res = H.run(H.classic({ principal: 12000, term: 24, rate: 12, overPayments: [{ month: 2, amount: 100000 }], fees: [{ amount: 10, everyMonths: 1 }] }));
    assertEqual(res.rows.length, 2);
    assertDeepEqual(feesOf(res.rows), [10, 10]);
    assertEqual(res.metrics.feesTotal, 20);
  });

  test('feesTotal, totalPaid, netCost with extras; debt, interest and payment do not change', function () {
    var base = { principal: 12000, term: 12, rate: 12 };
    var a = H.run(H.classic(base));
    base.fees = [{ amount: 100, month: 1 }, { amount: 10, everyMonths: 1 }];
    var b = H.run(H.classic(base));
    // 12 months of 10 + 100 at issue
    assertEqual(b.metrics.feesTotal, 220);
    assertEqual(b.metrics.totalPaid, round2(a.metrics.totalPaid + 220));
    assertEqual(b.metrics.overpayment, a.metrics.overpayment);
    assertEqual(b.metrics.netCost, round2(a.metrics.overpayment + 220));
    assertEqual(a.metrics.feesTotal, 0);
    assertEqual(a.metrics.netCost, a.metrics.overpayment);
    assertEqual(a.metrics.totalPaid, H.sum(a.rows, 'payment'));
    assertDeepEqual(b.rows.map(function (r) { return [r.payment, r.interest, r.debtEnd]; }), a.rows.map(function (r) { return [r.payment, r.interest, r.debtEnd]; }));
    assertEqual(b.metrics.firstPayment, a.metrics.firstPayment);
  });

  test('effectiveRate: annuity 12% without extras = 12.68, equals effectiveRateNoFees', function () {
    var m = H.run(H.classic({ principal: 1000000, term: 120, rate: 12 })).metrics;
    assertClose(m.effectiveRate, 12.68, 0.01);
    assertEqual(m.effectiveRate, m.effectiveRateNoFees);
  });

  test('effectiveRate: a single payment after a month, i = P/L - 1', function () {
    // a loan of 1200, 12% a year, 1 month: interest 12, payment 1212
    var m = H.run(H.classic({ principal: 1200, term: 1, rate: 12 })).metrics;
    assertClose(m.effectiveRate, round2((Math.pow(1212 / 1200, 12) - 1) * 100), 0.01);
    // a fee of 30 at issue (month 1): P = 1242, i = 0.035
    var f = H.run(H.classic({ principal: 1200, term: 1, rate: 12, fees: [{ amount: 30, month: 1 }] })).metrics;
    assertClose(f.effectiveRate, round2((Math.pow(1242 / 1200, 12) - 1) * 100), 0.01);
    assertClose(f.effectiveRateNoFees, m.effectiveRate, 0.001);
  });

  test('effectiveRate with extras: the NPV at the found rate ≈ 0, the rate is above the rate without extras', function () {
    var res = H.run(H.classic({
      principal: 3000000, term: 60, rate: 10, overPayments: [{ amount: 20000, everyMonths: 6 }],
      fees: [{ amount: 12000, everyMonths: 12 }, { amount: 50000, month: 1 }]
    }));
    var m = res.metrics;
    assertTrue(m.effectiveRate > m.effectiveRateNoFees, 'with extras the rate is higher');
    // the NPV at the found rate is small relative to the loan amount (accuracy - the rate is rounded to 0.01 pp)
    assertTrue(Math.abs(npv(3000000, res.rows, monthlyFromAnnual(m.effectiveRate), true)) < 3000000 * 0.0002);
    assertTrue(Math.abs(npv(3000000, res.rows, monthlyFromAnnual(m.effectiveRateNoFees), false)) < 3000000 * 0.0002);
    // and the rate without extra payments, applied to the flow with them, clearly does not zero the NPV
    assertTrue(npv(3000000, res.rows, monthlyFromAnnual(m.effectiveRateNoFees), true) < -10000);
  });

  test('empty schedule: feesTotal 0, rates null', function () {
    var m = H.run(H.classic({ principal: 0, term: 12, rate: 12, fees: [{ amount: 10, everyMonths: 1 }] })).metrics;
    assertEqual(m.feesTotal, 0);
    assertEqual(m.effectiveRate, null);
    assertEqual(m.effectiveRateNoFees, null);
  });

  test('fees: round trip, an old JSON without fees, duplicate; an offset mortgage too', function () {
    var fees = [{ amount: 12000, everyMonths: 12 }, { amount: 50000, month: 1 }];
    ['classic', 'offset'].forEach(function (kind) {
      var m = H.make(kind, { principal: 100000, term: 12, rate: 10, fees: fees });
      assertDeepEqual(m.toJSON().fees, fees);
      var back = MC.domain.ProductRegistry.fromJSON(JSON.parse(JSON.stringify(m.toJSON())));
      assertDeepEqual(back.fees, fees);
      assertDeepEqual(MC.domain.ProductRegistry.duplicate(m).fees, fees);
      var old = m.toJSON();
      delete old.fees;
      assertDeepEqual(MC.domain.ProductRegistry.fromJSON(old).fees, []);
      assertDeepEqual(H.make(kind, { principal: 100000, term: 12, rate: 10 }).toJSON().fees, []);
    });
  });

  test('a pair with a deposit: netCost = overpayment + extras - the deposit income', function () {
    var m = H.classic({ principal: 100000, term: 12, rate: 12, fees: [{ amount: 500, month: 1 }, { amount: 20, everyMonths: 1 }] });
    var d = H.deposit({ term: 12, plan: { initial: 50000 }, rate: 8, tax: 0 });
    var r = H.runPair(m, d, false).metrics;
    assertEqual(r.feesTotal, 740);
    assertTrue(r.depositIncomeNet > 0);
    assertEqual(r.netCost, round2(r.overpayment + 740 - r.depositIncomeNet));
  });
})();
