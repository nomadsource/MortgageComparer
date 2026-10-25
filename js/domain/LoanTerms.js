(function () {
  'use strict';

  var MODES = ['amount', 'percent'];

  // The loan amount is either a number (principal) or a percent of the property value (propertyValue × principalPercent / 100).
  function LoanTerms(opts) {
    this.principal = opts.principal;
    // ASSUMPTION: an unknown or missing mode is 'amount' (old saves without the new fields)
    this.principalMode = MODES.indexOf(opts.principalMode) >= 0 ? opts.principalMode : 'amount';
    this.propertyValue = opts.propertyValue === undefined ? 0 : opts.propertyValue;
    this.principalPercent = opts.principalPercent === undefined ? 80 : opts.principalPercent;
    this.termMonths = opts.termMonths;
    this.startDate = { year: opts.startDate.year, month: opts.startDate.month };
  }

  LoanTerms.prototype.loanAmount = function () {
    if (this.principalMode === 'percent') {
      return MC.core.round2(this.propertyValue * this.principalPercent / 100);
    }
    return this.principal;
  };

  LoanTerms.prototype.toJSON = function () {
    return {
      principal: this.principal,
      principalMode: this.principalMode,
      propertyValue: this.propertyValue,
      principalPercent: this.principalPercent,
      termMonths: this.termMonths,
      startDate: { year: this.startDate.year, month: this.startDate.month }
    };
  };

  LoanTerms.fromJSON = function (obj) {
    if (!obj || typeof obj !== 'object' || !obj.startDate || typeof obj.startDate !== 'object') {
      throw new Error('LoanTerms.fromJSON: invalid data');
    }
    return new LoanTerms(obj);
  };

  MC.domain.LoanTerms = LoanTerms;
})();
