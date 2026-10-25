(function () {
  'use strict';

  // Declarative description of the comparison table rows.
  // Groups: collapsed - collapsed by default; expandIfKinds - but expanded on first render if the portfolio has such products.
  // { group, labelKey, path, editor, appliesTo?, hintKey? } (hintKey is the (i) tooltip next to the row label)
  //  - path for editors is a path from the product, for results (editor.type 'result') from the simulation result;
  //  - no component at path (or the product is not in appliesTo: 'classic' | 'offset' | 'deposit') - the cell shows "-";
  //  - pathByKind: { kind: path } - for that product kind its own path is used instead of path (one concept in one row);
  //  - rows without path (the deposit link, "use interest") have an editor that reads and edits Portfolio itself;
  //  - result.better: 'min' | 'max' - the direction in which the best value is highlighted.

  var groups = [
    { key: 'main', labelKey: 'group.main' },
    { key: 'rates', labelKey: 'group.rates' },
    { key: 'account', labelKey: 'group.account', collapsed: true, expandIfKinds: ['offset', 'deposit'] },
    { key: 'overpayments', labelKey: 'group.overpayments' },
    { key: 'results', labelKey: 'group.results' }
  ];

  function maxOf(items, key) {
    return items.reduce(function (acc, item) { return Math.max(acc, item[key] || 0); }, 0);
  }

  function newRate(items) {
    return {
      fromMonth: maxOf(items, 'fromMonth') + 12,
      annualRate: items.length ? items[items.length - 1].annualRate : 0
    };
  }

  function number(extra) {
    var editor = { type: 'number' };
    Object.keys(extra || {}).forEach(function (key) { editor[key] = extra[key]; });
    return editor;
  }

  function result(format, better) {
    return { type: 'result', format: format, better: better };
  }

  // One concept, "putting an amount on an account" (mortgage overpayment, deposit / offset account top-up or withdrawal):
  // one list of entries {amount, everyMonths} (recurring) or {amount, month} (one-off).
  // The only difference is the minimum amount: overpayments >= 0, for accounts a negative amount is a withdrawal.
  function paymentsEditor(minAmount) {
    var amount = { key: 'amount', labelKey: 'list.amount' };
    if (minAmount !== undefined) { amount.min = minAmount; }
    return { type: 'list', newItem: newPayment, fields: [amount, { kind: 'when', labelKey: 'list.when' }] };
  }

  function newPayment() {
    return { amount: 0, everyMonths: 1 };
  }

  // The account the amounts go to: a deposit plan or a mortgage's offset account
  function accountOf(m) { return m.kind === 'deposit' ? m.plan : m.offsetAccount; }

  var MORTGAGES = ['classic', 'offset'];
  var DEPOSIT = ['deposit'];

  var rows = [
    // One concept for a mortgage (loan amount) and a deposit (amount paid in): a deposit has a different path
    {
      group: 'main', labelKey: 'row.initialAmount', hintKey: 'hint.initialAmount', path: 'terms.principal', pathByKind: { deposit: 'plan.initial' },
      appliesTo: MORTGAGES.concat(DEPOSIT), editor: number({ min: 0 }),
      // mortgage: the amount as a number or a percent of the property value
      editorByKind: { classic: { type: 'principal' }, offset: { type: 'principal' } }
    },
    {
      group: 'main', labelKey: 'row.termMonths', hintKey: 'hint.term', path: 'terms.termMonths', pathByKind: { deposit: 'termMonths' },
      appliesTo: MORTGAGES.concat(DEPOSIT), editor: number({ min: 1, max: 1200, int: true })
    },
    { group: 'main', labelKey: 'row.startDate', path: 'terms.startDate', pathByKind: { deposit: 'startDate' }, appliesTo: MORTGAGES.concat(DEPOSIT), editor: { type: 'month' } },
    {
      group: 'main', labelKey: 'row.repayment', hintKey: 'hint.repayment', path: 'repayment', appliesTo: MORTGAGES,
      editor: { type: 'strategy', registry: 'Repayments', labelPrefix: 'repayment.' }
    },

    {
      group: 'rates', labelKey: 'row.rates', path: 'rates.entries', appliesTo: MORTGAGES.concat(DEPOSIT),
      editor: {
        // tax: for a deposit a "Tax, %" widget under the list (taxRate); mortgages have no taxRate field, so no widget
        type: 'list', fixedFirst: true, newItem: newRate, tax: { path: 'taxRate' },
        fields: [
          { key: 'fromMonth', labelKey: 'list.fromMonth', min: 1, int: true, isMonth: true },
          { key: 'annualRate', labelKey: 'list.rate', min: 0 }
        ]
      }
    },

    {
      group: 'rates', labelKey: 'row.fees', hintKey: 'hint.fees', path: 'fees',
      appliesTo: MORTGAGES, editor: paymentsEditor(0)
    },
    {
      group: 'rates', labelKey: 'row.effectiveRate', hintKey: 'hint.effectiveRate', path: 'metrics.effectiveRate',
      editor: Object.assign(result('percent', 'min'), {
        lines: [{
          labelKey: 'result.noFees',
          // only if fees change the rate
          show: function (m, res) { return res.metrics.effectiveRateNoFees !== null && res.metrics.effectiveRateNoFees !== res.metrics.effectiveRate; },
          text: function (m, res) { return MC.ui.dom.formatPercent(res.metrics.effectiveRateNoFees); }
        }]
      })
    },

    // Offset account (offset mortgage), deposit link (classic), deposit parameters (deposit; rates and tax are in the "Rates" group)
    {
      group: 'account', labelKey: 'row.account', hintKey: 'hint.account', appliesTo: ['classic', 'offset'],
      editorByKind: {
        classic: { type: 'depositLink', flagKey: 'row.useDepositInterest' },
        offset: {
          type: 'compose',
          parts: [
            { labelKey: 'row.offsetInitial', path: 'offsetAccount.initial', editor: number({ min: 0 }) },
            { labelKey: 'row.offsetEffect', path: 'offsetEffect', editor: { type: 'strategy', registry: 'OffsetEffects', labelPrefix: 'effect.' } }
          ]
        }
      }
    },
    {
      group: 'account', labelKey: 'row.accountPayments', hintKey: 'hint.accountPayments', path: 'offsetAccount.payments', pathByKind: { deposit: 'plan.payments' },
      appliesTo: ['offset'].concat(DEPOSIT), editor: paymentsEditor()
    },

    {
      group: 'overpayments', labelKey: 'row.payments', hintKey: 'hint.payments', path: 'overpayments.payments',
      appliesTo: MORTGAGES, editor: paymentsEditor(0)
    },
    {
      group: 'overpayments', labelKey: 'row.overpaymentEffect', hintKey: 'hint.overpaymentEffect', path: 'overpayments.effect',
      appliesTo: MORTGAGES, editor: { type: 'strategy', registry: 'OverpaymentEffects', labelPrefix: 'effect.' }
    },

    { group: 'results', labelKey: 'row.reportMonth', hintKey: 'hint.reportMonth', path: 'report.month', editor: number({ min: 1, int: true, hint: 'month' }) },
    { group: 'results', labelKey: 'row.status', editor: { type: 'status' } },
    { group: 'results', labelKey: 'row.firstPayment', path: 'metrics.firstPayment', editor: result('money', 'min') },
    { group: 'results', labelKey: 'row.maxPayment', path: 'metrics.maxPayment', editor: result('money', 'min') },
    { group: 'results', labelKey: 'row.minPayment', path: 'metrics.minPayment', editor: result('money', 'min') },
    {
      group: 'results', labelKey: 'row.overpayment', path: 'metrics.overpaymentTotal',
      editor: Object.assign(result('money', 'min'), {
        lines: [
          { labelKey: 'result.interestPart', show: function (m, res) { return res.metrics.feesTotal > 0; }, value: function (m, res) { return res.metrics.overpayment; } },
          { labelKey: 'result.feesPart', show: function (m, res) { return res.metrics.feesTotal > 0; }, value: function (m, res) { return res.metrics.feesTotal; } }
        ]
      })
    },
    { group: 'results', labelKey: 'row.totalPaid', path: 'metrics.totalPaid', editor: result('money', 'min') },
    {
      group: 'results', labelKey: 'row.closeDate', path: 'metrics.closeDate',
      editor: Object.assign(result('date', 'min'), {
        lines: [{ labelKey: 'result.takes', text: function (m, res) { return MC.ui.dom.formatTerm(res.metrics.actualTermMonths); } }]
      })
    },
    { group: 'results', labelKey: 'row.debtAtReport', path: 'metrics.debtAtReport', editor: result('money', 'min') },
    { group: 'results', labelKey: 'row.netCost', path: 'metrics.netCost', editor: result('money', 'min') },
    { group: 'results', labelKey: 'row.netCapitalAtReport', path: 'metrics.netCapitalAtReport', editor: result('money', 'max') },
    // Deposit metrics (for mortgages these rows show "-", a deposit shows the mortgage ones)
    { group: 'results', labelKey: 'row.depFinal', path: 'metrics.finalBalance', editor: result('money', 'max') },
    { group: 'results', labelKey: 'row.depIncome', path: 'metrics.incomeNet', editor: result('money', 'max') },
    { group: 'results', labelKey: 'row.depTax', path: 'metrics.taxPaid', editor: result('money') },
    {
      group: 'results', labelKey: 'row.depContributed', path: 'metrics.contributed',
      editor: Object.assign(result('money'), {
        lines: [
          { labelKey: 'result.initialPart', value: function (m) { return accountOf(m).initial; } },
          { labelKey: 'result.paymentsPart', value: function (m, res) { return MC.core.round2(res.metrics.contributed - accountOf(m).initial); } }
        ]
      })
    },
    { group: 'results', labelKey: 'row.depAtReport', path: 'metrics.balanceAtReport', editor: result('money', 'max') }
  ];

  function find(path) {
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].path === path) return rows[i];
    }
    return null;
  }

  // Shared result logic for the comparison table and the summary panel

  // A number for comparing values (null - no value)
  function resultKey(format, value) {
    if (value === null || value === undefined) return null;
    if (format === 'date') return value.year * 12 + value.month;
    return MC.ui.dom.isNumber(value) ? value : null;
  }

  function resultText(format, value) {
    if (format === 'date') return MC.core.formatMonth(value);
    if (format === 'term') return MC.ui.dom.formatTerm(value);
    if (format === 'percent') return MC.ui.dom.formatPercent(value);
    return MC.ui.dom.formatMoney(value);
  }

  // The best key among keys in the direction better ('min' | 'max'); null - nothing to compare, all equal or no direction
  function bestKey(keys, better) {
    var present = keys.filter(function (k) { return k !== null; });
    if (!better || present.length < 2) return null;
    var min = Math.min.apply(null, present);
    var max = Math.max.apply(null, present);
    if (min === max) return null;
    return better === 'min' ? min : max;
  }

  MC.ui.rows = {
    groups: groups,
    rows: rows,
    find: find,
    resultKey: resultKey,
    resultText: resultText,
    bestKey: bestKey
  };
})();
