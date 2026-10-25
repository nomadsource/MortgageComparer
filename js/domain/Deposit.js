(function () {
  'use strict';

  function Deposit(opts) {
    this.kind = 'deposit';
    this.id = opts.id;
    this.name = opts.name;
    this.termMonths = opts.termMonths;
    // Start date: month 1 of the deposit (like LoanTerms.startDate); plan/rates/report/termMonths months count from it.
    this.startDate = { year: opts.startDate.year, month: opts.startDate.month };
    this.plan = opts.plan;
    this.rates = opts.rates;
    this.taxRate = opts.taxRate;
    this.report = opts.report;
  }

  Deposit.prototype.toJSON = function () {
    return {
      kind: this.kind,
      id: this.id,
      name: this.name,
      termMonths: this.termMonths,
      startDate: { year: this.startDate.year, month: this.startDate.month },
      plan: this.plan.toJSON(),
      rates: this.rates.toJSON(),
      taxRate: this.taxRate,
      report: this.report.toJSON()
    };
  };

  Deposit.fromJSON = function (obj) {
    if (!obj || obj.kind !== 'deposit') { throw new Error('Deposit.fromJSON: expected kind deposit'); }
    if (typeof obj.id !== 'string' || !obj.id) { throw new Error('Deposit.fromJSON: missing id'); }
    // Legacy format: a single annualRate number instead of a rate schedule.
    var rates;
    if (obj.rates === undefined && typeof obj.annualRate === 'number') {
      rates = new MC.domain.RateSchedule({ entries: [{ fromMonth: 1, annualRate: obj.annualRate }] });
    } else {
      rates = MC.domain.RateSchedule.fromJSON(obj.rates);
    }
    // ASSUMPTION: an old save without startDate gets the current month; Portfolio.fromJSON then gives
    // the deposit its linked mortgage's start date (so earlier pair results do not change).
    var start = obj.startDate;
    if (!start || typeof start !== 'object') {
      var now = new Date();
      start = { year: now.getFullYear(), month: now.getMonth() + 1 };
    }
    return new Deposit({
      id: obj.id,
      name: obj.name,
      termMonths: obj.termMonths,
      startDate: start,
      plan: MC.domain.CashFlowPlan.fromJSON(obj.plan),
      rates: rates,
      taxRate: obj.taxRate,
      report: MC.domain.ReportPoint.fromJSON(obj.report)
    });
  };

  MC.domain.Deposit = Deposit;
})();
