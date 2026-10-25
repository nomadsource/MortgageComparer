(function () {
  'use strict';

  var D = MC.domain;

  function ClassicMortgage(opts) {
    this.kind = 'classic';
    this.id = opts.id;
    this.name = opts.name;
    this.terms = opts.terms;
    this.rates = opts.rates;
    this.repayment = opts.repayment;
    this.overpayments = opts.overpayments;
    // Insurance and fees: payment entries like Overpayments.payments; they do not affect the debt
    this.fees = MC.domain.Payments.copyPayments(opts.fees);
    this.report = opts.report;
  }

  ClassicMortgage.prototype.toJSON = function () {
    return {
      kind: this.kind,
      id: this.id,
      name: this.name,
      terms: this.terms.toJSON(),
      rates: this.rates.toJSON(),
      repayment: this.repayment.toJSON(),
      overpayments: this.overpayments.toJSON(),
      fees: MC.domain.Payments.copyPayments(this.fees),
      report: this.report.toJSON()
    };
  };

  ClassicMortgage.fromJSON = function (obj) {
    if (!obj || obj.kind !== 'classic') { throw new Error('ClassicMortgage.fromJSON: expected kind classic'); }
    if (typeof obj.id !== 'string' || !obj.id) { throw new Error('ClassicMortgage.fromJSON: missing id'); }
    // The legacy keys deposit and useDepositInterest are ignored: Portfolio.fromJSON migrates them.
    return new ClassicMortgage({
      id: obj.id,
      name: obj.name,
      terms: D.LoanTerms.fromJSON(obj.terms),
      rates: D.RateSchedule.fromJSON(obj.rates),
      repayment: D.Repayments.fromJSON(obj.repayment),
      overpayments: D.Overpayments.fromJSON(obj.overpayments),
      fees: obj.fees,
      report: D.ReportPoint.fromJSON(obj.report)
    });
  };

  D.ClassicMortgage = ClassicMortgage;
})();
