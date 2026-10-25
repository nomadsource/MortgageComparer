(function () {
  'use strict';

  function RateSchedule(opts) {
    if (!Array.isArray(opts.entries)) { throw new Error('RateSchedule: entries must be an array'); }
    this.entries = opts.entries.map(function (e) {
      return { fromMonth: e.fromMonth, annualRate: e.annualRate };
    });
  }

  // The entry with the greatest fromMonth <= m is used (entry order does not matter).
  RateSchedule.prototype.rateAt = function (m) {
    var sorted = this.entries.slice().sort(function (a, b) { return a.fromMonth - b.fromMonth; });
    // ASSUMPTION: with no entry having fromMonth <= m the earliest entry is used; an empty schedule gives 0.
    // With equal fromMonth values the later entry in the list wins.
    var result = sorted[0];
    sorted.forEach(function (e) {
      if (e.fromMonth <= m) { result = e; }
    });
    return result ? result.annualRate : 0;
  };

  RateSchedule.prototype.toJSON = function () {
    return {
      entries: this.entries.map(function (e) {
        return { fromMonth: e.fromMonth, annualRate: e.annualRate };
      })
    };
  };

  RateSchedule.fromJSON = function (obj) {
    if (!obj || typeof obj !== 'object') { throw new Error('RateSchedule.fromJSON: invalid data'); }
    return new RateSchedule(obj);
  };

  MC.domain.RateSchedule = RateSchedule;
})();
