(function () {
  'use strict';

  function loanResult(mortgage, loan, pairDeposits) {
    return {
      rows: loan.rows,
      metrics: MC.sim.Metrics.compute(mortgage, loan.rows),
      error: loan.error,
      deposits: pairDeposits || []
    };
  }

  // The single entry point: {[productId]: Result}. Does not mutate products.
  function run(portfolio) {
    var results = {};
    portfolio.products.forEach(function (product) {
      if (product.kind === 'deposit') {
        results[product.id] = MC.sim.DepositSimulator.run(product);
      } else if (product.kind === 'offset') {
        results[product.id] = loanResult(product, MC.sim.OffsetSimulator.run(product));
      } else {
        // ASSUMPTION: a link to a missing deposit (the domain does not allow it) is skipped.
        var pairs = portfolio.linksOf(product.id).map(function (link) {
          return { deposit: portfolio.get(link.depositId), link: link };
        }).filter(function (p) { return p.deposit; });
        results[product.id] = pairs.length
          ? MC.sim.PairSimulator.run(product, pairs)
          : loanResult(product, MC.sim.ClassicSimulator.run(product));
      }
    });
    return results;
  }

  MC.sim.Simulation = { run: run };
})();
