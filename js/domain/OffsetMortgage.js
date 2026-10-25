(function () {
  'use strict';

  var D = MC.domain;

  function OffsetMortgage(opts) {
    this.kind = 'offset';
    this.id = opts.id;
    this.name = opts.name;
    this.terms = opts.terms;
    this.rates = opts.rates;
    this.repayment = opts.repayment;
    this.overpayments = opts.overpayments;
    // Insurance and fees: payment entries like Overpayments.payments; they do not affect the debt
    this.fees = MC.domain.Payments.copyPayments(opts.fees);
    this.offsetAccount = opts.offsetAccount;
    this.offsetEffect = opts.offsetEffect;
    this.report = opts.report;
  }

  OffsetMortgage.prototype.toJSON = function () {
    return {
      kind: this.kind,
      id: this.id,
      name: this.name,
      terms: this.terms.toJSON(),
      rates: this.rates.toJSON(),
      repayment: this.repayment.toJSON(),
      overpayments: this.overpayments.toJSON(),
      fees: MC.domain.Payments.copyPayments(this.fees),
      offsetAccount: this.offsetAccount.toJSON(),
      offsetEffect: this.offsetEffect.toJSON(),
      report: this.report.toJSON()
    };
  };

  OffsetMortgage.fromJSON = function (obj) {
    if (!obj || obj.kind !== 'offset') { throw new Error('OffsetMortgage.fromJSON: expected kind offset'); }
    if (typeof obj.id !== 'string' || !obj.id) { throw new Error('OffsetMortgage.fromJSON: missing id'); }
    return new OffsetMortgage({
      id: obj.id,
      name: obj.name,
      terms: D.LoanTerms.fromJSON(obj.terms),
      rates: D.RateSchedule.fromJSON(obj.rates),
      repayment: D.Repayments.fromJSON(obj.repayment),
      overpayments: D.Overpayments.fromJSON(obj.overpayments),
      fees: obj.fees,
      offsetAccount: D.CashFlowPlan.fromJSON(obj.offsetAccount),
      offsetEffect: D.OffsetEffects.fromJSON(obj.offsetEffect),
      report: D.ReportPoint.fromJSON(obj.report)
    });
  };

  D.OffsetMortgage = OffsetMortgage;
})();
