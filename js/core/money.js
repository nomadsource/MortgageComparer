(function () {
  'use strict';

  function round2(x) {
    return Math.round((x + Number.EPSILON) * 100) / 100;
  }

  MC.core.round2 = round2;
})();
