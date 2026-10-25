(function () {
  'use strict';

  var D = MC.domain;
  var classes = { classic: D.ClassicMortgage, offset: D.OffsetMortgage, deposit: D.Deposit };
  var counter = 0;

  function newId() {
    counter += 1;
    return 'm' + counter + '-' + Math.random().toString(36).slice(2, 8);
  }

  function hasKind(kind) {
    return Object.prototype.hasOwnProperty.call(classes, kind);
  }

  function fromJSON(obj) {
    if (!obj || typeof obj !== 'object' || !hasKind(obj.kind)) {
      throw new Error('ProductRegistry.fromJSON: unknown kind ' + (obj && obj.kind));
    }
    return classes[obj.kind].fromJSON(obj);
  }

  // ASSUMPTION: mortgage defaults are 5,000,000 for 240 months, 10% a year, report month 60, annuity, no overpayments.
  function createDefault(kind) {
    if (!hasKind(kind)) { throw new Error('ProductRegistry.createDefault: unknown kind ' + kind); }

    if (kind === 'deposit') {
      var today = new Date();
      return new D.Deposit({
        id: newId(),
        name: MC.core.t('default.depositName'),
        termMonths: 240,
        startDate: { year: today.getFullYear(), month: today.getMonth() + 1 },
        plan: new D.CashFlowPlan({ initial: 1000000, payments: [] }),
        rates: new D.RateSchedule({ entries: [{ fromMonth: 1, annualRate: 8 }] }),
        taxRate: 13,
        report: new D.ReportPoint({ month: 60 })
      });
    }

    var now = new Date();
    var common = {
      id: newId(),
      terms: new D.LoanTerms({
        principal: 5000000,
        termMonths: 240,
        startDate: { year: now.getFullYear(), month: now.getMonth() + 1 }
      }),
      rates: new D.RateSchedule({ entries: [{ fromMonth: 1, annualRate: 10 }] }),
      repayment: new D.AnnuityRepayment(),
      overpayments: new D.Overpayments({ payments: [], effect: new D.ReduceTerm() }),
      report: new D.ReportPoint({ month: 60 })
    };

    if (kind === 'classic') {
      common.name = MC.core.t('default.classicName');
      return new D.ClassicMortgage(common);
    }
    common.name = MC.core.t('default.offsetName');
    common.offsetAccount = new D.CashFlowPlan({ initial: 0, payments: [] });
    common.offsetEffect = new D.OffsetReducesTerm();
    return new D.OffsetMortgage(common);
  }

  // Copies via toJSON/fromJSON so nested objects are independent; the name is kept.
  function duplicate(product) {
    var copy = fromJSON(product.toJSON());
    copy.id = newId();
    return copy;
  }

  D.ProductRegistry = {
    kinds: ['classic', 'offset', 'deposit'],
    classes: classes,
    fromJSON: fromJSON,
    createDefault: createDefault,
    duplicate: duplicate
  };
})();
