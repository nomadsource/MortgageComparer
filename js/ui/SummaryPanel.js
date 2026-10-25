(function () {
  'use strict';

  var dom = MC.ui.dom;
  var t = MC.core.t;
  var el = dom.el;
  var rows = MC.ui.rows;

  // Key metrics per product kind: a path into the results table rows (rows.js), which gives the format, label and the better direction;
  // labelKey is a custom label instead of the table row's label
  var MORTGAGE_METRICS = [
    { path: 'metrics.firstPayment' },
    { path: 'metrics.overpaymentTotal' },
    { path: 'metrics.actualTermMonths', labelKey: 'row.actualTerm', format: 'term', better: 'min' },
    { path: 'metrics.debtAtReport', labelKey: 'summary.debtAtReport' }
  ];
  var DEPOSIT_METRICS = [
    { path: 'metrics.finalBalance' },
    { path: 'metrics.incomeNet' }
  ];

  function metricsOf(item) {
    return item.kind === 'deposit' ? DEPOSIT_METRICS : MORTGAGE_METRICS;
  }

  function valueOf(item, path) {
    return item.error || !item.metrics ? null : item.metrics[path.replace('metrics.', '')];
  }

  // bests: { kind: [the best key for each metric] } - the best is searched among products of the same kind
  function makeCard(item, bests) {
    var specs = metricsOf(item);
    var kindBests = bests[item.kind === 'deposit' ? 'deposit' : 'mortgage'];
    var head = el('div', { className: 'sum-head' }, [
      el('span', { className: 'swatch', style: { background: item.color } }),
      el('span', { className: 'sum-name', text: item.name, title: item.name })
    ]);
    var body;
    if (item.error || !item.metrics) {
      body = el('div', { className: 'sum-error', text: t('error.' + (item.error || 'exception')) });
    } else {
      body = el('div', { className: 'sum-metrics' }, specs.map(function (spec, i) {
        var def = rows.find(spec.path) || { editor: {} };
        var format = spec.format || def.editor.format;
        var value = valueOf(item, spec.path);
        var key = rows.resultKey(format, value);
        var label = t(spec.labelKey || def.labelKey, { n: item.report && item.report.month });
        return el('div', { className: 'sum-metric' + (key !== null && key === kindBests[i] ? ' best' : '') }, [
          el('div', { className: 'sum-label', text: label }),
          el('div', { className: 'sum-value', text: key === null ? dom.EMPTY : rows.resultText(format, value) })
        ]);
      }));
    }
    return el('div', { className: 'sum-card' }, [head, body]);
  }

  // container: the node the panel is embedded in; sticky works relative to its parent
  function create(container) {
    var inner = el('div', { className: 'summary-inner' });
    var root = el('div', { className: 'summary-panel is-empty' }, inner);
    container.appendChild(root);

    // Panel height -> --panel-h (0 if the panel is empty or not pinned: on a narrow screen);
    // the combined --sticky-offset (navigation + panel) is computed by CSS
    function syncOffset() {
      var pinned = !root.classList.contains('is-empty') && getComputedStyle(root).position === 'sticky';
      var h = pinned ? Math.ceil(root.getBoundingClientRect().height) : 0;
      document.documentElement.style.setProperty('--panel-h', h + 'px');
    }

    // resize is needed even with ResizeObserver: a media-query change can toggle pinning without a height change
    window.addEventListener('resize', syncOffset);
    if (typeof ResizeObserver === 'function') new ResizeObserver(syncOffset).observe(root);

    function bestsFor(items, specs) {
      return specs.map(function (spec) {
        var def = rows.find(spec.path) || { editor: {} };
        var keys = items.map(function (item) {
          return rows.resultKey(spec.format || def.editor.format, valueOf(item, spec.path));
        });
        return rows.bestKey(keys, spec.better || def.editor.better);
      });
    }

    // items: [{ name, color, kind, metrics, report: { month }, error }]
    function update(items) {
      var bests = {
        mortgage: bestsFor(items.filter(function (i) { return i.kind !== 'deposit'; }), MORTGAGE_METRICS),
        deposit: bestsFor(items.filter(function (i) { return i.kind === 'deposit'; }), DEPOSIT_METRICS)
      };
      dom.clear(inner);
      items.forEach(function (item) { inner.appendChild(makeCard(item, bests)); });
      root.classList.toggle('is-empty', !items.length);
      syncOffset();
    }

    return { update: update };
  }

  MC.ui.SummaryPanel = { create: create };
})();
