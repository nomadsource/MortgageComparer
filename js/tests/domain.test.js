(function () {
  'use strict';

  var D = MC.domain;

  // The expected JSON for filled(kind), written by hand.
  function expectedJson(kind) {
    var json = {
      kind: kind,
      id: 'id-' + kind,
      name: 'Test ' + kind,
      terms: {
        principal: 5000000, principalMode: 'amount', propertyValue: 0, principalPercent: 80,
        termMonths: 240, startDate: { year: 2030, month: 2 }
      },
      rates: { entries: [{ fromMonth: 1, annualRate: 9.5 }, { fromMonth: 25, annualRate: 7 }] },
      repayment: { kind: 'differentiated' },
      overpayments: {
        payments: [{ amount: 1000, everyMonths: 1 }, { amount: 30000, everyMonths: 12 }, { month: 12, amount: 50000 }],
        effect: { kind: 'reducePayment' }
      },
      fees: [{ amount: 12000, everyMonths: 12 }, { amount: 50000, month: 1 }]
    };
    if (kind === 'offset') {
      json.offsetAccount = { initial: 100000, payments: [{ amount: 5000, everyMonths: 1 }, { month: 6, amount: -2000 }] };
      json.offsetEffect = { kind: 'offsetReducesPayment' };
    }
    json.report = { month: 36 };
    return json;
  }

  // A mortgage with "non-empty" fields so serialisation checks all nested objects.
  function filled(kind) {
    var m = D.ProductRegistry.createDefault(kind);
    m.id = 'id-' + kind;
    m.name = 'Test ' + kind;
    m.terms = new D.LoanTerms({ principal: 5000000, termMonths: 240, startDate: { year: 2030, month: 2 } });
    m.rates = new D.RateSchedule({ entries: [{ fromMonth: 1, annualRate: 9.5 }, { fromMonth: 25, annualRate: 7 }] });
    m.repayment = new D.DifferentiatedRepayment();
    m.overpayments = new D.Overpayments({
      payments: [{ amount: 1000, everyMonths: 1 }, { amount: 30000, everyMonths: 12 }, { month: 12, amount: 50000 }],
      effect: new D.ReducePayment()
    });
    m.fees = [{ amount: 12000, everyMonths: 12 }, { amount: 50000, month: 1 }];
    m.report = new D.ReportPoint({ month: 36 });
    if (kind === 'offset') {
      m.offsetAccount = new D.CashFlowPlan({ initial: 100000, payments: [{ amount: 5000, everyMonths: 1 }, { month: 6, amount: -2000 }] });
      m.offsetEffect = new D.OffsetReducesPayment();
    }
    return m;
  }

  // The expected JSON for filledDeposit(), written by hand.
  function expectedDepositJson() {
    return {
      kind: 'deposit',
      id: 'id-deposit',
      name: 'Test deposit',
      termMonths: 120,
      startDate: { year: 2026, month: 5 },
      plan: { initial: 500000, payments: [{ amount: 10000, everyMonths: 1 }, { month: 6, amount: -2000 }] },
      rates: { entries: [{ fromMonth: 1, annualRate: 9 }, { fromMonth: 13, annualRate: 7 }] },
      taxRate: 13,
      report: { month: 36 }
    };
  }

  function filledDeposit() {
    return new D.Deposit({
      id: 'id-deposit',
      name: 'Test deposit',
      termMonths: 120,
      startDate: { year: 2026, month: 5 },
      plan: new D.CashFlowPlan({ initial: 500000, payments: [{ amount: 10000, everyMonths: 1 }, { month: 6, amount: -2000 }] }),
      rates: new D.RateSchedule({ entries: [{ fromMonth: 1, annualRate: 9 }, { fromMonth: 13, annualRate: 7 }] }),
      taxRate: 13,
      report: new D.ReportPoint({ month: 36 })
    });
  }

  test('RateSchedule.rateAt: a single rate and a rate change', function () {
    var rs = new D.RateSchedule({ entries: [{ fromMonth: 1, annualRate: 10 }, { fromMonth: 13, annualRate: 7.5 }] });
    assertEqual(rs.rateAt(1), 10);
    assertEqual(rs.rateAt(12), 10);
    assertEqual(rs.rateAt(13), 7.5);
    assertEqual(rs.rateAt(100), 7.5);
  });

  test('RateSchedule.rateAt: unsorted entries', function () {
    var rs = new D.RateSchedule({ entries: [{ fromMonth: 25, annualRate: 6 }, { fromMonth: 1, annualRate: 10 }, { fromMonth: 13, annualRate: 8 }] });
    assertEqual(rs.rateAt(5), 10);
    assertEqual(rs.rateAt(20), 8);
    assertEqual(rs.rateAt(30), 6);
  });

  test('RateSchedule.rateAt: m before the earliest entry, an empty list, equal fromMonth', function () {
    var late = new D.RateSchedule({ entries: [{ fromMonth: 13, annualRate: 8 }, { fromMonth: 5, annualRate: 6 }] });
    assertEqual(late.rateAt(1), 6);
    assertEqual(new D.RateSchedule({ entries: [] }).rateAt(1), 0);
    var dup = new D.RateSchedule({ entries: [{ fromMonth: 1, annualRate: 5 }, { fromMonth: 1, annualRate: 9 }] });
    assertEqual(dup.rateAt(1), 9);
    assertEqual(dup.rateAt(50), 9);
  });

  test('payments not an array: CashFlowPlan and Overpayments throw, absent -> []', function () {
    var threw = 0;
    [
      function () { new D.CashFlowPlan({ initial: 0, payments: 'x' }); },
      function () { new D.CashFlowPlan({ initial: 0, payments: {} }); },
      function () { new D.Overpayments({ payments: 5, effect: new D.ReduceTerm() }); },
      function () { new D.Overpayments({ payments: {}, effect: new D.ReduceTerm() }); },
      function () { D.CashFlowPlan.fromJSON({ initial: 0, payments: {} }); },
      function () { D.CashFlowPlan.fromJSON({ initial: 0, recurring: 5, oneTime: [] }); },
      function () { D.CashFlowPlan.fromJSON({ initial: 0, recurring: [], oneTime: {} }); },
      function () { D.Overpayments.fromJSON({ oneTime: 'x', effect: { kind: 'reduceTerm' } }); }
    ].forEach(function (fn) {
      try { fn(); } catch (e) { threw++; }
    });
    assertEqual(threw, 8);
    assertDeepEqual(new D.CashFlowPlan({ initial: 0 }).payments, []);
    assertDeepEqual(new D.Overpayments({ effect: new D.ReduceTerm() }).payments, []);
  });

  test('CashFlowPlan.flowAt: a monthly entry + one-off operations (including a withdrawal)', function () {
    var plan = new D.CashFlowPlan({
      initial: 0,
      payments: [
        { amount: 100, everyMonths: 1 },
        { month: 3, amount: 500 }, { month: 3, amount: -50 }, { month: 5, amount: -200 }
      ]
    });
    assertEqual(plan.flowAt(1), 100);
    assertEqual(plan.flowAt(3), 550);
    assertEqual(plan.flowAt(5), -100);
  });

  test('CashFlowPlan.flowAt: everyMonths 1, 12, 3 and several entries', function () {
    var monthly = new D.CashFlowPlan({ initial: 0, payments: [{ amount: 100, everyMonths: 1 }] });
    assertEqual(monthly.flowAt(1), 100);
    assertEqual(monthly.flowAt(7), 100);
    var yearly = new D.CashFlowPlan({ initial: 0, payments: [{ amount: 1200, everyMonths: 12 }] });
    assertEqual(yearly.flowAt(11), 0);
    assertEqual(yearly.flowAt(12), 1200);
    assertEqual(yearly.flowAt(13), 0);
    assertEqual(yearly.flowAt(24), 1200);
    var quarterly = new D.CashFlowPlan({ initial: 0, payments: [{ amount: 7, everyMonths: 3 }] });
    assertDeepEqual([1, 2, 3, 4, 5, 6].map(function (m) { return quarterly.flowAt(m); }), [0, 0, 7, 0, 0, 7]);
    var several = new D.CashFlowPlan({ initial: 0, payments: [{ amount: 100, everyMonths: 1 }, { amount: 1000, everyMonths: 12 }] });
    assertEqual(several.flowAt(5), 100);
    assertEqual(several.flowAt(12), 1100);
    assertEqual(new D.CashFlowPlan({ initial: 0 }).flowAt(3), 0);
  });

  test('CashFlowPlan.flowAt: a negative amount (a withdrawal) in a mix of entries', function () {
    var plan = new D.CashFlowPlan({
      initial: 0,
      payments: [
        { amount: -300, everyMonths: 2 }, { amount: 50, everyMonths: 1 },
        { month: 4, amount: 1000 }, { month: 5, amount: -25.5 }
      ]
    });
    assertEqual(plan.flowAt(1), 50);
    assertEqual(plan.flowAt(2), -250);
    assertEqual(plan.flowAt(4), 750);
    assertEqual(plan.flowAt(5), 24.5);
  });

  test('Payments.amountAt: a mix of every 1/12/3 + one-off entries, the sum is rounded to kopecks', function () {
    var list = [
      { amount: 1, everyMonths: 1 }, { amount: 10, everyMonths: 3 }, { amount: 100, everyMonths: 12 },
      { month: 12, amount: 1000 }, { month: 5, amount: 0.1 }, { month: 5, amount: 0.2 }
    ];
    var at = function (m) { return D.Payments.amountAt(list, m); };
    assertEqual(at(1), 1);
    assertEqual(at(3), 11);
    assertEqual(at(5), 1.3);
    assertEqual(at(12), 1111);
    assertEqual(at(13), 1);
    assertEqual(at(24), 111);
    assertEqual(D.Payments.amountAt([], 7), 0);
  });

  test('Payments.amountAt: invalid entries are ignored', function () {
    var bad = [
      { amount: 5, everyMonths: 0 }, { amount: 5, everyMonths: -2 }, { amount: 5, everyMonths: 1.5 },
      { amount: 5, everyMonths: NaN }, { amount: 5, everyMonths: '1' }, { amount: 5 },
      { amount: 5, month: 0 }, { amount: 5, month: 2.5 }, { amount: 5, month: NaN }, { amount: 5, month: '2' },
      { amount: 2, everyMonths: 2 }
    ];
    var op = new D.Overpayments({ payments: bad, effect: new D.ReduceTerm() });
    assertEqual(op.amountAt(2), 2);
    assertEqual(op.amountAt(3), 0);
    var plan = new D.CashFlowPlan({ initial: 0, payments: bad });
    assertEqual(plan.flowAt(6), 2);
  });

  test('Payments.amountAt: with both everyMonths and month set, everyMonths applies', function () {
    var list = [{ amount: 100, everyMonths: 3, month: 5 }];
    assertEqual(D.Payments.amountAt(list, 3), 100);
    assertEqual(D.Payments.amountAt(list, 5), 0);
    assertEqual(D.Payments.amountAt(list, 6), 100);
    // an invalid everyMonths -> the entry is one-off
    var fallback = [{ amount: 7, everyMonths: 0, month: 5 }];
    assertEqual(D.Payments.amountAt(fallback, 5), 7);
    assertEqual(D.Payments.amountAt(fallback, 6), 0);
  });

  test('CashFlowPlan.fromJSON: migration from {recurring, oneTime} and {monthly}', function () {
    var oldRec = D.CashFlowPlan.fromJSON({
      initial: 10, recurring: [{ amount: -5, everyMonths: 12 }, { amount: 3, everyMonths: 1 }], oneTime: [{ month: 2, amount: 4 }]
    });
    assertDeepEqual(oldRec.toJSON(), {
      initial: 10,
      payments: [{ amount: -5, everyMonths: 12 }, { amount: 3, everyMonths: 1 }, { month: 2, amount: 4 }]
    });
    assertEqual('recurring' in oldRec, false);
    assertEqual('oneTime' in oldRec, false);
    assertEqual(oldRec.flowAt(2), 7);
    // the oldest format
    var pos = D.CashFlowPlan.fromJSON({ initial: 10, monthly: 5000, oneTime: [{ month: 2, amount: 1 }] });
    assertDeepEqual(pos.toJSON(), { initial: 10, payments: [{ amount: 5000, everyMonths: 1 }, { month: 2, amount: 1 }] });
    assertEqual('monthly' in pos, false);
    assertEqual(pos.flowAt(3), 5000);
    assertDeepEqual(D.CashFlowPlan.fromJSON({ initial: 0, monthly: -2000, oneTime: [] }).payments, [{ amount: -2000, everyMonths: 1 }]);
    assertDeepEqual(D.CashFlowPlan.fromJSON({ initial: 0, monthly: 0, oneTime: [] }).payments, []);
    assertDeepEqual(D.CashFlowPlan.fromJSON({ initial: 0 }).payments, []);
    // recurring takes priority over monthly
    assertDeepEqual(D.CashFlowPlan.fromJSON({ initial: 0, monthly: 5, recurring: [{ amount: 9, everyMonths: 6 }] }).payments, [{ amount: 9, everyMonths: 6 }]);
    // if payments is present, the legacy keys are ignored
    var mixed = D.CashFlowPlan.fromJSON({ initial: 0, payments: [{ amount: 1, month: 1 }], recurring: [{ amount: 9, everyMonths: 6 }], oneTime: [{ month: 2, amount: 3 }], monthly: 4 });
    assertDeepEqual(mixed.payments, [{ amount: 1, month: 1 }]);
    // an old offset mortgage JSON as a whole
    var json = expectedJson('offset');
    json.offsetAccount = { initial: 100000, monthly: 5000, oneTime: [] };
    assertDeepEqual(D.ProductRegistry.fromJSON(json).offsetAccount.payments, [{ amount: 5000, everyMonths: 1 }]);
    var json2 = expectedJson('offset');
    json2.offsetAccount = { initial: 1, payments: [{ amount: 5000, everyMonths: 1 }, { month: 6, amount: -2000 }] };
    assertDeepEqual(D.ProductRegistry.fromJSON(json2).offsetAccount.payments, [{ amount: 5000, everyMonths: 1 }, { month: 6, amount: -2000 }]);
  });

  test('CashFlowPlan: round trip against a literal', function () {
    var literal = { initial: 1, payments: [{ amount: -5, everyMonths: 12 }, { amount: 3, everyMonths: 1 }, { month: 2, amount: 4 }] };
    var copy = D.CashFlowPlan.fromJSON(JSON.parse(JSON.stringify(new D.CashFlowPlan(literal).toJSON())));
    assertDeepEqual(copy.toJSON(), literal);
  });

  test('Overpayments.amountAt: every month and one-off', function () {
    var op = new D.Overpayments({
      payments: [{ amount: 10, everyMonths: 1 }, { month: 2, amount: 1000 }, { month: 2, amount: 0.5 }],
      effect: new D.ReduceTerm()
    });
    assertEqual(op.amountAt(1), 10);
    assertEqual(op.amountAt(2), 1010.5);
  });

  test('Overpayments.amountAt: everyMonths 12, 3 and several entries + a one-off', function () {
    var yearly = new D.Overpayments({ payments: [{ amount: 100, everyMonths: 12 }], effect: new D.ReduceTerm() });
    assertEqual(yearly.amountAt(11), 0);
    assertEqual(yearly.amountAt(12), 100);
    assertEqual(yearly.amountAt(13), 0);
    assertEqual(yearly.amountAt(24), 100);

    var quarterly = new D.Overpayments({ payments: [{ amount: 7, everyMonths: 3 }], effect: new D.ReduceTerm() });
    assertEqual(quarterly.amountAt(1), 0);
    assertEqual(quarterly.amountAt(2), 0);
    assertEqual(quarterly.amountAt(3), 7);
    assertEqual(quarterly.amountAt(6), 7);
    assertEqual(quarterly.amountAt(7), 0);

    var mixed = new D.Overpayments({
      payments: [{ amount: 1, everyMonths: 1 }, { amount: 10, everyMonths: 3 }, { amount: 100, everyMonths: 12 }, { month: 12, amount: 1000 }],
      effect: new D.ReduceTerm()
    });
    assertEqual(mixed.amountAt(1), 1);
    assertEqual(mixed.amountAt(3), 11);
    assertEqual(mixed.amountAt(12), 1111);
    assertEqual(mixed.amountAt(13), 1);
    assertEqual(new D.Overpayments({ effect: new D.ReduceTerm() }).amountAt(5), 0);
  });

  test('Overpayments.fromJSON: migration from {recurring, oneTime} and {monthly}', function () {
    var effect = { kind: 'reduceTerm' };
    var old = D.Overpayments.fromJSON({ monthly: 5000, oneTime: [{ month: 2, amount: 1 }], effect: effect });
    assertDeepEqual(old.toJSON(), {
      payments: [{ amount: 5000, everyMonths: 1 }, { month: 2, amount: 1 }],
      effect: { kind: 'reduceTerm' }
    });
    assertEqual('monthly' in old, false);
    var rec = D.Overpayments.fromJSON({ recurring: [{ amount: 7, everyMonths: 3 }], oneTime: [{ month: 12, amount: 50000 }], effect: effect });
    assertDeepEqual(rec.toJSON(), { payments: [{ amount: 7, everyMonths: 3 }, { month: 12, amount: 50000 }], effect: effect });
    assertDeepEqual(D.Overpayments.fromJSON({ monthly: 0, oneTime: [], effect: effect }).toJSON(), { payments: [], effect: effect });
    // recurring takes priority over monthly
    var both = D.Overpayments.fromJSON({ monthly: 5, recurring: [{ amount: 9, everyMonths: 6 }], oneTime: [], effect: effect });
    assertDeepEqual(both.payments, [{ amount: 9, everyMonths: 6 }]);
    // payments outranks the legacy keys; a round trip against a literal
    var literal = { payments: [{ amount: 1, month: 4 }, { amount: 2, everyMonths: 12 }], effect: effect };
    var withOld = JSON.parse(JSON.stringify(literal));
    withOld.recurring = [{ amount: 9, everyMonths: 1 }];
    withOld.monthly = 3;
    assertDeepEqual(D.Overpayments.fromJSON(withOld).toJSON(), literal);
  });

  test('Overpayments.fromJSON: an old save of a whole mortgage', function () {
    var json = expectedJson('classic');
    json.overpayments = { monthly: 2500, oneTime: [], effect: { kind: 'reduceTerm' } };
    var m = D.ProductRegistry.fromJSON(json);
    assertDeepEqual(m.overpayments.payments, [{ amount: 2500, everyMonths: 1 }]);
    assertEqual(m.overpayments.amountAt(7), 2500);
  });

  test('Portfolio.fromJSON: an old save (recurring/oneTime/monthly) migrates nested objects', function () {
    var c = expectedJson('classic');
    c.id = 'c1';
    c.overpayments = { recurring: [{ amount: 1000, everyMonths: 1 }], oneTime: [{ month: 12, amount: 50000 }], effect: { kind: 'reduceTerm' } };
    var o = expectedJson('offset');
    o.id = 'o1';
    o.offsetAccount = { initial: 5, monthly: 300, oneTime: [{ month: 2, amount: -10 }] };
    var d = expectedDepositJson();
    d.id = 'd1';
    d.plan = { initial: 5, recurring: [{ amount: 10, everyMonths: 12 }], oneTime: [{ month: 3, amount: -1 }] };
    var p = D.Portfolio.fromJSON({ products: [c, o, d], links: [] });
    assertDeepEqual(p.get('c1').overpayments.payments, [{ amount: 1000, everyMonths: 1 }, { month: 12, amount: 50000 }]);
    assertDeepEqual(p.get('o1').offsetAccount.payments, [{ amount: 300, everyMonths: 1 }, { month: 2, amount: -10 }]);
    assertDeepEqual(p.get('d1').plan.payments, [{ amount: 10, everyMonths: 12 }, { month: 3, amount: -1 }]);
  });

  test('LoanTerms.loanAmount: the amount mode and the percent-of-value mode, rounding', function () {
    var start = { year: 2027, month: 1 };
    var amount = new D.LoanTerms({ principal: 1234567.89, termMonths: 12, startDate: start });
    assertEqual(amount.principalMode, 'amount');
    assertEqual(amount.loanAmount(), 1234567.89);
    var percent = new D.LoanTerms({ principal: 1, principalMode: 'percent', propertyValue: 10000000, principalPercent: 80, termMonths: 12, startDate: start });
    assertEqual(percent.loanAmount(), 8000000);
    var odd = new D.LoanTerms({ principal: 1, principalMode: 'percent', propertyValue: 1000001, principalPercent: 33.33, termMonths: 12, startDate: start });
    assertEqual(odd.loanAmount(), MC.core.round2(1000001 * 33.33 / 100));
  });

  test('LoanTerms: round trip against a literal, an old save and an unknown mode -> amount', function () {
    var literal = {
      principal: 100, principalMode: 'percent', propertyValue: 500, principalPercent: 50,
      termMonths: 12, startDate: { year: 2027, month: 1 }
    };
    assertEqual(JSON.stringify(D.LoanTerms.fromJSON(literal).toJSON()), JSON.stringify(literal));
    var old = D.LoanTerms.fromJSON({ principal: 700, termMonths: 12, startDate: { year: 2027, month: 1 } });
    assertEqual(old.principalMode, 'amount');
    assertEqual(old.propertyValue, 0);
    assertEqual(old.principalPercent, 80);
    assertEqual(old.loanAmount(), 700);
    var odd = D.LoanTerms.fromJSON({ principal: 700, principalMode: 'weird', propertyValue: 5, termMonths: 12, startDate: { year: 2027, month: 1 } });
    assertEqual(odd.principalMode, 'amount');
    assertEqual(odd.loanAmount(), 700);
  });

  test('Annuity: 1 000 000 / 12% / 120 months -> 14 347.09', function () {
    var a = new D.AnnuityRepayment();
    assertEqual(a.payment(1000000, 0.12 / 12, 120), 14347.09);
    assertEqual(a.principalPart(1000000, 0.12 / 12, 120), MC.core.round2(14347.09 - 10000));
  });

  test('Annuity: monthsLeft = 1 -> debt * (1 + r)', function () {
    var a = new D.AnnuityRepayment();
    assertEqual(a.payment(1000, 0.01, 1), MC.core.round2(1000 * 1.01));
    assertEqual(a.principalPart(1000, 0.01, 1), 1000);
  });

  test('Annuity: r = 0 -> debt / monthsLeft', function () {
    var a = new D.AnnuityRepayment();
    assertEqual(a.payment(1200, 0, 12), 100);
    assertEqual(a.principalPart(1200, 0, 12), 100);
    assertEqual(a.payment(1000, 0, 3), 333.33);
  });

  test('Differentiated: the principal share and the payment', function () {
    var d = new D.DifferentiatedRepayment();
    assertEqual(d.principalPart(1200, 0.01, 12), 100);
    assertEqual(d.payment(1200, 0.01, 12), 112);
    assertEqual(d.payment(1100, 0.01, 11), 111);
    assertEqual(d.payment(1200, 0, 12), 100);
  });

  test('Repayments/effects: create, fromJSON, an unknown kind throws', function () {
    assertEqual(D.Repayments.create('annuity').kind, 'annuity');
    assertEqual(D.Repayments.fromJSON({ kind: 'differentiated' }).kind, 'differentiated');
    assertEqual(D.OverpaymentEffects.create('reducePayment').kind, 'reducePayment');
    assertEqual(D.OffsetEffects.fromJSON({ kind: 'offsetReducesTerm' }).kind, 'offsetReducesTerm');
    assertEqual(D.ReduceTerm.prototype.kind, 'reduceTerm');
    var threw = 0;
    [
      function () { D.Repayments.fromJSON({ kind: 'x' }); },
      function () { D.OverpaymentEffects.fromJSON({ kind: 'offsetReducesTerm' }); },
      function () { D.OffsetEffects.create('reduceTerm'); }
    ].forEach(function (fn) {
      try { fn(); } catch (e) { threw++; }
    });
    assertEqual(threw, 3);
  });

  function throws(fn) {
    try { fn(); } catch (e) { return true; }
    return false;
  }

  // ---------- Mortgages ----------

  test('Serialisation: fromJSON(toJSON(x)) for ClassicMortgage', function () {
    var m = filled('classic');
    var copy = D.ProductRegistry.fromJSON(JSON.parse(JSON.stringify(m.toJSON())));
    assertTrue(copy instanceof D.ClassicMortgage);
    assertTrue(copy.terms instanceof D.LoanTerms);
    assertEqual(copy.kind, 'classic');
    assertDeepEqual(copy.toJSON(), expectedJson('classic'));
    assertDeepEqual(copy.rates.entries, [{ fromMonth: 1, annualRate: 9.5 }, { fromMonth: 25, annualRate: 7 }]);
    assertDeepEqual(copy.overpayments.payments, [{ amount: 1000, everyMonths: 1 }, { amount: 30000, everyMonths: 12 }, { month: 12, amount: 50000 }]);
    assertEqual(copy.overpayments.effect.kind, 'reducePayment');
    assertEqual(copy.report.month, 36);
  });

  test('ClassicMortgage: it knows nothing about a deposit, legacy keys are ignored', function () {
    var m = filled('classic');
    assertEqual('deposit' in m, false);
    assertEqual('useDepositInterest' in m, false);
    assertEqual('deposit' in m.toJSON(), false);
    assertEqual('useDepositInterest' in m.toJSON(), false);
    var json = expectedJson('classic');
    json.deposit = { plan: { initial: 0, payments: [] }, annualRate: 8, taxRate: 13 };
    json.useDepositInterest = true;
    var copy = D.ClassicMortgage.fromJSON(json);
    assertDeepEqual(copy.toJSON(), expectedJson('classic'));
    assertEqual('deposit' in copy, false);
    // a corrupt legacy deposit does not get in the way either
    json.deposit = 'garbage';
    assertDeepEqual(D.ClassicMortgage.fromJSON(json).toJSON(), expectedJson('classic'));
  });

  test('Serialisation: fromJSON(toJSON(x)) for OffsetMortgage', function () {
    var m = filled('offset');
    var copy = D.ProductRegistry.fromJSON(JSON.parse(JSON.stringify(m.toJSON())));
    assertTrue(copy instanceof D.OffsetMortgage);
    assertTrue(copy.offsetAccount instanceof D.CashFlowPlan);
    assertEqual(copy.offsetEffect.kind, 'offsetReducesPayment');
    assertEqual(copy.repayment.kind, 'differentiated');
    assertDeepEqual(copy.toJSON(), expectedJson('offset'));
    assertEqual(copy.offsetAccount.initial, 100000);
    assertDeepEqual(copy.offsetAccount.payments, [{ amount: 5000, everyMonths: 1 }, { month: 6, amount: -2000 }]);
    assertEqual(copy.report.month, 36);
    assertEqual(copy.terms.startDate.month, 2);
  });

  // ---------- Deposit ----------

  test('Deposit: the constructor and a round trip against a literal', function () {
    var d = filledDeposit();
    assertEqual(d.kind, 'deposit');
    assertDeepEqual(d.toJSON(), expectedDepositJson());
    var copy = D.ProductRegistry.fromJSON(JSON.parse(JSON.stringify(d.toJSON())));
    assertTrue(copy instanceof D.Deposit);
    assertTrue(copy.plan instanceof D.CashFlowPlan);
    assertTrue(copy.report instanceof D.ReportPoint);
    assertDeepEqual(copy.toJSON(), expectedDepositJson());
    assertEqual(copy.termMonths, 120);
    assertEqual(copy.plan.initial, 500000);
    assertEqual(copy.plan.flowAt(6), 10000 - 2000);
    assertTrue(copy.rates instanceof D.RateSchedule);
    assertEqual(copy.rates.rateAt(1), 9);
    assertEqual(copy.rates.rateAt(13), 7);
    assertEqual('annualRate' in copy, false);
    assertEqual(copy.taxRate, 13);
    assertEqual(copy.report.month, 36);
  });

  test('Deposit.fromJSON: without startDate - the current month; Portfolio: a linked deposit gets the mortgage date', function () {
    var now = new Date();
    var current = { year: now.getFullYear(), month: now.getMonth() + 1 };
    var noDate = expectedDepositJson();
    delete noDate.startDate;
    assertDeepEqual(D.Deposit.fromJSON(noDate).startDate, current);

    var c = expectedJson('classic'); // start 2030-02
    var linked = expectedDepositJson(); linked.id = 'dl'; delete linked.startDate;
    var alone = expectedDepositJson(); alone.id = 'da'; delete alone.startDate;
    var dated = expectedDepositJson(); dated.id = 'dd'; dated.startDate = { year: 2024, month: 11 };
    var p = D.Portfolio.fromJSON({
      products: [c, linked, alone, dated],
      links: [{ mortgageId: c.id, depositId: 'dl', useInterest: false }]
    });
    assertDeepEqual(p.get('dl').startDate, { year: 2030, month: 2 });
    assertDeepEqual(p.get('da').startDate, current);
    assertDeepEqual(p.get('dd').startDate, { year: 2024, month: 11 }); // the given date is not overwritten
    // the date is not tied to the mortgage object: editing the deposit does not touch the mortgage
    p.get('dl').startDate.year = 1999;
    assertEqual(p.get(c.id).terms.startDate.year, 2030);
  });

  test('Deposit.fromJSON: the legacy annualRate number -> a one-entry schedule', function () {
    var json = expectedDepositJson();
    delete json.rates;
    json.annualRate = 9;
    var d = D.Deposit.fromJSON(JSON.parse(JSON.stringify(json)));
    assertDeepEqual(d.toJSON().rates, { entries: [{ fromMonth: 1, annualRate: 9 }] });
    assertEqual('annualRate' in d.toJSON(), false);
    assertEqual(d.taxRate, 13);
    // if rates is present, it outranks the legacy annualRate
    var both = expectedDepositJson();
    both.annualRate = 1;
    assertDeepEqual(D.Deposit.fromJSON(both).toJSON(), expectedDepositJson());
  });

  test('Deposit.fromJSON throws on corrupt data', function () {
    var bad = [];
    function variant(change) {
      var json = expectedDepositJson();
      change(json);
      bad.push(json);
    }
    variant(function (j) { delete j.id; });
    variant(function (j) { j.id = ''; });
    variant(function (j) { j.kind = 'classic'; });
    variant(function (j) { delete j.plan; });
    variant(function (j) { j.plan.payments = 5; });
    variant(function (j) { delete j.report; });
    variant(function (j) { delete j.rates; });
    variant(function (j) { j.rates = { entries: 5 }; });
    bad.push(null, 'x', {});
    bad.forEach(function (obj, i) {
      assertTrue(throws(function () { D.Deposit.fromJSON(obj); }), 'an exception was expected for variant ' + i);
    });
  });

  test('DepositLink: toJSON/fromJSON and corrupt data', function () {
    var link = new D.DepositLink({ mortgageId: 'a', depositId: 'b', useInterest: true });
    assertDeepEqual(link.toJSON(), { mortgageId: 'a', depositId: 'b', useInterest: true });
    var copy = D.DepositLink.fromJSON(JSON.parse(JSON.stringify(link.toJSON())));
    assertTrue(copy instanceof D.DepositLink);
    assertDeepEqual(copy.toJSON(), { mortgageId: 'a', depositId: 'b', useInterest: true });
    assertEqual(new D.DepositLink({ mortgageId: 'a', depositId: 'b' }).useInterest, false);
    assertEqual(D.DepositLink.fromJSON({ mortgageId: 'a', depositId: 'b' }).useInterest, false);
    assertEqual(D.DepositLink.fromJSON({ mortgageId: 'a', depositId: 'b', useInterest: 'yes' }).useInterest, false);
    [null, {}, { mortgageId: 'a' }, { depositId: 'b' }, { mortgageId: '', depositId: 'b' }, { mortgageId: 1, depositId: 'b' }]
      .forEach(function (obj, i) {
        assertTrue(throws(function () { D.DepositLink.fromJSON(obj); }), 'an exception was expected for variant ' + i);
      });
  });

  // ---------- ProductRegistry ----------

  test('ProductRegistry: kinds and classes', function () {
    assertDeepEqual(D.ProductRegistry.kinds, ['classic', 'offset', 'deposit']);
    assertTrue(D.ProductRegistry.classes.classic === D.ClassicMortgage);
    assertTrue(D.ProductRegistry.classes.offset === D.OffsetMortgage);
    assertTrue(D.ProductRegistry.classes.deposit === D.Deposit);
    assertEqual(D.MortgageRegistry, undefined);
  });

  test('ProductRegistry.fromJSON throws on an unknown kind and corrupt data', function () {
    var bad = [
      { kind: 'unknown' },
      {},
      null,
      { kind: 'classic', id: 'x' },
      { kind: 'offset', id: 'x', terms: {} },
      { kind: 'deposit', id: 'x' },
      { kind: 'toString', id: 'x' }
    ];
    bad.forEach(function (obj, i) {
      assertTrue(throws(function () { D.ProductRegistry.fromJSON(obj); }), 'an exception was expected for variant ' + i);
    });
  });

  test('ProductRegistry.duplicate: a new id, independent objects, the same name', function () {
    ['classic', 'offset', 'deposit'].forEach(function (kind) {
      var m = kind === 'deposit' ? filledDeposit() : filled(kind);
      var copy = D.ProductRegistry.duplicate(m);
      assertTrue(copy.id !== m.id, 'the id must differ');
      assertEqual(copy.name, m.name);
      assertEqual(copy.kind, kind);
      var expected = kind === 'deposit' ? expectedDepositJson() : expectedJson(kind);
      expected.id = copy.id;
      assertDeepEqual(copy.toJSON(), expected);
      if (kind === 'deposit') {
        copy.plan.payments.length = 0;
        copy.plan.initial = 1;
        copy.report.month = 1;
        assertEqual(m.plan.payments.length, 2);
        assertEqual(m.plan.initial, 500000);
        assertEqual(m.report.month, 36);
        return;
      }
      assertTrue(copy.terms !== m.terms && copy.rates !== m.rates && copy.overpayments !== m.overpayments);
      assertTrue(copy.rates.entries !== m.rates.entries);
      copy.terms.principal = 1;
      copy.terms.startDate.year = 1900;
      copy.rates.entries[0].annualRate = 99;
      copy.overpayments.payments.push({ month: 1, amount: 1 });
      copy.overpayments.payments[0].amount = 1;
      copy.overpayments.payments.push({ amount: 1, everyMonths: 2 });
      if (kind === 'offset') { copy.offsetAccount.initial = 7; }
      assertTrue(m.terms.principal !== 1);
      assertTrue(m.terms.startDate.year !== 1900);
      assertEqual(m.rates.entries[0].annualRate, 9.5);
      assertDeepEqual(m.overpayments.payments, [{ amount: 1000, everyMonths: 1 }, { amount: 30000, everyMonths: 12 }, { month: 12, amount: 50000 }]);
      if (kind === 'offset') { assertEqual(m.offsetAccount.initial, 100000); }
    });
  });

  test('ProductRegistry.createDefault: classic', function () {
    var before = new Date();
    var m = D.ProductRegistry.createDefault('classic');
    var after = new Date();
    assertEqual(m.kind, 'classic');
    assertEqual(m.name, MC.core.t('default.classicName'));
    assertEqual(m.repayment.kind, 'annuity');
    assertEqual(m.overpayments.effect.kind, 'reduceTerm');
    assertEqual(m.overpayments.amountAt(1), 0);
    assertDeepEqual(m.overpayments.toJSON(), { payments: [], effect: { kind: 'reduceTerm' } });
    assertTrue(typeof m.id === 'string' && m.id.length > 0);
    assertTrue(m.terms.principal > 0 && m.terms.termMonths > 0);
    assertTrue(m.report.month >= 1 && m.report.month <= m.terms.termMonths);
    // on a boundary both the "before" and "after" month are acceptable
    var stamp = m.terms.startDate.year * 12 + m.terms.startDate.month;
    assertTrue(stamp === before.getFullYear() * 12 + before.getMonth() + 1 ||
      stamp === after.getFullYear() * 12 + after.getMonth() + 1, 'the start date is the current month');
    assertEqual(m.rates.entries[0].fromMonth, 1);
  });

  test('ProductRegistry.createDefault: offset, unique ids', function () {
    var m = D.ProductRegistry.createDefault('offset');
    assertEqual(m.kind, 'offset');
    assertEqual(m.name, MC.core.t('default.offsetName'));
    assertEqual(m.offsetEffect.kind, 'offsetReducesTerm');
    assertEqual(m.offsetAccount.initial, 0);
    assertEqual(m.offsetAccount.flowAt(1), 0);
    assertTrue(m.id !== D.ProductRegistry.createDefault('offset').id);
  });

  test('ProductRegistry.createDefault: deposit', function () {
    var d = D.ProductRegistry.createDefault('deposit');
    var json = d.toJSON();
    assertTrue(typeof json.id === 'string' && json.id.length > 0);
    json.id = 'x';
    assertDeepEqual(json, {
      kind: 'deposit',
      id: 'x',
      name: 'Deposit',
      termMonths: 240,
      startDate: { year: new Date().getFullYear(), month: new Date().getMonth() + 1 },
      plan: { initial: 1000000, payments: [] },
      rates: { entries: [{ fromMonth: 1, annualRate: 8 }] },
      taxRate: 13,
      report: { month: 60 }
    });
    assertTrue(d.id !== D.ProductRegistry.createDefault('deposit').id);
  });

  test('ProductRegistry.createDefault: an unknown kind throws', function () {
    assertTrue(throws(function () { D.ProductRegistry.createDefault('nope'); }));
  });

  // ---------- Portfolio ----------

  // A portfolio: C1, O1, D1, D2 (ids are fixed), no links.
  function samplePortfolio() {
    var c1 = filled('classic');
    c1.id = 'C1';
    var o1 = filled('offset');
    o1.id = 'O1';
    var d1 = filledDeposit();
    d1.id = 'D1';
    var d2 = filledDeposit();
    d2.id = 'D2';
    return new D.Portfolio({ products: [c1, o1, d1, d2], links: [] });
  }

  function ids(portfolio) {
    return portfolio.products.map(function (p) { return p.id; });
  }

  test('Portfolio: get/add/mortgages/deposits', function () {
    var p = samplePortfolio();
    assertEqual(p.get('O1').kind, 'offset');
    assertEqual(p.get('missing'), null);
    assertDeepEqual(p.mortgages().map(function (x) { return x.id; }), ['C1', 'O1']);
    assertDeepEqual(p.deposits().map(function (x) { return x.id; }), ['D1', 'D2']);
    var extra = filledDeposit();
    extra.id = 'D3';
    p.add(extra);
    assertDeepEqual(ids(p), ['C1', 'O1', 'D1', 'D2', 'D3']);
    assertTrue(throws(function () { p.add(extra); }), 'a repeated id');
  });

  test('Portfolio.addLink / removeLink / changeLinkDeposit: several deposits on a mortgage', function () {
    var p = samplePortfolio();
    assertDeepEqual(p.linksOf('C1'), []);
    p.addLink('C1', 'D1');
    assertDeepEqual(p.linksOf('C1')[0].toJSON(), { mortgageId: 'C1', depositId: 'D1', useInterest: false });
    p.addLink('C1', 'D2');
    assertDeepEqual(p.linksOf('C1').map(function (l) { return l.depositId; }), ['D1', 'D2']); // order of addition
    p.setUseInterest('C1', 'D1', true);
    assertEqual(p.links.length, 2);
    assertEqual(p.linksOf('O1').length, 0);

    // replacing a deposit keeps useInterest and the position
    var d3 = filledDeposit();
    d3.id = 'D3';
    p.add(d3);
    p.changeLinkDeposit('C1', 'D1', 'D3');
    assertDeepEqual(p.linksOf('C1').map(function (l) { return l.depositId + ':' + l.useInterest; }), ['D3:true', 'D2:false']);
    p.changeLinkDeposit('C1', 'D2', 'D2'); // the same deposit is not a duplicate
    assertEqual(p.links.length, 2);

    p.removeLink('C1', 'D3');
    assertDeepEqual(p.linksOf('C1').map(function (l) { return l.depositId; }), ['D2']);
    p.removeLink('C1', 'D3'); // no link - does nothing
    p.removeLink('missing', 'D1');
    assertEqual(p.links.length, 1);
    // after removal a new link again has useInterest = false
    p.addLink('C1', 'D3');
    assertEqual(p.linksOf('C1')[1].useInterest, false);
  });

  test('Portfolio.addLink / changeLinkDeposit / setUseInterest: errors', function () {
    var p = samplePortfolio();
    assertTrue(throws(function () { p.addLink('O1', 'D1'); }), 'an offset mortgage');
    assertTrue(throws(function () { p.addLink('C1', 'missing'); }), 'no deposit');
    assertTrue(throws(function () { p.addLink('C1', 'O1'); }), 'not a deposit');
    assertTrue(throws(function () { p.addLink('D1', 'D2'); }), 'a deposit as a mortgage');
    assertTrue(throws(function () { p.addLink('missing', 'D1'); }), 'no mortgage');
    assertEqual(p.links.length, 0);
    p.addLink('C1', 'D1');
    p.addLink('C1', 'D2');
    assertTrue(throws(function () { p.addLink('C1', 'D1'); }), 'the pair already exists');
    assertTrue(throws(function () { p.changeLinkDeposit('C1', 'D1', 'D2'); }), 'a duplicate pair');
    assertTrue(throws(function () { p.changeLinkDeposit('C1', 'D1', 'missing'); }), 'no deposit');
    assertTrue(throws(function () { p.changeLinkDeposit('C1', 'missing', 'D2'); }), 'no link');
    assertTrue(throws(function () { p.setUseInterest('C1', 'missing', true); }), 'no link');
    assertTrue(throws(function () { p.setUseInterest('O1', 'D1', true); }), 'no link on an offset mortgage');
    assertEqual(p.links.length, 2);
    assertEqual(p.linksOf('C1')[0].depositId, 'D1');
  });

  test('Portfolio.setUseInterest: each link has its own flag', function () {
    var p = samplePortfolio();
    p.addLink('C1', 'D1');
    p.addLink('C1', 'D2');
    p.setUseInterest('C1', 'D2', true);
    assertEqual(p.findLink('C1', 'D1').useInterest, false);
    assertEqual(p.findLink('C1', 'D2').useInterest, true);
    p.setUseInterest('C1', 'D2', false);
    assertEqual(p.findLink('C1', 'D2').useInterest, false);
  });

  test('Portfolio: one deposit on several mortgages', function () {
    var p = samplePortfolio();
    var c2 = filled('classic');
    c2.id = 'C2';
    p.add(c2);
    p.addLink('C1', 'D1');
    p.addLink('C2', 'D1');
    p.setUseInterest('C2', 'D1', true);
    assertEqual(p.links.length, 2);
    assertEqual(p.linksOf('C1')[0].depositId, 'D1');
    assertEqual(p.linksOf('C2')[0].depositId, 'D1');
    assertEqual(p.findLink('C1', 'D1').useInterest, false);
    assertEqual(p.findLink('C2', 'D1').useInterest, true);
  });

  test('Portfolio.remove: link cascade', function () {
    var p = samplePortfolio();
    var c2 = filled('classic');
    c2.id = 'C2';
    p.add(c2);
    p.addLink('C1', 'D1');
    p.addLink('C1', 'D2');
    p.addLink('C2', 'D1');
    p.remove('C1');
    assertDeepEqual(ids(p), ['O1', 'D1', 'D2', 'C2']);
    assertEqual(p.links.length, 1);
    assertEqual(p.linksOf('C1').length, 0);
    assertEqual(p.linksOf('C2')[0].depositId, 'D1');
    p.addLink('C2', 'D2');
    p.remove('D1');
    assertDeepEqual(ids(p), ['O1', 'D2', 'C2']);
    assertDeepEqual(p.links.map(function (l) { return l.mortgageId + '>' + l.depositId; }), ['C2>D2']);
    p.remove('no such id');
    assertEqual(p.products.length, 3);
  });

  test('Portfolio.move: a shift by one position, never past the edges, links are kept', function () {
    var p = samplePortfolio();
    p.addLink('C1', 'D1');
    p.move('C1', 1);
    assertDeepEqual(ids(p), ['O1', 'C1', 'D1', 'D2']);
    p.move('D2', 1);
    p.move('O1', -1);
    assertDeepEqual(ids(p), ['O1', 'C1', 'D1', 'D2']);
    assertEqual(p.linksOf('C1').length, 1);
  });

  test('Portfolio.copyTo: a mortgage travels with copies of its deposits and links, the source is unchanged', function () {
    var p = samplePortfolio();
    p.addLink('C1', 'D1');
    p.addLink('C1', 'D2');
    p.setUseInterest('C1', 'D1', true);
    var before = JSON.stringify(p.toJSON());
    var target = new D.Portfolio({ products: [], links: [] });
    var copy = p.copyTo(target, 'C1');
    assertEqual(JSON.stringify(p.toJSON()), before);
    assertEqual(target.products.length, 3);
    assertEqual(target.products[0], copy);
    assertTrue(copy.id !== 'C1');
    assertEqual(copy.name, p.get('C1').name);
    var links = target.linksOf(copy.id);
    assertEqual(links.length, 2);
    assertTrue(links[0].depositId !== 'D1' && links[1].depositId !== 'D2');
    assertEqual(links[0].useInterest, true);
    assertEqual(links[1].useInterest, false);
    assertEqual(target.get(links[0].depositId).kind, 'deposit');
    assertTrue(target.get(links[0].depositId) !== p.get('D1'));
    var dep = p.copyTo(target, 'D1');
    assertEqual(target.products.length, 4);
    assertEqual(target.linksOf(copy.id).length, 2);
    assertEqual(dep.kind, 'deposit');
    assertTrue(throws(function () { p.copyTo(target, 'missing'); }));
  });

  test('Portfolio.duplicate: a mortgage copies all its links, a deposit does not', function () {
    var p = samplePortfolio();
    p.addLink('C1', 'D1');
    p.addLink('C1', 'D2');
    p.setUseInterest('C1', 'D1', true);
    var copy = p.duplicate('C1');
    assertEqual(copy.kind, 'classic');
    assertTrue(copy.id !== 'C1');
    assertEqual(copy.name, p.get('C1').name);
    assertDeepEqual(ids(p), ['C1', copy.id, 'O1', 'D1', 'D2']);
    assertEqual(p.links.length, 4);
    assertDeepEqual(p.linksOf(copy.id).map(function (l) { return l.toJSON(); }), [
      { mortgageId: copy.id, depositId: 'D1', useInterest: true },
      { mortgageId: copy.id, depositId: 'D2', useInterest: false }
    ]);
    // links are independent
    p.setUseInterest(copy.id, 'D1', false);
    assertEqual(p.findLink('C1', 'D1').useInterest, true);

    var dep = p.duplicate('D1');
    assertDeepEqual(ids(p), ['C1', copy.id, 'O1', 'D1', dep.id, 'D2']);
    assertEqual(dep.kind, 'deposit');
    assertEqual(p.links.length, 4);

    var off = p.duplicate('O1');
    assertEqual(off.kind, 'offset');
    assertEqual(p.links.length, 4);

    // a duplicate of a mortgage without links has no links
    var c = p.duplicate(copy.id);
    assertEqual(p.links.length, 6);
    p.removeLink(c.id, 'D1');
    p.removeLink(c.id, 'D2');
    var c3 = p.duplicate(c.id);
    assertEqual(p.linksOf(c3.id).length, 0);

    assertTrue(throws(function () { p.duplicate('missing'); }));
  });

  test('Portfolio: round trip against a literal', function () {
    var p = samplePortfolio();
    p.addLink('C1', 'D2');
    p.addLink('C1', 'D1');
    p.setUseInterest('C1', 'D2', true);
    var json = JSON.parse(JSON.stringify(p.toJSON()));
    var copy = D.Portfolio.fromJSON(json);
    assertTrue(copy instanceof D.Portfolio);
    assertTrue(copy.links[0] instanceof D.DepositLink);
    assertTrue(copy.products[3] instanceof D.Deposit);
    var c1 = expectedJson('classic');
    c1.id = 'C1';
    var o1 = expectedJson('offset');
    o1.id = 'O1';
    var d1 = expectedDepositJson();
    d1.id = 'D1';
    var d2 = expectedDepositJson();
    d2.id = 'D2';
    assertDeepEqual(copy.toJSON(), {
      products: [c1, o1, d1, d2],
      links: [
        { mortgageId: 'C1', depositId: 'D2', useInterest: true },
        { mortgageId: 'C1', depositId: 'D1', useInterest: false }
      ]
    });
    assertDeepEqual(copy.linksOf('C1').map(function (l) { return l.depositId; }), ['D2', 'D1']);
    assertDeepEqual(D.Portfolio.fromJSON({ products: json.products }).links, []);
  });

  test('Portfolio.fromJSON: corrupt data -> Error', function () {
    function base() {
      var p = samplePortfolio();
      p.addLink('C1', 'D1');
      return JSON.parse(JSON.stringify(p.toJSON()));
    }
    var bad = [];
    function variant(change) {
      var json = base();
      change(json);
      bad.push(json);
    }
    variant(function (j) { j.products[0].kind = 'unknown'; });
    variant(function (j) { j.products[1].id = 'C1'; });
    variant(function (j) { j.links[0].depositId = 'missing'; });
    variant(function (j) { j.links[0].mortgageId = 'missing'; });
    variant(function (j) { j.links[0].depositId = 'O1'; });
    variant(function (j) { j.links[0].mortgageId = 'O1'; });
    variant(function (j) { j.links[0].mortgageId = 'D2'; });
    variant(function (j) { j.links.push({ mortgageId: 'C1', depositId: 'D1', useInterest: false }); }); // a repeated pair
    variant(function (j) { j.links = {}; });
    variant(function (j) { j.products = {}; });
    variant(function (j) { delete j.products[2].plan; });
    bad.push(null, 'x', {}, { mortgages: 5 }, { mortgages: [{ kind: 'zzz' }] });
    bad.forEach(function (obj, i) {
      assertTrue(throws(function () { D.Portfolio.fromJSON(obj); }), 'an exception was expected for variant ' + i);
    });
  });

  test('Portfolio.createDefault: classic + offset, no deposits or links', function () {
    var p = D.Portfolio.createDefault();
    assertDeepEqual(p.products.map(function (x) { return x.kind; }), ['classic', 'offset']);
    assertEqual(p.links.length, 0);
    assertEqual(p.deposits().length, 0);
    assertTrue(p.products[0].id !== p.products[1].id);
    assertDeepEqual(D.Portfolio.fromJSON(p.toJSON()).toJSON(), p.toJSON());
  });

  // ---------- Migration of the legacy format ----------

  function legacyClassic(id, deposit, useDepositInterest) {
    var json = expectedJson('classic');
    json.id = id;
    json.name = 'Old ' + id;
    json.terms.termMonths = 180;
    json.report = { month: 48 };
    if (deposit !== undefined) { json.deposit = deposit; }
    if (useDepositInterest !== undefined) { json.useDepositInterest = useDepositInterest; }
    return json;
  }

  test('Migration: a mortgage with an old deposit and useDepositInterest true', function () {
    var old = {
      mortgages: [legacyClassic('A', {
        plan: { initial: 200000, payments: [{ amount: 5000, everyMonths: 1 }, { month: 4, amount: -100 }] },
        annualRate: 7.5,
        taxRate: 13
      }, true)]
    };
    var p = D.Portfolio.fromJSON(JSON.parse(JSON.stringify(old)));
    assertEqual(p.products.length, 2);
    assertEqual(p.products[0].id, 'A');
    assertEqual(p.products[1].kind, 'deposit');
    var depId = p.products[1].id;
    assertTrue(depId !== 'A' && depId.length > 0);
    var json = p.toJSON();
    json.products[1].id = 'X';
    var a = legacyClassic('A');
    assertDeepEqual(json, {
      products: [
        a,
        {
          kind: 'deposit',
          id: 'X',
          name: 'Old A: Deposit',
          termMonths: 180,
          startDate: { year: 2030, month: 2 }, // the linked mortgage's date
          plan: { initial: 200000, payments: [{ amount: 5000, everyMonths: 1 }, { month: 4, amount: -100 }] },
          rates: { entries: [{ fromMonth: 1, annualRate: 7.5 }] },
          taxRate: 13,
          report: { month: 48 }
        }
      ],
      links: [{ mortgageId: 'A', depositId: depId, useInterest: true }]
    });
  });

  test('Migration: useDepositInterest false or absent -> useInterest false', function () {
    var dep = { plan: { initial: 1, payments: [] }, annualRate: 5, taxRate: 0 };
    var p = D.Portfolio.fromJSON({ mortgages: [legacyClassic('A', dep, false), legacyClassic('B', dep)] });
    assertEqual(p.products.length, 4);
    assertEqual(p.links.length, 2);
    assertEqual(p.linksOf('A')[0].useInterest, false);
    assertEqual(p.linksOf('B')[0].useInterest, false);
    assertTrue(p.linksOf('A')[0].depositId !== p.linksOf('B')[0].depositId);
  });

  test('Migration: without deposit -> no deposit and no link; a null deposit too', function () {
    var json = { mortgages: [legacyClassic('A', null, true), legacyClassic('B'), expectedJson('offset')] };
    var p = D.Portfolio.fromJSON(json);
    assertDeepEqual(ids(p), ['A', 'B', 'id-offset']);
    assertEqual(p.links.length, 0);
    assertEqual(p.deposits().length, 0);
    assertEqual('deposit' in p.products[0], false);
  });

  test('Migration: several mortgages, the deposit is inserted right after its mortgage', function () {
    var dep1 = { plan: { initial: 10, payments: [] }, annualRate: 4, taxRate: 13 };
    var dep2 = { plan: { initial: 20, payments: [{ amount: 1, everyMonths: 1 }] }, annualRate: 6, taxRate: 13 };
    var off = expectedJson('offset');
    var p = D.Portfolio.fromJSON({
      mortgages: [legacyClassic('A', dep1, true), off, legacyClassic('B', dep2, false)]
    });
    assertDeepEqual(p.products.map(function (x) { return x.kind; }),
      ['classic', 'deposit', 'offset', 'classic', 'deposit']);
    assertEqual(p.products[1].plan.initial, 10);
    assertEqual(p.products[4].plan.initial, 20);
    assertDeepEqual(p.products[4].rates.toJSON(), { entries: [{ fromMonth: 1, annualRate: 6 }] });
    assertEqual(p.linksOf('A')[0].depositId, p.products[1].id);
    assertEqual(p.linksOf('B')[0].depositId, p.products[4].id);
    assertEqual(p.linksOf('A')[0].useInterest, true);
    assertEqual(p.linksOf('B')[0].useInterest, false);
    assertEqual(p.linksOf('id-offset').length, 0);
    // the migration result is a valid new format
    assertDeepEqual(D.Portfolio.fromJSON(p.toJSON()).toJSON(), p.toJSON());
  });

  test('Migration: a corrupt old deposit -> Error', function () {
    assertTrue(throws(function () {
      D.Portfolio.fromJSON({ mortgages: [legacyClassic('A', { annualRate: 5, taxRate: 0 }, true)] });
    }));
    assertTrue(throws(function () {
      D.Portfolio.fromJSON({ mortgages: [legacyClassic('A'), legacyClassic('A')] });
    }), 'duplicate id');
  });
})();
