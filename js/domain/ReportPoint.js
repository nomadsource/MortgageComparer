(function () {
  'use strict';

  function ReportPoint(opts) {
    this.month = opts.month;
  }

  ReportPoint.prototype.toJSON = function () {
    return { month: this.month };
  };

  ReportPoint.fromJSON = function (obj) {
    if (!obj || typeof obj !== 'object') { throw new Error('ReportPoint.fromJSON: invalid data'); }
    return new ReportPoint(obj);
  };

  MC.domain.ReportPoint = ReportPoint;
})();
