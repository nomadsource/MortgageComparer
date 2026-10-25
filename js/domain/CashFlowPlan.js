(function () {
  'use strict';

  var P = MC.domain.Payments;

  function CashFlowPlan(opts) {
    this.initial = opts.initial;
    this.payments = P.copyPayments(opts.payments);
  }

  // Sum of the payments entries active in month m (negative = withdrawal)
  CashFlowPlan.prototype.flowAt = function (m) {
    return P.amountAt(this.payments, m);
  };

  CashFlowPlan.prototype.toJSON = function () {
    return { initial: this.initial, payments: P.copyPayments(this.payments) };
  };

  CashFlowPlan.fromJSON = function (obj) {
    if (!obj || typeof obj !== 'object') { throw new Error('CashFlowPlan.fromJSON: invalid data'); }
    return new CashFlowPlan({ initial: obj.initial, payments: P.fromJSON(obj) });
  };

  MC.domain.CashFlowPlan = CashFlowPlan;
})();
