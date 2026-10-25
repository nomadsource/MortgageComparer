(function () {
  'use strict';

  var dom = MC.ui.dom;
  var t = MC.core.t;
  var el = dom.el;
  var svg = dom.svg;

  var HEIGHT = 340;

  // items: [{ name, color, principal, rows }]; options: { onHoverMonth(month|null), onClickMonth(month), height } - optional.
  // A month is the month number from the mortgage start (as in the monthly table); it is taken by the longest mortgage
  // that has already started at that axis point and has not ended yet.
  function render(container, items, options) {
    options = options || {};
    dom.clear(container);
    var series = items.filter(function (item) { return item.rows.length; });
    // ASSUMPTION: balances (options.balances: [{name, color, rows}]) are drawn as a dashed line; the X axis covers the debt and the balances.
    // With no mortgages (only deposits) the chart shows balances alone, with no hover link to the table (month = null).
    var balances = (options.balances || []).filter(function (b) { return b.rows.length && b.rows[0].date; });
    if (!series.length && !balances.length) {
      container.appendChild(el('p', { className: 'empty', text: t('empty.noData') }));
      return;
    }

    var legendItems = items.map(function (item) {
      return el('span', { className: 'legend-item' }, [
        el('span', { className: 'swatch', style: { background: item.color } }),
        el('span', { text: item.name })
      ]);
    }).concat(balances.map(function (b) {
      return el('span', { className: 'legend-item' }, [
        el('span', { className: 'swatch dashed', style: { borderTopColor: b.color } }),
        el('span', { text: t('chart.debt.balance', { name: b.name }) })
      ]);
    }));
    container.appendChild(el('div', { className: 'legend' }, legendItems));

    // Points: the remainder at the end of each month; the initial debt is at the end of the previous month
    var xMin = Infinity;
    var xMax = -Infinity;
    var yMax = 0;
    series.forEach(function (s) {
      s.x0 = dom.dateIndex(s.rows[0].date) - 1;
      s.points = [s.principal].concat(s.rows.map(function (row) { return row.debtEnd; }));
      xMin = Math.min(xMin, s.x0);
      xMax = Math.max(xMax, s.x0 + s.points.length - 1);
      s.points.forEach(function (y) { yMax = Math.max(yMax, y); });
    });

    // The balance at the end of each row's month; x is the month index by the row's real date
    balances.forEach(function (b) {
      b.x0 = dom.dateIndex(b.rows[0].date);
      b.points = b.rows.map(function (row) {
        var v = row.balance !== undefined ? row.balance : row.accountBalance;
        return dom.isNumber(v) ? v : 0;
      });
      xMin = Math.min(xMin, b.x0);
      xMax = Math.max(xMax, b.x0 + b.points.length - 1);
      b.points.forEach(function (y) { yMax = Math.max(yMax, y); });
    });

    var frame = dom.chartFrame(container, t('chart.debt.title'), yMax, options.height || HEIGHT);
    var root = frame.root;
    var left = frame.margin.left;
    var sy = frame.sy;
    function sx(x) { return left + (xMax === xMin ? 0 : (x - xMin) / (xMax - xMin) * frame.plotW); }

    frame.drawAxes(xMin, xMax, sx);
    series.forEach(function (s) {
      var d = s.points.map(function (y, i) {
        return (i ? 'L' : 'M') + sx(s.x0 + i).toFixed(1) + ' ' + sy(y).toFixed(1);
      }).join('');
      root.appendChild(svg('path', { class: 'line', d: d, style: { stroke: s.color } }));
    });
    balances.forEach(function (b) {
      var d = b.points.map(function (y, i) {
        return (i ? 'L' : 'M') + sx(b.x0 + i).toFixed(1) + ' ' + sy(y).toFixed(1);
      }).join('');
      root.appendChild(svg('path', { class: 'line balance', d: d, style: { stroke: b.color } }));
    });

    // Hover: a vertical line, markers and a tooltip
    var cross = svg('line', { class: 'crosshair', y1: frame.margin.top, y2: frame.margin.top + frame.plotH, style: { display: 'none' } });
    var all = series.concat(balances);
    var markers = all.map(function () {
      return svg('circle', { class: 'marker', r: 4, style: { display: 'none' } });
    });
    markers.forEach(function (c, i) { c.style.fill = all[i].color; });
    root.appendChild(cross);
    markers.forEach(function (c) { root.appendChild(c); });
    var overlay = svg('rect', { class: 'hit', x: left, y: frame.margin.top, width: frame.plotW, height: frame.plotH, fill: 'transparent' });
    root.appendChild(overlay);

    var tip = el('div', { className: 'tooltip', style: { display: 'none' } });
    container.appendChild(el('div', { className: 'chart-box' }, [root, tip]));

    var byLength = series.slice().sort(function (a, b) { return b.rows.length - a.rows.length; });
    function monthAt(idx) {
      for (var i = 0; i < byLength.length; i++) {
        var k = idx - byLength[i].x0;
        if (k >= 1 && k <= byLength[i].rows.length) return k;
      }
      return null;
    }

    var lastMonth = null;
    function notifyHover(month) {
      if (month === lastMonth) return;
      lastMonth = month;
      if (options.onHoverMonth) options.onHoverMonth(month);
    }

    function hide() {
      cross.style.display = 'none';
      tip.style.display = 'none';
      markers.forEach(function (c) { c.style.display = 'none'; });
      notifyHover(null);
    }

    overlay.addEventListener('mouseleave', hide);
    overlay.addEventListener('click', function (event) {
      var month = monthAt(indexAt(event).idx);
      if (month && options.onClickMonth) options.onClickMonth(month);
    });
    function indexAt(event) {
      var rect = root.getBoundingClientRect();
      var px = (event.clientX - rect.left) * (frame.width / rect.width);
      var idx = Math.round(xMin + (px - left) / frame.plotW * (xMax - xMin));
      return { px: px, rect: rect, idx: Math.max(xMin, Math.min(xMax, idx)) };
    }
    overlay.addEventListener('mousemove', function (event) {
      var pos = indexAt(event);
      var px = pos.px;
      var rect = pos.rect;
      var idx = pos.idx;
      notifyHover(monthAt(idx));
      cross.setAttribute('x1', sx(idx));
      cross.setAttribute('x2', sx(idx));
      cross.style.display = '';

      dom.clear(tip);
      tip.appendChild(el('div', { className: 'tooltip-title', text: MC.core.formatMonth(dom.indexToDate(idx)) }));
      // How much time has passed since the chart start (the earliest point among mortgages and balances)
      tip.appendChild(el('div', { className: 'tooltip-elapsed', text: t('chart.debt.elapsed', { v: dom.formatTerm(Math.max(0, idx - xMin)) }) }));
      all.forEach(function (s, i) {
        var isBalance = i >= series.length;
        var k = idx - s.x0;
        if (k < 0 || (isBalance && k >= s.points.length)) { markers[i].style.display = 'none'; return; }
        var y = k < s.points.length ? s.points[k] : 0;
        markers[i].setAttribute('cx', sx(idx));
        markers[i].setAttribute('cy', sy(y));
        markers[i].style.display = '';
        tip.appendChild(el('div', { className: 'tooltip-row' }, [
          el('span', { className: 'swatch', style: { background: s.color } }),
          el('span', { className: 'tooltip-name', text: isBalance ? t('chart.debt.balance', { name: s.name }) : s.name }),
          el('span', { className: 'tooltip-value', text: dom.formatMoney(y) })
        ]));
      });
      tip.style.display = '';
      var x = px / frame.width * rect.width + 14;
      if (x + tip.offsetWidth > rect.width) x -= tip.offsetWidth + 28;
      tip.style.left = Math.max(0, x) + 'px';
      tip.style.top = '8px';
    });
  }

  MC.ui.DebtChart = { render: render };
})();
