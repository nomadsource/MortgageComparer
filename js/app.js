(function () {
  'use strict';

  var t = MC.core.t;
  var dom = MC.ui.dom;
  var el = dom.el;
  var Portfolio = MC.domain.Portfolio;
  var Registry = MC.domain.ProductRegistry;

  var state = {
    scenarios: null,
    portfolio: null,
    results: {}
  };
  // Schedule table view (not persisted): columns on, dates hidden, all years collapsed
  var scheduleView = { columns: {}, showDates: false, expanded: {} };
  var table = null;
  var tabs = null;
  var summary = null;
  var nodes = {};
  var refreshQueued = false;
  var chartWidths = '';

  var DEBT_CHART_HEIGHT = 320;
  var RESIZE_DEBOUNCE_MS = 150;

  // An empty rate schedule silently gives 0%, so an entry with fromMonth = 1 is guaranteed (the rate editor never removes it)
  function prepared(product) {
    if (product.rates && !product.rates.entries.length) product.rates.entries.push({ fromMonth: 1, annualRate: 0 });
    return product;
  }

  function preparedPortfolio(portfolio) {
    portfolio.products.forEach(prepared);
    return portfolio;
  }

  function simulate() {
    try {
      return MC.sim.Simulation.run(state.portfolio);
    } catch (e) {
      console.error(e);
      var failed = {};
      state.portfolio.products.forEach(function (p) {
        failed[p.id] = { rows: [], metrics: null, error: 'exception', deposit: null };
      });
      return failed;
    }
  }

  function recomputeAll() {
    state.results = simulate();
  }

  function colorOf(product) {
    return dom.seriesColor(state.portfolio.products.indexOf(product));
  }

  // The debt and payment-structure charts show mortgages only (deposits do not take part)
  function chartItems() {
    return state.portfolio.mortgages().map(function (m) {
      var res = state.results[m.id];
      return {
        name: dom.productName(m),
        color: colorOf(m),
        principal: m.terms.loanAmount(),
        rows: res.rows,
        error: res.error
      };
    });
  }

  // Monthly table. Mortgages supply their rows; a balance (balances) exists for an offset mortgage (its account)
  // and for deposits: a linked deposit gets a column per (mortgage x deposit) pair (the pair's rows, including withdrawals for overpayments),
  // an unlinked one a single column with its own rows. A classic mortgage has no balance.
  function balancesOf(p) {
    var portfolio = state.portfolio;
    var res = state.results[p.id];
    var color = colorOf(p);
    var name = dom.productName(p);
    var balances = [];
    if (p.kind === 'deposit') {
      portfolio.links.forEach(function (l) {
        var mortgage = l.depositId === p.id ? portfolio.get(l.mortgageId) : null;
        var result = mortgage ? state.results[mortgage.id] : null;
        var pair = result ? result.deposits.filter(function (d) { return d.depositId === p.id; })[0] : null;
        if (pair && pair.rows.length) {
          // Deposit row j is shown in table row m = j - offsetMonths (rows with m < 1, before the mortgage starts, are hidden)
          var shift = pair.offsetMonths || 0;
          var shifted = pair.rows.filter(function (r) { return r.month - shift >= 1; }).map(function (r) {
            var copy = Object.assign({}, r);
            copy.month = r.month - shift;
            return copy;
          });
          balances.push({ name: name + ' → ' + dom.productName(mortgage), color: color, rows: shifted, paired: true });
        }
      });
      if (!balances.length) balances.push({ name: name, color: color, rows: res.rows, paired: false });
    } else if (p.kind === 'offset') {
      balances.push({ name: name, color: color, rows: res.rows, paired: false });
    }
    return balances;
  }

  function scheduleItems() {
    return state.portfolio.products.map(function (p) {
      var res = state.results[p.id];
      var color = colorOf(p);
      var name = dom.productName(p);
      var balances = balancesOf(p);
      return {
        name: name,
        color: color,
        kind: p.kind,
        rows: p.kind === 'deposit' ? [] : res.rows,
        balances: balances,
        error: res.error
      };
    });
  }

  function summaryItems() {
    return state.portfolio.products.map(function (p) {
      var res = state.results[p.id];
      return {
        name: dom.productName(p),
        color: colorOf(p),
        kind: p.kind,
        metrics: res.metrics,
        report: p.report,
        error: res.error
      };
    });
  }

  // While redrawing, the container keeps its height so the page does not shrink and scrolling is not disturbed
  function renderKeepingHeight(node, draw) {
    node.style.minHeight = node.offsetHeight + 'px';
    draw();
    node.style.minHeight = '';
  }

  // SVG charts depend on the container width, so only they are redrawn on resize
  function renderSvgCharts() {
    var items = chartItems();
    var balances = [];
    state.portfolio.products.forEach(function (p) { balances = balances.concat(balancesOf(p)); });
    MC.ui.ScheduleTable.setHighlight(null);
    renderKeepingHeight(nodes.debtChart, function () {
      MC.ui.DebtChart.render(nodes.debtChart, items, {
        balances: balances,
        onHoverMonth: MC.ui.ScheduleTable.setHighlight,
        onClickMonth: revealMonth,
        height: DEBT_CHART_HEIGHT
      });
    });
    renderKeepingHeight(nodes.structureChart, function () {
      MC.ui.PaymentStructureChart.render(nodes.structureChart, items);
    });
    chartWidths = currentChartWidths();
  }

  function currentChartWidths() {
    return nodes.debtChart.clientWidth + ':' + nodes.structureChart.clientWidth;
  }

  // Chart click: expand that month's year in the monthly table, scroll to it and highlight it;
  // the page scrolls to the table if it is off screen
  function revealMonth(month) {
    var year = MC.ui.ScheduleTable.yearOfMonth(month);
    if (!scheduleView.expanded[year]) {
      scheduleView.expanded[year] = true;
      renderSchedule();
    }
    MC.ui.ScheduleTable.setHighlight(month);
    MC.ui.ScheduleTable.scrollToYear(year);
    var wrap = nodes.schedule.querySelector('.schedule-wrap');
    if (wrap) wrap.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function renderSchedule() {
    MC.ui.ScheduleTable.render(nodes.schedule, scheduleItems(), scheduleView);
  }

  function renderCharts() {
    renderSvgCharts();
    renderSchedule();
  }

  // Full redraw: the set of columns or a column's structure changed
  function renderAll() {
    recomputeAll();
    table.render(state.portfolio.products, state.results);
    summary.update(summaryItems());
    renderCharts();
    MC.ui.Storage.save(state.scenarios);
  }

  // A value changed: recompute all columns, update results and charts without recreating the inputs
  function refresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(function () {
      refreshQueued = false;
      recomputeAll();
      table.updateResults(state.results);
      summary.update(summaryItems());
      renderCharts();
      MC.ui.Storage.save(state.scenarios);
    });
  }

  function onAdd(kind) {
    state.portfolio.add(prepared(Registry.createDefault(kind)));
    renderAll();
  }

  function onDuplicate(product) {
    var copy = prepared(state.portfolio.duplicate(product.id));
    copy.name = dom.productName(product) + t('name.copySuffix');
    renderAll();
  }

  // Copies a product (with its mortgage's deposits) to another scenario; the current scenario is unchanged
  function onCopyTo(product, scenarioId) {
    var target = state.scenarios.get(scenarioId);
    if (!target) return;
    state.portfolio.copyTo(target.portfolio, product.id);
    MC.ui.Storage.save(state.scenarios);
    tabs.notify(t('scenario.copied', { name: dom.productName(product), scenario: target.name }));
  }

  function onMove(product, delta) {
    state.portfolio.move(product.id, delta);
    renderAll();
  }

  // Deleting a deposit unlinks its mortgages, which gets a dedicated confirmation text
  function onDelete(product) {
    var name = dom.productName(product);
    var linked = product.kind === 'deposit' && state.portfolio.links.some(function (l) { return l.depositId === product.id; });
    if (!window.confirm(t(linked ? 'confirm.deleteDeposit' : 'confirm.delete', { name: name }))) return;
    state.portfolio.remove(product.id);
    renderAll();
  }

  function onReset() {
    if (!window.confirm(t('confirm.reset'))) return;
    state.scenarios.active().portfolio = Portfolio.createDefault();
    useActiveScenario();
    renderAll();
    MC.ui.Storage.flush();
  }

  // The active scenario becomes the working portfolio; the monthly table view (expanded years) is reset
  function useActiveScenario() {
    state.portfolio = preparedPortfolio(state.scenarios.active().portfolio);
    scheduleView.expanded = {};
  }

  // The scenario set changed: redraw the tabs and all content
  function showScenarios() {
    useActiveScenario();
    tabs.render(state.scenarios);
    renderAll();
  }

  function onSwitchScenario(id) {
    state.scenarios.setActive(id);
    showScenarios();
  }

  function onAddScenario() {
    state.scenarios.add();
    showScenarios();
  }

  function onRenameScenario(id, name) {
    state.scenarios.rename(id, name);
    tabs.render(state.scenarios);
    MC.ui.Storage.save(state.scenarios);
  }

  function onDuplicateScenario(id) {
    state.scenarios.duplicate(id);
    showScenarios();
  }

  // Export of the active scenario to <name>.json (a Blob + download link; works with file:// too)
  function onExportScenario(id) {
    var data = state.scenarios.exportScenario(id);
    var link = document.createElement('a');
    var url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    link.href = url;
    link.download = data.name.replace(/[\\/:*?"<>|]/g, '_') + '.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  // Import: the file becomes a new scenario and opens; on error nothing changes
  function onImportScenario(text) {
    try {
      if (text === null) throw new Error('read');
      state.scenarios.importScenario(JSON.parse(text), MC.ui.Storage.validPortfolio);
    } catch (e) {
      tabs.notify(t('scenario.importError'));
      return;
    }
    showScenarios();
    tabs.notify(t('scenario.imported', { name: state.scenarios.active().name }));
  }

  function onDeleteScenario(id) {
    var scenario = state.scenarios.get(id);
    if (!scenario || state.scenarios.scenarios.length < 2) return;
    if (!window.confirm(t('confirm.deleteScenario', { name: scenario.name }))) return;
    state.scenarios.remove(id);
    showScenarios();
  }

  // The language switcher: the choice is remembered and the page reloads (number formats are fixed at load); data is saved first
  function makeLanguageSelect() {
    var select = el('select', { className: 'btn-small', title: t('toolbar.language'), 'aria-label': t('toolbar.language') },
      Object.keys(MC.core.locales).map(function (code) {
        return el('option', { value: code, text: MC.core.locales[code].name, selected: code === MC.core.locale });
      }));
    select.addEventListener('change', function () {
      MC.core.storeLocale(select.value);
      MC.ui.Storage.flush();
      window.location.reload();
    });
    return select;
  }

  function buildLayout() {
    var root = document.getElementById('app');
    dom.clear(root);
    document.title = t('app.title');

    var onlyDiff = el('input', { type: 'checkbox' });
    onlyDiff.addEventListener('change', function () { table.setOnlyDiff(onlyDiff.checked); });

    // Toggles for the monthly table view
    function toggle(labelKey, checked, onChange) {
      var input = el('input', { type: 'checkbox', checked: checked });
      input.addEventListener('change', function () { onChange(input.checked); });
      return el('label', { className: 'check' }, [input, el('span', { text: t(labelKey) })]);
    }
    var scheduleControls = el('div', { className: 'schedule-controls' },
      MC.ui.ScheduleTable.columns.map(function (c) {
        return toggle(c.labelKey, true, function (on) {
          scheduleView.columns[c.key] = on;
          renderSchedule();
        });
      }).concat(toggle('schedule.showDates', false, function (on) {
        scheduleView.showDates = on;
        renderSchedule();
      })).concat([
        el('button', { type: 'button', className: 'btn-small', text: t('schedule.expandAll'), on: { click: function () {
          var years = MC.ui.ScheduleTable.yearCount(scheduleItems());
          for (var y = 1; y <= years; y++) scheduleView.expanded[y] = true;
          renderSchedule();
        } } }),
        el('button', { type: 'button', className: 'btn-small', text: t('schedule.collapseAll'), on: { click: function () {
          scheduleView.expanded = {};
          renderSchedule();
        } } })
      ]));

    nodes.table = el('div', { className: 'cmp-host' });
    nodes.debtChart = el('div', { className: 'chart-host' });
    nodes.structureChart = el('div', { className: 'chart-host' });
    nodes.schedule = el('div', { className: 'schedule-host' });

    // The header with navigation is pinned: its height (--nav-h) is needed by the summary panel and anchor offsets
    nodes.header = el('header', { className: 'top' }, el('div', { className: 'top-inner' }, [
      el('h1', { text: t('app.title') }),
      el('nav', { className: 'anchors', 'aria-label': t('nav.label') }, [
        el('a', { href: '#sec-params', text: t('nav.params') }),
        el('a', { href: '#sec-charts', text: t('nav.charts') }),
        el('a', { href: '#sec-details', text: t('nav.details') })
      ]),
      el('div', { className: 'toolbar' }, [
        el('label', { className: 'check' }, [onlyDiff, el('span', { text: t('toolbar.onlyDiff') })]),
        makeLanguageSelect(),
        el('button', { type: 'button', className: 'btn-small', text: t('toolbar.reset'), on: { click: onReset } })
      ])
    ]));
    root.appendChild(nodes.header);

    // The summary panel host is a display: contents wrapper, otherwise the panel's sticky would not work
    var summaryHost = el('div', { className: 'summary-host' });
    root.appendChild(summaryHost);
    summary = MC.ui.SummaryPanel.create(summaryHost);

    // The "Charts" block: the debt chart full width, the payment-structure charts below it; the anchor is the block start
    nodes.layout = el('div', { className: 'layout' }, [
      el('section', { id: 'sec-params', className: 'card card-flush' }, nodes.table),
      el('section', { id: 'sec-charts', className: 'card' }, [
        el('h2', { text: t('chart.title') }),
        el('h3', { text: t('chart.debt.title') }),
        nodes.debtChart,
        el('h3', { className: 'chart-sub', text: t('chart.structure.title') }),
        nodes.structureChart
      ]),
      el('section', { id: 'sec-details', className: 'card' }, [
        el('h2', { text: t('schedule.title') }),
        scheduleControls,
        el('p', { className: 'hint', text: t('schedule.aggregationHint') }),
        nodes.schedule
      ])
    ]);
    nodes.scenarios = el('div', { className: 'scn-host' });
    root.appendChild(el('main', null, [nodes.scenarios, nodes.layout]));
  }

  // Pinned header height -> --nav-h (the summary panel sticks below it)
  function watchNavHeight() {
    function sync() {
      document.documentElement.style.setProperty('--nav-h', Math.ceil(nodes.header.getBoundingClientRect().height) + 'px');
    }
    sync();
    if (typeof ResizeObserver === 'function') new ResizeObserver(sync).observe(nodes.header);
    else window.addEventListener('resize', sync);
  }

  function init() {
    state.scenarios = MC.ui.Storage.load() || MC.domain.ScenarioSet.createDefault();
    useActiveScenario();
    buildLayout();
    tabs = MC.ui.ScenarioTabs.create(nodes.scenarios, {
      onSwitch: onSwitchScenario,
      onAdd: onAddScenario,
      onRename: onRenameScenario,
      onDuplicate: onDuplicateScenario,
      onExport: onExportScenario,
      onImport: onImportScenario,
      onDelete: onDeleteScenario
    });
    tabs.render(state.scenarios);
    table = MC.ui.ComparisonTable.create({
      container: nodes.table,
      portfolio: function () { return state.portfolio; },
      onChange: refresh,
      onStructural: renderAll,
      onAdd: onAdd,
      onDuplicate: onDuplicate,
      onMove: onMove,
      onCopyTo: onCopyTo,
      scenarios: function () { return state.scenarios; },
      onDelete: onDelete
    });
    watchNavHeight();
    renderAll();

    // Charts take their width from the container: redrawn on window resize and on any change of the
    // container widths (layout change, a scrollbar appearing)
    var resizeTimer = null;
    function scheduleSvgCharts() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(renderSvgCharts, RESIZE_DEBOUNCE_MS);
    }
    window.addEventListener('resize', scheduleSvgCharts);
    if (typeof ResizeObserver === 'function') {
      var observer = new ResizeObserver(function () {
        if (currentChartWidths() !== chartWidths) scheduleSvgCharts();
      });
      observer.observe(nodes.debtChart);
      observer.observe(nodes.structureChart);
    }
  }

  init();
})();
