(function () {
  'use strict';

  var dom = MC.ui.dom;
  var t = MC.core.t;
  var el = dom.el;
  var svg = dom.svg;

  var HEIGHT = 260;
  // Neutral colours that differ from the mortgage series colours
  var COLOR_INTEREST = 'var(--struct-interest)';
  var COLOR_PRINCIPAL = 'var(--struct-principal)';

  // items: [{ name, color, rows }]. A separate chart per mortgage: the interest and principal parts of the scheduled payment
  // by month (stacked). The Y scale and the number of X months are shared, so the charts are comparable by eye.
  // Bars are aligned by month number from the start; axis labels are the dates of each mortgage.
  // ASSUMPTION: overpayments are not shown on the chart - only the scheduled payment.
  function render(container, items) {
    dom.clear(container);
    var yMax = 0;
    var months = 0;
    items.forEach(function (item) {
      months = Math.max(months, item.rows.length);
      item.rows.forEach(function (row) { yMax = Math.max(yMax, row.interest + row.principal); });
    });
    if (!items.length) {
      container.appendChild(el('p', { className: 'empty', text: t('empty.noData') }));
      return;
    }

    container.appendChild(el('div', { className: 'legend' }, [
      [COLOR_PRINCIPAL, 'chart.structure.principal'],
      [COLOR_INTEREST, 'chart.structure.interest']
    ].map(function (entry) {
      return el('span', { className: 'legend-item' }, [
        el('span', { className: 'swatch', style: { background: entry[0] } }),
        el('span', { text: t(entry[1]) })
      ]);
    })));

    var grid = el('div', { className: 'structure-grid' });
    container.appendChild(grid);

    // All cells go into the DOM first: the chart width is taken from a grid cell, which depends on their number
    var cells = items.map(function (item) {
      var cell = el('div', { className: 'structure-cell' }, el('div', { className: 'structure-title' }, [
        el('span', { className: 'swatch', style: { background: item.color } }),
        el('span', { text: item.name })
      ]));
      grid.appendChild(cell);
      return cell;
    });
    items.forEach(function (item, i) {
      if (!item.rows.length) {
        cells[i].appendChild(el('p', { className: item.error ? 'empty error' : 'empty', text: item.error ? t('error.' + item.error) : t('empty.noData') }));
        return;
      }
      drawChart(cells[i], item.rows, yMax, months);
    });
  }

  function drawChart(cell, rows, yMax, months) {
    var frame = dom.chartFrame(cell, t('chart.structure.title'), yMax, HEIGHT);
    var left = frame.margin.left;
    var sy = frame.sy;
    var bw = frame.plotW / months;
    var gap = bw > 8 ? 2 : bw > 5 ? 1 : 0;
    var idx0 = dom.dateIndex(rows[0].date);

    frame.drawAxes(idx0, idx0 + months - 1, function (idx) { return left + (idx - idx0 + 0.5) * bw; });

    rows.forEach(function (row, i) {
      var x = left + i * bw + gap / 2;
      var w = Math.max(bw - gap, 0.5);
      var yInterest = sy(row.interest);
      var yTop = sy(row.interest + row.principal);
      var title = MC.core.formatMonth(row.date) + '\n' +
        t('chart.structure.principal') + ': ' + dom.formatMoney(row.principal) + '\n' +
        t('chart.structure.interest') + ': ' + dom.formatMoney(row.interest);
      frame.root.appendChild(svg('g', { 'shape-rendering': 'crispEdges' }, [
        svg('title', { text: title }),
        svg('rect', { x: x, y: yInterest, width: w, height: Math.max(0, sy(0) - yInterest), style: { fill: COLOR_INTEREST } }),
        svg('rect', { x: x, y: yTop, width: w, height: Math.max(0, yInterest - yTop), style: { fill: COLOR_PRINCIPAL } })
      ]));
    });

    cell.appendChild(el('div', { className: 'chart-box' }, frame.root));
  }

  MC.ui.PaymentStructureChart = { render: render };
})();
