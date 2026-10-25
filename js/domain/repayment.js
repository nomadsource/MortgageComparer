(function () {
  'use strict';

  var round2 = MC.core.round2;

  // r is the monthly rate as a fraction, debt is the current debt, monthsLeft >= 1.
  function AnnuityRepayment() {}
  AnnuityRepayment.prototype.kind = 'annuity';

  AnnuityRepayment.prototype.payment = function (debt, r, monthsLeft) {
    if (r === 0) { return round2(debt / monthsLeft); }
    return round2(debt * r / (1 - Math.pow(1 + r, -monthsLeft)));
  };

  AnnuityRepayment.prototype.principalPart = function (debt, r, monthsLeft) {
    return round2(this.payment(debt, r, monthsLeft) - round2(debt * r));
  };

  function DifferentiatedRepayment() {}
  DifferentiatedRepayment.prototype.kind = 'differentiated';

  DifferentiatedRepayment.prototype.principalPart = function (debt, r, monthsLeft) {
    return round2(debt / monthsLeft);
  };

  DifferentiatedRepayment.prototype.payment = function (debt, r, monthsLeft) {
    return round2(this.principalPart(debt, r, monthsLeft) + round2(debt * r));
  };

  var classes = { annuity: AnnuityRepayment, differentiated: DifferentiatedRepayment };

  [AnnuityRepayment, DifferentiatedRepayment].forEach(function (Cls) {
    Cls.prototype.toJSON = function () { return { kind: this.kind }; };
    Cls.fromJSON = function (obj) {
      if (!obj || obj.kind !== Cls.prototype.kind) {
        throw new Error('Repayment.fromJSON: expected kind ' + Cls.prototype.kind);
      }
      return new Cls();
    };
  });

  function create(kind) {
    if (!Object.prototype.hasOwnProperty.call(classes, kind)) {
      throw new Error('Repayments: unknown kind ' + kind);
    }
    return new classes[kind]();
  }

  MC.domain.AnnuityRepayment = AnnuityRepayment;
  MC.domain.DifferentiatedRepayment = DifferentiatedRepayment;
  MC.domain.Repayments = {
    kinds: Object.keys(classes),
    create: create,
    fromJSON: function (obj) {
      if (!obj || typeof obj !== 'object') { throw new Error('Repayments.fromJSON: invalid data'); }
      return create(obj.kind);
    }
  };
})();
