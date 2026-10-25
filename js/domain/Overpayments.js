(function () {
  'use strict';

  var P = MC.domain.Payments;

  function Overpayments(opts) {
    this.payments = P.copyPayments(opts.payments);
    this.effect = opts.effect;
  }

  Overpayments.prototype.amountAt = function (m) {
    return P.amountAt(this.payments, m);
  };

  Overpayments.prototype.toJSON = function () {
    return { payments: P.copyPayments(this.payments), effect: this.effect.toJSON() };
  };

  Overpayments.fromJSON = function (obj) {
    if (!obj || typeof obj !== 'object') { throw new Error('Overpayments.fromJSON: invalid data'); }
    return new Overpayments({
      payments: P.fromJSON(obj),
      effect: MC.domain.OverpaymentEffects.fromJSON(obj.effect)
    });
  };

  MC.domain.Overpayments = Overpayments;
})();
