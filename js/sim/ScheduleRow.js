(function () {
  'use strict';

  // A row of the mortgage's monthly schedule is a plain object (see CONTRACT.md).
  function create(f) {
    return {
      month: f.month,
      date: f.date,
      rate: f.rate,
      payment: f.payment,
      interest: f.interest,
      principal: f.principal,
      overpayment: f.overpayment,
      // Insurance and fees of the month (they do not affect debt or interest)
      fee: f.fee === undefined ? 0 : f.fee,
      debtEnd: f.debtEnd,
      accountBalance: f.accountBalance === undefined ? null : f.accountBalance,
      cumInterest: f.cumInterest,
      cumPrincipal: f.cumPrincipal,
      cumOverpayment: f.cumOverpayment,
      // The closing payment is smaller than scheduled because overpayments/offset shortened the term.
      isTail: f.isTail === true
    };
  }

  MC.sim.ScheduleRow = { create: create };
})();
