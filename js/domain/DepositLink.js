(function () {
  'use strict';

  function DepositLink(opts) {
    this.mortgageId = opts.mortgageId;
    this.depositId = opts.depositId;
    this.useInterest = opts.useInterest === true;
  }

  DepositLink.prototype.toJSON = function () {
    return { mortgageId: this.mortgageId, depositId: this.depositId, useInterest: this.useInterest };
  };

  DepositLink.fromJSON = function (obj) {
    if (!obj || typeof obj !== 'object' ||
        typeof obj.mortgageId !== 'string' || !obj.mortgageId ||
        typeof obj.depositId !== 'string' || !obj.depositId) {
      throw new Error('DepositLink.fromJSON: invalid data');
    }
    // ASSUMPTION: useInterest other than true (including a missing one) is treated as false.
    return new DepositLink(obj);
  };

  MC.domain.DepositLink = DepositLink;
})();
