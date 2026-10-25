(function () {
  'use strict';

  // LoanEngine with no knowledge of a deposit. The hooks (extraOverpayment, endOfMonth) are passed to the engine as is.
  // Returns {rows, error}.
  function run(mortgage, hooks) {
    return MC.sim.LoanEngine.run(mortgage, hooks || {});
  }

  MC.sim.ClassicSimulator = { run: run };
})();
