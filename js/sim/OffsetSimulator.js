(function () {
  'use strict';

  var round2 = MC.core.round2;

  // LoanEngine + offset account balance + offsetEffect. Returns {rows, error}.
  function run(mortgage) {
    var plan = mortgage.offsetAccount;
    var balance = Math.max(0, round2(plan.initial));

    return MC.sim.LoanEngine.run(mortgage, {
      offsetEffectKind: mortgage.offsetEffect.kind,
      balanceAt: function () { return balance; },
      endOfMonth: function (m) {
        balance = Math.max(0, round2(balance + plan.flowAt(m)));
        return { accountBalance: balance };
      }
    });
  }

  MC.sim.OffsetSimulator = { run: run };
})();
