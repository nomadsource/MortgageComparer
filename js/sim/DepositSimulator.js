(function () {
  'use strict';

  // A standalone deposit (no link): months 1..termMonths.
  function run(deposit) {
    var rows = MC.sim.DepositEngine.create(deposit).complete();
    return { rows: rows, metrics: MC.sim.DepositMetrics.compute(deposit, rows), error: null };
  }

  MC.sim.DepositSimulator = { run: run };
})();
