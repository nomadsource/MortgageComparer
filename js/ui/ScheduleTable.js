(function () {
  'use strict';

  var dom = MC.ui.dom;
  var t = MC.core.t;
  var el = dom.el;

  // A year = 12 months from the mortgage start (the same value as in the sim layer: PairSimulator); local so the UI does not depend on where it is exported
  var MONTHS_IN_YEAR = 12;

  // Switchable parameters (in display order). The date is a separate group (view.showDates).
  // get - the value from a row; flow - a flow: summed in a year row; otherwise a stock: the value at the year's last month.
  // optional - the field is not present on every mortgage (checked by the rows).
  function field(name) {
    return function (r) { return r[name]; };
  }

  // Balance: for an offset mortgage the mortgage row's accountBalance, for a deposit (its own or paired) the deposit row's balance
  // Payment for the period: scheduled + extra payments (insurance, fees) + overpayments
  function paymentTotal(r) { return MC.core.round2(r.payment + (r.fee || 0) + (r.overpayment || 0)); }

  function balanceOf(r) {
    return r.balance !== undefined ? r.balance : r.accountBalance;
  }

  // Total paid: debt (with overpayments) + cumulative interest; rows without these fields (a deposit) have no value
  function paidTotal(r) {
    return dom.isNumber(r.cumPrincipal) && dom.isNumber(r.cumInterest) ? MC.core.round2(r.cumPrincipal + r.cumInterest) : undefined;
  }

  // The breakdown under the number: the period's part (a sum over the rows) for the payment, the end-of-period stock for "total paid"
  function sumOf(rows, name) {
    return MC.core.round2(rows.reduce(function (acc, r) { return acc + r[name]; }, 0));
  }
  function paymentParts(rows) {
    return { i: sumOf(rows, 'interest'), p: sumOf(rows, 'principal'), f: sumOf(rows, 'fee'), o: sumOf(rows, 'overpayment') };
  }
  function paidParts(rows) {
    var last = rows[rows.length - 1];
    return { i: last.cumInterest, p: MC.core.round2(last.cumPrincipal - last.cumOverpayment), o: last.cumOverpayment };
  }

  var COLUMNS = [
    { key: 'debtEnd', labelKey: 'schedule.debtEnd', get: field('debtEnd') },
    { key: 'payment', labelKey: 'schedule.payment', get: paymentTotal, flow: true, parts: paymentParts },
    { key: 'cumPaid', labelKey: 'schedule.cumPaid', get: paidTotal, optional: true, parts: paidParts },
    { key: 'balance', labelKey: 'schedule.balance', get: balanceOf, optional: true }
  ];
  var DATE_COLUMN = { key: 'date', labelKey: 'schedule.date' };

  function mapOf(rows) {
    var map = {};
    rows.forEach(function (r) { map[r.month] = r; });
    return map;
  }

  function hasValues(rows, column) {
    if (!rows.length) return false;
    if (!column.optional) return true;
    return rows.some(function (r) { return dom.isNumber(column.get(r)); });
  }

  // A group's columns: { item, name, color, map (month -> row), paired? }.
  // Balance has a column per account/deposit from item.balances (a deposit paired with a mortgage gets a column per mortgage,
  // one deposit's columns go in a row); other parameters have a column per mortgage from its rows.
  function columnsOf(items, column) {
    var cols = [];
    items.forEach(function (item) {
      if (column.key === 'balance') {
        (item.balances || []).forEach(function (b) {
          if (hasValues(b.rows, column)) cols.push({ item: item, name: b.name, color: b.color, map: mapOf(b.rows), paired: !!b.paired });
        });
      } else if (hasValues(item.rows, column)) {
        cols.push({ item: item, name: item.name, color: item.color, map: mapOf(item.rows) });
      }
    });
    return cols;
  }

  // A cell's content from the rows of its period (a non-empty array: a month is one row, a year up to 12):
  // flows are summed, stocks are taken at the last month, dates form a range.
  // Returns { text, value (a number or null/undefined), parts (the breakdown or null) } - computed once per cell.
  function cellOf(column, rows) {
    var first = rows[0];
    var last = rows[rows.length - 1];
    if (column.key === 'date') {
      var text = rows.length > 1 ? MC.core.formatMonth(first.date) + ' – ' + MC.core.formatMonth(last.date) : MC.core.formatMonth(first.date);
      return { text: text, value: null, parts: null };
    }
    var value = column.flow
      ? MC.core.round2(rows.reduce(function (acc, r) { return acc + column.get(r); }, 0))
      : column.get(last);
    return { text: dom.formatMoney(value), value: value, parts: column.parts && dom.isNumber(value) ? column.parts(rows) : null };
  }

  function line(key, text) {
    return '<span class="cmp-line" data-k="' + key + '" data-b="' + text + '">' + text + '</span>';
  }

  // A cell's HTML: the main number with difference lines under it - the space is always reserved so the cell height does not jump.
  // For columns with a breakdown (parts) the main number itself shows the difference of the whole sum when comparing, and under it
  // lines for interest / debt (and fees, overpayment if the product has them - extras: { f, o }): at rest they show values, when comparing the difference.
  // Other columns have one empty line under the number that receives the difference when comparing. A date is plain text.
  function cellHtml(column, cell, extras) {
    if (!dom.isNumber(cell.value)) { return cell.text; }
    var parts = cell.parts;
    if (!parts) { return cell.text + '<small class="cmp-d">' + line('v', '') + '</small>'; }
    return '<span class="cmp-line cmp-main" data-k="v" data-b="' + cell.text + '">' + cell.text + '</span>' +
      '<small class="cmp-d">' +
      line('i', t('schedule.interestPart', { v: dom.formatMoney(parts.i) })) +
      line('p', t('schedule.principalPart', { v: dom.formatMoney(parts.p) })) +
      (extras.f && parts.f !== undefined ? line('f', t('schedule.feesPart', { v: dom.formatMoney(parts.f) })) : '') +
      (extras.o && parts.o !== undefined ? line('o', t('schedule.overpaymentPart', { v: dom.formatMoney(parts.o) })) : '') + '</small>';
  }

  // Computed once per column (kept in col.extras): otherwise every cell would scan all the product's rows
  function extrasOf(col) {
    if (!col.extras) {
      var rows = col.item.rows;
      col.extras = {
        f: rows.some(function (r) { return r.fee > 0; }),
        o: rows.some(function (r) { return r.overpayment > 0; })
      };
    }
    return col.extras;
  }

  // A cell's attributes for hover comparison: group, value and breakdown parts
  function compareAttrs(column, cell) {
    if (!dom.isNumber(cell.value)) { return ''; }
    var attrs = ' data-g="' + column.key + '" data-v="' + cell.value + '"';
    var parts = cell.parts;
    if (parts) {
      attrs += ' data-vi="' + parts.i + '" data-vp="' + parts.p + '"' + (parts.f !== undefined ? ' data-vf="' + parts.f + '"' : '') + (parts.o !== undefined ? ' data-vo="' + parts.o + '"' : '');
    }
    return attrs;
  }

  // State of the single table: the container and the row highlighted (by hovering a chart)
  var host = null;
  var hlRow = null;
  var hlMonth = null;

  function yearOfMonth(m) {
    return Math.ceil(m / MONTHS_IN_YEAR);
  }

  function maxMonthOf(items) {
    var max = 0;
    items.forEach(function (item) {
      item.rows.forEach(function (r) { max = Math.max(max, r.month); });
      (item.balances || []).forEach(function (b) {
        b.rows.forEach(function (r) { max = Math.max(max, r.month); });
      });
    });
    return max;
  }

  function yearCount(items) {
    return yearOfMonth(maxMonthOf(items));
  }

  // Month highlight: the month row (year expanded) or the year row. In place, without recreating the table.
  function setHighlight(month) {
    month = month || null;
    if (month === hlMonth) return;
    hlMonth = month;
    if (hlRow) hlRow.classList.remove('hl');
    hlRow = null;
    var tbody = host && host.querySelector('tbody');
    if (!month || !tbody) return;
    hlRow = tbody.querySelector('tr[data-month="' + month + '"]') ||
      tbody.querySelector('tr.year-row[data-year="' + yearOfMonth(month) + '"]');
    if (hlRow) hlRow.classList.add('hl');
  }

  // Scrolls the table to a year row (under the sticky header) and briefly highlights it
  function scrollToYear(year) {
    var row = host && host.querySelector('tr.year-row[data-year="' + year + '"]');
    var wrap = host && host.querySelector('.schedule-wrap');
    if (!row || !wrap) return;
    var head = wrap.querySelector('thead').offsetHeight;
    wrap.scrollTop += row.getBoundingClientRect().top - wrap.getBoundingClientRect().top - head;
    row.classList.remove('flash');
    void row.offsetWidth;
    row.classList.add('flash');
    setTimeout(function () { row.classList.remove('flash'); }, 1600);
  }

  // A deposit balance's composition: an underline strip and a tooltip on deposit balance cells (own or paired).
  // Data comes from DepositRow (balance, incomeNet, tax, flow, withdrawn, cumFlow, cumIncome, cumWithdrawn);
  // an offset mortgage's balance comes from mortgage rows without these fields - then the cell is ordinary.
  var tipEl = null;
  var tipCell = null;
  var tipData = null; // { cols } - the balance columns of the current render (data-i is an index into cols)

  // A deposit balance cell's attributes or '' (rows - the cell's months: one for a month row, up to 12 for a year)
  function depositAttrs(g, c, rows, from, to) {
    if (g.column.key !== 'balance' || c.failed || !rows.length) return '';
    var last = rows[rows.length - 1];
    if (!dom.isNumber(last.cumFlow) || !dom.isNumber(last.balance)) return '';
    // The "paid in" share (without what was withdrawn for overpayments) of the balance; at zero balance and overshoot it stays within 0-100%
    var share = last.balance > 0 ? Math.min(1, Math.max(0, (last.cumFlow - (last.cumWithdrawn || 0)) / last.balance)) : 1;
    return ' tabindex="0" aria-describedby="dep-tip" data-i="' + tipData.cols.indexOf(c) + '" data-from="' + from + '" data-to="' + to +
      '" style="--dep:' + (share * 100).toFixed(1) + '%"';
  }

  // "+1 234,00" / "-1 234,00"; zero has no sign
  function signedMoney(v) {
    var r = MC.core.round2(v || 0);
    return (r > 0 ? '+' : r < 0 ? '−' : '') + dom.formatMoney(Math.abs(r));
  }

  function hideTip() {
    if (tipEl) tipEl.hidden = true;
    tipCell = null;
  }

  function showTip(td) {
    if (!tipData || tipCell === td) return;
    var col = tipData.cols[Number(td.getAttribute('data-i'))];
    var from = Number(td.getAttribute('data-from'));
    var to = Number(td.getAttribute('data-to'));
    var map = col && col.map;
    var rows = [];
    for (var m = from; m <= to; m++) if (map[m]) rows.push(map[m]);
    if (!col || !rows.length) return;

    function sum(field) {
      return MC.core.round2(rows.reduce(function (acc, r) { return acc + (r[field] || 0); }, 0));
    }
    var last = rows[rows.length - 1];
    var period = rows.length > 1
      ? t('tip.periodRange', { from: rows[0].month, to: last.month })
      : t('tip.periodMonth', { n: last.month });

    if (!tipEl) {
      tipEl = el('div', { className: 'dep-tip', id: 'dep-tip', role: 'tooltip', hidden: true });
      document.body.appendChild(tipEl);
    }
    function line(labelKey, value, extra) {
      return el('div', { className: 'dep-tip-row' + (extra || '') }, [el('span', { text: t(labelKey) }), el('span', { text: value })]);
    }
    dom.clear(tipEl);
    tipEl.appendChild(el('div', { className: 'dep-tip-title', text: col.name + ' · ' + period }));
    tipEl.appendChild(line('tip.balance', dom.formatMoney(last.balance), ' strong'));
    tipEl.appendChild(line('tip.income', signedMoney(sum('incomeNet'))));
    tipEl.appendChild(line('tip.tax', dom.formatMoney(sum('tax'))));
    tipEl.appendChild(line('tip.flow', signedMoney(sum('flow'))));
    // A withdrawal for overpayments exists only in a deposit column paired with a mortgage
    if (col.paired) tipEl.appendChild(line('tip.toMortgage', dom.formatMoney(sum('withdrawn'))));
    tipEl.appendChild(el('div', { className: 'dep-tip-sep' }));
    tipEl.appendChild(line('tip.totalIn', dom.formatMoney(last.cumFlow)));
    tipEl.appendChild(line('tip.totalIncome', dom.formatMoney(last.cumIncome)));
    tipEl.appendChild(line('tip.totalTax', dom.formatMoney(last.cumTax)));

    tipEl.hidden = false;
    tipCell = td;
    placeTip();
  }

  // The tooltip lives outside .schedule-wrap (position: fixed) so scrolling does not clip it; above or below as space allows.
  // Recomputed on scroll (including from keyboard focus); if the cell left the DOM, it hides.
  function placeTip() {
    if (!tipCell) return;
    if (!document.body.contains(tipCell)) { hideTip(); return; }
    var rect = tipCell.getBoundingClientRect();
    var left = Math.max(8, Math.min(rect.left, window.innerWidth - tipEl.offsetWidth - 8));
    var top = rect.bottom + 6;
    if (top + tipEl.offsetHeight > window.innerHeight - 8) top = Math.max(8, rect.top - tipEl.offsetHeight - 6);
    tipEl.style.left = left + 'px';
    tipEl.style.top = top + 'px';
  }

  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') hideTip(); });
  document.addEventListener('click', function (event) {
    if (!event.target.closest('td.dep') && !event.target.closest('.dep-tip')) hideTip();
  });
  window.addEventListener('resize', placeTip);
  window.addEventListener('scroll', placeTip, true);

  // The minimum debt remainder among a row's values (null - no value): flags per column.
  // One mortgage or all values equal - nothing to highlight.
  function minFlags(values) {
    var present = values.filter(function (v) { return v !== null; });
    if (present.length < 2) return [];
    var min = Math.min.apply(null, present);
    var flags = values.map(function (v) { return v !== null && v - min < 0.005; });
    return flags.filter(Boolean).length === present.length ? [] : flags;
  }

  // items: [{ name, color, rows, error }]; view: { columns: { key: bool }, showDates, expanded: { year: bool } }.
  // One table for all mortgages: a row is a year (12 months from the mortgage start), an expanded year shows its months;
  // a column group is a parameter, with a column per mortgage inside the group.
  function render(container, items, view) {
    // Scroll and focus on the year button persist across redraws
    var oldWrap = container.querySelector('.schedule-wrap');
    var scrollTop = oldWrap ? oldWrap.scrollTop : 0;
    var scrollLeft = oldWrap ? oldWrap.scrollLeft : 0;
    var active = document.activeElement;
    var focusYear = active && container.contains(active) ? active.getAttribute('data-year') : null;
    dom.clear(container);
    host = container;
    hideTip();
    hlRow = null;
    hlMonth = null;

    var maxMonth = maxMonthOf(items);
    if (!items.length || !maxMonth) {
      container.appendChild(el('p', { className: 'empty', text: t('empty.noData') }));
      return;
    }

    // Groups: { column, cols: [{ item, name, color, map, paired?, failed? }] }
    var wanted = view.showDates ? [DATE_COLUMN] : [];
    COLUMNS.forEach(function (c) { if (view.columns[c.key] !== false) wanted.push(c); });
    var groups = wanted.map(function (column) {
      return { column: column, cols: columnsOf(items, column) };
    }).filter(function (g) { return g.cols.length; });

    // A mortgage without a schedule (a calculation error) gets a column in the first group: the error text or "-"
    if (groups.length) {
      items.forEach(function (item) {
        if (!item.rows.length && item.kind !== 'deposit') groups[0].cols.push({ item: item, name: item.name, color: item.color, map: {}, failed: true });
      });
    }
    var tipCols = [];
    groups.forEach(function (g) { if (g.column.key === 'balance') tipCols = tipCols.concat(g.cols); });
    tipData = { cols: tipCols };

    var head1 = el('tr', null, el('th', { className: 'month-col', rowSpan: 2, text: t('schedule.period') }));
    var head2 = el('tr');
    groups.forEach(function (g) {
      head1.appendChild(el('th', { className: 'group-head first', colSpan: g.cols.length },
        el('span', { className: 'group-name', text: t(g.column.labelKey) })));
      g.cols.forEach(function (c, i) {
        head2.appendChild(el('th', {
          className: 'item-head' + (i ? '' : ' first') + (g.column.key === 'debtEnd' ? ' debt-head' : ''),
          style: { borderTop: '4px solid ' + c.color }
        }, el('span', { className: 'item-name', text: c.name, title: c.name })));
      });
    });

    function cellClass(g, i, extra) {
      return (g.column.key === 'date' ? '' : 'num') + (g.column.key === 'debtEnd' ? ' debt' : '') + (i ? '' : ' first') + extra;
    }

    // Values are only numbers, dates from our formatters and dictionary texts, so rows are built as HTML.
    // Months of collapsed years are not created in the DOM.
    var html = [];
    var years = Math.ceil(maxMonth / MONTHS_IN_YEAR);
    for (var year = 1; year <= years; year++) {
      var from = (year - 1) * MONTHS_IN_YEAR + 1;
      var to = Math.min(year * MONTHS_IN_YEAR, maxMonth);
      var open = !!view.expanded[year];

      var cells = ['<th class="month-col year-col"><button type="button" class="year-toggle" data-year="' + year +
        '" aria-expanded="' + open + '">' + (open ? '▾' : '▸') + ' ' + t('schedule.year', { n: year }) + '</button></th>'];
      groups.forEach(function (g) {
        var yearRows = g.cols.map(function (c) {
          var rows = [];
          for (var m = from; m <= to; m++) if (c.map[m]) rows.push(c.map[m]);
          return rows;
        });
        var flags = g.column.key === 'debtEnd' ? minFlags(yearRows.map(function (rows) {
          return rows.length ? rows[rows.length - 1].debtEnd : null;
        })) : [];
        g.cols.forEach(function (c, i) {
          if (c.failed) {
            var error = year === 1 && c.item.error;
            cells.push('<td class="' + cellClass(g, i, error ? ' error' : ' na') + '">' +
              (error ? t('error.' + c.item.error) : dom.EMPTY) + '</td>');
            return;
          }
          var rows = yearRows[i];
          var dep = depositAttrs(g, c, rows, from, to);
          var cell = rows.length ? cellOf(g.column, rows) : null;
          cells.push('<td class="' + cellClass(g, i, (cell ? '' : ' na') + (flags[i] ? ' min' : '') + (dep ? ' dep' : '')) + '"' + dep + (cell ? compareAttrs(g.column, cell) : '') + '>' +
            (cell ? cellHtml(g.column, cell, extrasOf(c)) : dom.EMPTY) + '</td>');
        });
      });
      html.push('<tr class="year-row" data-year="' + year + '">' + cells.join('') + '</tr>');

      if (!open) continue;
      for (var month = from; month <= to; month++) {
        var monthCells = ['<th class="month-col month-num">' + month + '</th>'];
        groups.forEach(function (g) {
          var flags = g.column.key === 'debtEnd' ? minFlags(g.cols.map(function (c) {
            var r = c.map[month];
            return r ? r.debtEnd : null;
          })) : [];
          g.cols.forEach(function (c, i) {
            var row = c.map[month];
            var dep = depositAttrs(g, c, row ? [row] : [], month, month);
            var cell = row ? cellOf(g.column, [row]) : null;
            monthCells.push('<td class="' + cellClass(g, i, (cell ? '' : ' na') + (flags[i] ? ' min' : '') + (dep ? ' dep' : '')) + '"' + dep + (cell ? compareAttrs(g.column, cell) : '') + '>' +
              (cell ? cellHtml(g.column, cell, extrasOf(c)) : dom.EMPTY) + '</td>');
          });
        });
        html.push('<tr data-month="' + month + '">' + monthCells.join('') + '</tr>');
      }
    }
    var tbody = el('tbody');
    tbody.innerHTML = html.join('');
    // Hovering a numeric cell: the other cells of the same row and group show the difference from it
    var compared = null;
    var BASE_ATTR = { v: 'data-v', i: 'data-vi', p: 'data-vp', f: 'data-vf', o: 'data-vo' };
    var LABEL_KEY = { i: 'schedule.interestShort', p: 'schedule.principalShort', f: 'schedule.feesShort', o: 'schedule.overpaymentShort' };
    function clearCompare() {
      if (!compared) { return; }
      compared.row.querySelectorAll('.cmp-line').forEach(function (l) { l.textContent = l.getAttribute('data-b'); l.removeAttribute('data-s'); });
      compared.cell.classList.remove('cmp-base');
      compared = null;
    }
    function showCompare(cell) {
      if (compared && compared.cell === cell) { return; }
      clearCompare();
      var row = cell.parentNode;
      var group = cell.getAttribute('data-g');
      row.querySelectorAll('td[data-g="' + group + '"]').forEach(function (c) {
        if (c === cell) { return; }
        c.querySelectorAll('.cmp-line').forEach(function (l) {
          var k = l.getAttribute('data-k');
          var diff = MC.core.round2(Number(c.getAttribute(BASE_ATTR[k])) - Number(cell.getAttribute(BASE_ATTR[k])));
          l.textContent = (LABEL_KEY[k] ? t(LABEL_KEY[k]) + ' ' : '') + signedMoney(diff);
          l.setAttribute('data-s', diff > 0 ? 'pos' : diff < 0 ? 'neg' : 'zero');
        });
      });
      cell.classList.add('cmp-base');
      compared = { cell: cell, row: row };
    }
    tbody.addEventListener('mouseover', function (event) {
      var cell = event.target.closest('td[data-v]');
      if (cell) { showCompare(cell); } else { clearCompare(); }
      var depCell = event.target.closest('td.dep');
      if (depCell) showTip(depCell);
    });
    tbody.addEventListener('mouseleave', clearCompare);
    tbody.addEventListener('mouseout', function (event) {
      var td = event.target.closest('td.dep');
      if (td && td === tipCell && !td.contains(event.relatedTarget)) hideTip();
    });
    tbody.addEventListener('focusin', function (event) {
      var td = event.target.closest('td.dep');
      if (td) showTip(td);
    });
    tbody.addEventListener('focusout', function (event) {
      var td = event.target.closest('td.dep');
      if (td && td === tipCell) hideTip();
    });
    tbody.addEventListener('click', function (event) {
      // A click on a deposit cell shows the tooltip (touch); expanding a year stays with the year button
      var depCell = event.target.closest('td.dep');
      if (depCell) { showTip(depCell); return; }
      var row = event.target.closest('tr[data-year]');
      if (!row) return;
      var y = Number(row.getAttribute('data-year'));
      view.expanded[y] = !view.expanded[y];
      render(container, items, view);
    });

    var wrap = el('div', { className: 'schedule-wrap' }, el('table', { className: 'schedule' }, [
      el('thead', null, [head1, head2]),
      tbody
    ]));
    container.appendChild(wrap);
    wrap.scrollTop = scrollTop;
    wrap.scrollLeft = scrollLeft;
    if (focusYear) {
      var button = wrap.querySelector('button[data-year="' + focusYear + '"]');
      if (button) button.focus({ preventScroll: true });
    }
  }

  MC.ui.ScheduleTable = {
    render: render,
    columns: COLUMNS,
    yearOfMonth: yearOfMonth,
    yearCount: yearCount,
    setHighlight: setHighlight,
    scrollToYear: scrollToYear
  };
})();
