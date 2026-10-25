// Tests of the offset mortgage simulation. Expected values are computed by hand.
(function () {
  'use strict';

  var H = MC.tests.sim;

  function withoutAccount(rows) {
    return rows.map(function (row) {
      var copy = {};
      Object.keys(row).forEach(function (k) { if (k !== 'accountBalance') { copy[k] = row[k]; } });
      return copy;
    });
  }

  test('an offset with a zero balance = a classic mortgage (identical schedules)', function () {
    var base = {
      principal: 1000000, term: 120,
      rates: [{ fromMonth: 1, annualRate: 12 }, { fromMonth: 25, annualRate: 9 }],
      overPayments: [{ amount: 500, everyMonths: 1 }, { month: 40, amount: 100000 }]
    };
    ['annuity', 'differentiated'].forEach(function (repayment) {
      ['reduceTerm', 'reducePayment'].forEach(function (overEffect) {
        ['offsetReducesTerm', 'offsetReducesPayment'].forEach(function (offsetEffect) {
          var o = {};
          Object.keys(base).forEach(function (k) { o[k] = base[k]; });
          o.repayment = repayment;
          o.overEffect = overEffect;
          var label = repayment + '/' + overEffect + '/' + offsetEffect;
          var classicRows = H.run(H.classic(o)).rows;
          o.offsetEffect = offsetEffect;
          var offsetRows = H.run(H.offset(o)).rows;
          assertDeepEqual(withoutAccount(offsetRows), withoutAccount(classicRows), label);
          offsetRows.forEach(function (row) { assertEqual(row.accountBalance, 0, label); });
        });
      });
    });
  });

  test('offset: balance >= debt -> interest 0, the repayment account is not used', function () {
    var term = H.run(H.offset({
      principal: 100000, term: 12, rate: 12, offset: { initial: 100000 }, offsetEffect: 'offsetReducesTerm'
    }));
    // annuity 100 000 / 1% / 12 = 8884.88, the whole payment goes to principal
    assertEqual(term.rows[0].interest, 0);
    assertEqual(term.rows[0].payment, 8884.88);
    assertEqual(term.rows[0].principal, 8884.88);
    assertEqual(term.rows[0].debtEnd, 91115.12);
    assertEqual(term.rows.length, 12);
    assertEqual(term.rows[11].debtEnd, 0);
    term.rows.forEach(function (row) {
      assertEqual(row.interest, 0);
      assertEqual(row.accountBalance, 100000);
    });
    assertEqual(term.metrics.overpayment, 0);

    var pay = H.run(H.offset({
      principal: 100000, term: 12, rate: 12, offset: { initial: 100000 }, offsetEffect: 'offsetReducesPayment'
    }));
    // principal by schedule = 8884.88 - 1000 interest "without an offset"
    assertEqual(pay.rows[0].interest, 0);
    assertEqual(pay.rows[0].payment, 7884.88);
    assertEqual(pay.rows.length, 12);
    assertEqual(H.sum(pay.rows, 'interest'), 0);
    assertEqual(pay.rows[11].debtEnd, 0);
  });

  // 1 000 000 / 12% / 120, a constant balance of 500 000. The ordinary payment is 14 347.09, interest "without an offset" 10 000.
  test('OffsetReducesPayment: closes in the original term, payment = scheduled principal + reduced interest', function () {
    var res = H.run(H.offset({
      principal: 1000000, term: 120, rate: 12, offset: { initial: 500000 }, offsetEffect: 'offsetReducesPayment'
    }));
    var rows = res.rows;
    assertEqual(rows.length, 120);
    assertEqual(rows[0].interest, 5000);
    assertEqual(rows[0].principal, 4347.09);     // 14347.09 - 10000
    assertEqual(rows[0].payment, 9347.09);
    assertEqual(rows[0].debtEnd, 995652.91); // the debt goes as in the ordinary schedule
    // month 2: principal 14347.09 - 9956.53 = 4390.56; interest (995652.91 - 500000) * 1% = 4956.53
    assertEqual(rows[1].principal, 4390.56);
    assertEqual(rows[1].interest, 4956.53);
    assertEqual(rows[1].payment, 9347.09);
    assertEqual(rows[119].debtEnd, 0);
    assertEqual(H.sum(rows, 'principal'), 1000000);
  });

  test('OffsetReducesTerm: payment as without an offset, the interest saving goes to principal, a shorter term', function () {
    var res = H.run(H.offset({
      principal: 1000000, term: 120, rate: 12, offset: { initial: 500000 }, offsetEffect: 'offsetReducesTerm'
    }));
    var rows = res.rows;
    assertEqual(rows[0].payment, 14347.09);
    assertEqual(rows[0].interest, 5000);
    assertEqual(rows[0].principal, 9347.09);
    assertEqual(rows[0].debtEnd, 990652.91);
    assertTrue(rows.length < 120, 'the term must shorten, got ' + rows.length);
    assertEqual(rows[rows.length - 1].debtEnd, 0);
    assertEqual(H.sum(rows, 'principal'), 1000000);

    var classic = H.run(H.classic({ principal: 1000000, term: 120, rate: 12 }));
    assertTrue(res.metrics.overpayment < classic.metrics.overpayment);
  });

  // A top-up of 400 000 at the end of month 3. Interest by month (rate 1%, payment 14347.09):
  //   m1: 1 000 000 -> 10 000.00, principal 4347.09, debt 995 652.91
  //   m2: 995 652.91 -> 9956.53, principal 4390.56, debt 991 262.35
  //   m3: 991 262.35 -> 9912.62 (the balance is still 0), principal 4434.47, debt 986 827.88
  //   m4: (986 827.88 - 400 000) = 586 827.88 -> 5868.28
  test('an offset top-up in month m affects interest from month m+1', function () {
    var rows = H.run(H.offset({
      principal: 1000000, term: 120, rate: 12,
      offset: { initial: 0, payments: [{ month: 3, amount: 400000 }] }, offsetEffect: 'offsetReducesTerm'
    })).rows;
    assertEqual(rows[0].interest, 10000);
    assertEqual(rows[1].interest, 9956.53);
    assertEqual(rows[1].accountBalance, 0);
    assertEqual(rows[2].interest, 9912.62);
    assertEqual(rows[2].debtEnd, 986827.88);
    assertEqual(rows[2].accountBalance, 400000);
    assertEqual(rows[3].interest, 5868.28);
  });

  test('offset: a monthly top-up and the starting balance = initial', function () {
    var rows = H.run(H.offset({
      principal: 1000000, term: 120, rate: 12,
      offset: { initial: 0, payments: [{ amount: 1000, everyMonths: 1 }] }, offsetEffect: 'offsetReducesTerm'
    })).rows;
    assertEqual(rows[0].interest, 10000); // at the start the balance is 0
    assertEqual(rows[0].accountBalance, 1000);
    assertEqual(rows[1].interest, 9946.53);    // (995 652.91 - 1000) * 1%
    assertEqual(rows[1].accountBalance, 2000);
  });

  test('offset: a withdrawal above the balance is capped at zero', function () {
    var rows = H.run(H.offset({
      principal: 1000000, term: 120, rate: 12,
      offset: { initial: 100000, payments: [{ month: 1, amount: -300000 }] }, offsetEffect: 'offsetReducesTerm'
    })).rows;
    assertEqual(rows[0].interest, 9000);       // (1 000 000 - 100 000) * 1%
    assertEqual(rows[0].accountBalance, 0);
    assertEqual(rows[1].interest, 9946.53); // debt 994 652.91 at a zero balance
  });

  // 120 000 / 12 months / 12% / differentiated, a constant balance of 50 000, principal share 10 000.
  test('differentiated offset, OffsetReducesPayment: principal 10 000 + interest on (debt - 50 000)', function () {
    var res = H.run(H.offset({
      principal: 120000, term: 12, rate: 12, repayment: 'differentiated',
      offset: { initial: 50000 }, offsetEffect: 'offsetReducesPayment'
    }));
    var rows = res.rows;
    // debt at start: 120k..50k -> interest 700, 600, ..., 100, 0; then 40k.. -> 0
    var interest = [700, 600, 500, 400, 300, 200, 100, 0, 0, 0, 0, 0];
    assertEqual(rows.length, 12);
    for (var i = 0; i < 12; i++) {
      assertEqual(rows[i].interest, interest[i], 'interest, month ' + (i + 1));
      assertEqual(rows[i].principal, 10000, 'principal, month ' + (i + 1));
      assertEqual(rows[i].payment, 10000 + interest[i], 'payment, month ' + (i + 1));
    }
    assertEqual(rows[11].debtEnd, 0);
    assertEqual(res.metrics.overpayment, 2800);
  });

  test('differentiated offset, OffsetReducesTerm: payment as without an offset, the saving goes to principal', function () {
    var res = H.run(H.offset({
      principal: 120000, term: 12, rate: 12, repayment: 'differentiated',
      offset: { initial: 50000 }, offsetEffect: 'offsetReducesTerm'
    }));
    var rows = res.rows;
    // payment = 10 000 + 1% of the full debt; interest on (debt - 50 000)
    var payment = [11200, 11095, 10990, 10885, 10780, 10675, 10570, 10465, 10360.35, 10256.75, 10154.18, 5263.72];
    var interest = [700, 595, 490, 385, 280, 175, 70, 0, 0, 0, 0, 0];
    var debtEnd = [109500, 99000, 88500, 78000, 67500, 57000, 46500, 36035, 25674.65, 15417.9, 5263.72, 0];
    assertEqual(rows.length, 12);
    for (var i = 0; i < 12; i++) {
      assertEqual(rows[i].payment, payment[i], 'payment, month ' + (i + 1));
      assertEqual(rows[i].interest, interest[i], 'interest, month ' + (i + 1));
      assertEqual(rows[i].debtEnd, debtEnd[i], 'debt, month ' + (i + 1));
    }
    assertEqual(res.metrics.overpayment, 2695);
  });

  // An annuity, the rate changes 12% -> 8% from month 37, a constant balance of 300 000.
  // The new payment = the annuity on the debt, the 8% rate and the term in which the debt would be repaid by the old payment
  // at the old rate (OPEN QUESTION: see PLAN.md section 8; the rule is extended to the offset - ASSUMPTION in LoanEngine).
  test('OffsetReducesTerm + a rate change: the payment is recomputed for the term from the old payment', function () {
    var res = H.run(H.offset({
      principal: 1000000, term: 120,
      rates: [{ fromMonth: 1, annualRate: 12 }, { fromMonth: 37, annualRate: 8 }],
      offset: { initial: 300000 }, offsetEffect: 'offsetReducesTerm', overEffect: 'reducePayment'
    }));
    var rows = res.rows;
    var d = rows[35].debtEnd;
    var p = rows[35].payment;
    var nOld = Math.log(p / (p - d * 0.01)) / Math.log(1.01);
    assertEqual(p, 14347.09);
    assertTrue(nOld < 120 - 36, 'the term from the old payment must be shorter than the nominal remainder');
    assertEqual(rows[36].rate, 8);
    assertClose(rows[36].payment, H.annuity(d, 0.08 / 12, Math.ceil(nOld)), 0.5);
    assertEqual(rows[rows.length - 1].debtEnd, 0);
  });

  // We pin the accepted behaviour (ASSUMPTION in LoanEngine): after an overpayment with ReducePayment the payment
  // is computed for the nominal remaining term, a term shortened by the offset is "forgotten".
  test('ReducePayment + OffsetReducesTerm: the payment after an overpayment is computed for the nominal remainder', function () {
    var res = H.run(H.offset({
      principal: 1000000, term: 120, rate: 12,
      overPayments: [{ month: 12, amount: 200000 }], overEffect: 'reducePayment',
      offset: { initial: 500000 }, offsetEffect: 'offsetReducesTerm'
    }));
    var rows = res.rows;
    assertEqual(rows[11].payment, 14347.09);
    assertEqual(rows[11].overpayment, 200000);
    assertClose(rows[12].payment, H.annuity(rows[11].debtEnd, 0.01, 108), 0.0051);
    assertTrue(rows[12].payment < 14347.09);
    assertEqual(rows[rows.length - 1].debtEnd, 0);
  });

  test('cumulative totals in an offset (OffsetReducesTerm, balance 500 000)', function () {
    var res = H.run(H.offset({
      principal: 1000000, term: 120, rate: 12, offset: { initial: 500000 }, offsetEffect: 'offsetReducesTerm'
    }));
    var rows = res.rows;
    assertEqual(rows[0].cumInterest, 5000);
    assertEqual(rows[0].cumPrincipal, 9347.09);
    // m2: interest (990 652.91 - 500 000) * 1% = 4906.53, principal 14347.09 - 4906.53 = 9440.56
    assertEqual(rows[1].cumInterest, 9906.53);
    assertEqual(rows[1].cumPrincipal, 18787.65);
    var last = rows[rows.length - 1];
    assertEqual(last.cumInterest, res.metrics.overpayment);
    assertEqual(last.cumPrincipal, 1000000);
  });

  test('offset metrics: the OffsetReducesTerm tail is excluded from min/max, OffsetReducesPayment has no tail', function () {
    var term = H.run(H.offset({
      principal: 1000000, term: 120, rate: 12, offset: { initial: 500000 }, offsetEffect: 'offsetReducesTerm'
    }));
    var last = term.rows[term.rows.length - 1];
    assertTrue(last.isTail);
    assertTrue(last.payment < 14347.09);
    assertEqual(term.metrics.minPayment, 14347.09);
    assertEqual(term.metrics.maxPayment, 14347.09);

    var pay = H.run(H.offset({
      principal: 1000000, term: 120, rate: 12, offset: { initial: 500000 }, offsetEffect: 'offsetReducesPayment'
    }));
    pay.rows.forEach(function (row) { assertEqual(row.isTail, false); });
    // the last payment is adjusted by rounding and counts toward min/max
    var payments = pay.rows.map(function (r) { return r.payment; });
    assertEqual(pay.metrics.minPayment, Math.min.apply(null, payments));
    assertEqual(pay.metrics.maxPayment, Math.max.apply(null, payments));
  });

  test('differentiated offset: the closing payment is smaller than scheduled - a tail', function () {
    var res = H.run(H.offset({
      principal: 120000, term: 12, rate: 12, repayment: 'differentiated',
      offset: { initial: 50000 }, offsetEffect: 'offsetReducesTerm'
    }));
    assertTrue(res.rows[11].isTail); // 5263.72 instead of the scheduled 10 052.64
    assertEqual(res.metrics.minPayment, 10154.18); // the last non-tail payment (month 11)
    assertEqual(res.metrics.maxPayment, 11200);
  });

  test('offset metrics: a report after the close takes the last row\'s balance (ASSUMPTION)', function () {
    var res = H.run(H.offset({
      principal: 120000, term: 12, rate: 12, repayment: 'differentiated',
      offset: { initial: 50000 }, offsetEffect: 'offsetReducesPayment', reportMonth: 50
    }));
    assertEqual(res.metrics.debtAtReport, 0);
    assertEqual(res.metrics.netCapitalAtReport, 50000);
  });

  test('offset mortgage metrics', function () {
    var term = H.run(H.offset({
      principal: 1000000, term: 120, rate: 12, offset: { initial: 500000 },
      offsetEffect: 'offsetReducesTerm', reportMonth: 1
    }));
    var mt = term.metrics;
    assertEqual(mt.firstPayment, 14347.09);
    assertEqual(mt.depositIncomeNet, null);
    assertEqual(mt.depositTax, null);
    assertEqual(mt.netCost, mt.overpayment);
    assertEqual(mt.debtAtReport, 990652.91);
    assertEqual(mt.netCapitalAtReport, -490652.91);   // 500 000 - 990 652.91
    assertEqual(mt.actualTermMonths, term.rows.length);

    var pay = H.run(H.offset({
      principal: 1000000, term: 120, rate: 12, offset: { initial: 500000 },
      offsetEffect: 'offsetReducesPayment', reportMonth: 1
    }));
    assertEqual(pay.metrics.actualTermMonths, 120);
    assertEqual(pay.metrics.firstPayment, 9347.09);
    assertEqual(pay.metrics.netCapitalAtReport, -495652.91);  // 500 000 - 995 652.91
    assertDeepEqual(pay.metrics.closeDate, { year: 2036, month: 12 });
  });
})();
