(function () {
  'use strict';

  // Shared "put an amount on an account" logic: one list of entries for mortgage overpayments (Overpayments)
  // and for a deposit / offset account (CashFlowPlan).
  // Entry: {amount, everyMonths} - a payment in months M, 2M, 3M... OR {amount, month} - once in month `month`.

  var KEYS = ['amount', 'everyMonths', 'month'];

  // Copies an entry: only the given amount / everyMonths / month fields are carried over, in the original order
  // (the UI stores exactly one of everyMonths / month)
  function copyItem(e) {
    var copy = {};
    Object.keys(e).forEach(function (key) {
      if (KEYS.indexOf(key) >= 0 && e[key] !== undefined) { copy[key] = e[key]; }
    });
    return copy;
  }

  // ASSUMPTION: a missing list is empty; a non-array is an error.
  function copyList(list, name) {
    if (list === undefined || list === null) { return []; }
    if (!Array.isArray(list)) { throw new Error('Payments: ' + name + ' must be an array'); }
    return list.map(copyItem);
  }

  function copyPayments(list) { return copyList(list, 'payments'); }

  function isPositiveInt(x) { return Number.isInteger(x) && x >= 1; }

  // Sum of the entries active in month m. If both fields are set, everyMonths wins.
  // ASSUMPTION: an entry without a valid everyMonths and month (non-integer, < 1, NaN) is ignored.
  function amountAt(payments, m) {
    var sum = 0;
    payments.forEach(function (e) {
      if (isPositiveInt(e.everyMonths)) {
        if (m % e.everyMonths === 0) { sum += e.amount; }
      } else if (isPositiveInt(e.month) && e.month === m) {
        sum += e.amount;
      }
    });
    return MC.core.round2(sum);
  }

  // The entry list from a save: payments; for old saves recurring + oneTime,
  // and in the oldest format a monthly number (nonzero -> "every month"). If payments is present, the rest is ignored.
  function fromJSON(obj) {
    if (obj.payments !== undefined && obj.payments !== null) { return copyList(obj.payments, 'payments'); }
    var recurring = obj.recurring;
    if ((recurring === undefined || recurring === null) && typeof obj.monthly === 'number') {
      recurring = obj.monthly !== 0 ? [{ amount: obj.monthly, everyMonths: 1 }] : [];
    }
    return copyList(recurring, 'recurring').concat(copyList(obj.oneTime, 'oneTime'));
  }

  MC.domain.Payments = {
    copyPayments: copyPayments,
    amountAt: amountAt,
    fromJSON: fromJSON
  };
})();
