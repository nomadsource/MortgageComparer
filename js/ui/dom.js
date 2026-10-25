(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var EMPTY = '—';
  // The number format follows the UI language (the language is fixed before this module loads, see core/locale.js)
  var LOCALE = MC.core.numberLocale();
  var MONEY_FORMAT = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var DECIMAL_COMMA = new Intl.NumberFormat(LOCALE).format(1.5) === '1,5';

  function applyProps(node, props) {
    if (!props) return;
    Object.keys(props).forEach(function (key) {
      var value = props[key];
      if (value === undefined || value === null) return;
      if (key === 'className') {
        node.className = value;
      } else if (key === 'text') {
        node.textContent = value;
      } else if (key === 'on') {
        Object.keys(value).forEach(function (name) { node.addEventListener(name, value[name]); });
      } else if (key === 'style') {
        Object.keys(value).forEach(function (name) { node.style[name] = value[name]; });
      } else if (key in node) {
        node[key] = value;
      } else {
        node.setAttribute(key, value);
      }
    });
  }

  function append(node, children) {
    if (children === undefined || children === null) return node;
    (Array.isArray(children) ? children : [children]).forEach(function (child) {
      if (child === undefined || child === null || child === false) return;
      node.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
    });
    return node;
  }

  // el('div', { className, text, on: { click }, ...properties/attributes }, [children])
  function el(tag, props, children) {
    var node = document.createElement(tag);
    applyProps(node, props);
    return append(node, children);
  }

  // svg('rect', { x, y, ..., text, style }, [children]); attributes are set only through setAttribute
  function svg(tag, attrs, children) {
    var node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === undefined || value === null) return;
        if (key === 'text') node.textContent = value;
        else if (key === 'style') Object.keys(value).forEach(function (name) { node.style[name] = value[name]; });
        else node.setAttribute(key, value);
      });
    }
    return append(node, children);
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  function isNumber(x) {
    return typeof x === 'number' && isFinite(x);
  }

  // Parses typed numbers: spaces (including non-breaking) are ignored; a dot is always a decimal separator,
  // a comma is one only where the language uses it (otherwise it is a thousands separator and is dropped)
  function parseNumber(text) {
    var s = text.replace(/\s/g, '').replace(/[−–]/g, '-').replace(DECIMAL_COMMA ? ',' : /,/g, DECIMAL_COMMA ? '.' : '');
    return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : NaN;
  }

  // A value for an input: with thousands separators (none for integer fields: terms, months, years)
  function formatInput(value, spec) {
    return isNumber(value) ? value.toLocaleString(LOCALE, { useGrouping: !spec.int, maximumFractionDigits: 10 }) : '';
  }

  // A numeric field (a text input, to show thousands separators): the value goes to onValue only
  // if it passes the spec {min, max, int}. read() returns the current domain value:
  // on blur the field reverts to it (formatted).
  function numberInput(spec, read, onValue) {
    var input = el('input', { type: 'text', inputMode: 'decimal', autocomplete: 'off', className: 'inp', value: formatInput(read(), spec) });
    input.addEventListener('blur', function () {
      input.value = formatInput(read(), spec);
      input.classList.remove('invalid');
    });
    input.addEventListener('input', function () {
      var v = parseNumber(input.value);
      var ok = isNumber(v) &&
        (spec.min === undefined || v >= spec.min) &&
        (spec.max === undefined || v <= spec.max) &&
        (!spec.int || Math.floor(v) === v);
      input.classList.toggle('invalid', !ok);
      if (ok) onValue(v);
    });
    return input;
  }


  function formatMoney(x) {
    return isNumber(x) ? MONEY_FORMAT.format(x) : EMPTY;
  }


  function formatPercent(x) {
    return isNumber(x) ? x.toLocaleString(LOCALE, { maximumFractionDigits: 2 }) + ' %' : EMPTY;
  }

  // "X yr Y mo."; a zero part is omitted
  function formatTerm(months) {
    if (!isNumber(months)) return EMPTY;
    var years = Math.floor(months / 12);
    var rest = months % 12;
    if (!years) return MC.core.t('term.months', { months: rest });
    if (!rest) return MC.core.t('term.years', { years: years });
    return MC.core.t('term.yearsMonths', { years: years, months: rest });
  }

  // "mo. 60 (Mar 2031)"
  function monthLabel(n, startDate) {
    if (!isNumber(n) || n < 1 || Math.floor(n) !== n || !startDate) return '';
    return MC.core.t('month.label', {
      n: n,
      date: MC.core.formatMonth(MC.core.addMonths(startDate, n - 1))
    });
  }

  // Series colours are categorical slots in a fixed order (CSS variables --series-N)
  // ASSUMPTION: there may be more than 8 mortgages - then the colours repeat cyclically.
  function seriesColor(index) {
    return 'var(--series-' + (index % 8 + 1) + ')';
  }


  function dateIndex(date) {
    return date.year * 12 + date.month - 1;
  }

  function indexToDate(index) {
    return { year: Math.floor(index / 12), month: index % 12 + 1 };
  }

  function niceScale(max) {
    if (!(max > 0)) return { max: 1, step: 0.2 };
    var raw = max / 5;
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag;
    var step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    return { max: Math.ceil(max / step - 1e-9) * step, step: step };
  }

  // Ticks on the time axis (month indices): the step is chosen so there are at most maxCount of them
  function timeTicks(fromIndex, toIndex, maxCount) {
    var steps = [1, 3, 6, 12, 24, 60, 120];
    var step = steps[steps.length - 1];
    for (var i = 0; i < steps.length; i++) {
      if ((toIndex - fromIndex) / steps[i] <= maxCount) { step = steps[i]; break; }
    }
    var ticks = [];
    for (var idx = Math.ceil(fromIndex / step) * step; idx <= toIndex; idx += step) ticks.push(idx);
    return { step: step, ticks: ticks };
  }

  function timeTickLabel(index, step) {
    var date = indexToDate(index);
    return step >= 12 ? String(date.year) : MC.core.formatMonth(date);
  }

  // Y-axis label: for a fractional step, with enough digits so labels do not repeat
  function formatAxis(value, step) {
    var digits = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log(step) / Math.LN10 - 1e-9));
    return value.toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  // The shared chart frame: size, SVG root, grid and axis labels.
  // The width comes from the container (viewBox = real pixels) so labels are not scaled.
  function chartFrame(container, label, yMax, height) {
    var margin = { left: 84, right: 18, top: 14, bottom: 30 };
    var width = Math.max(320, container.clientWidth || 900);
    var plotW = width - margin.left - margin.right;
    var plotH = height - margin.top - margin.bottom;
    var scale = niceScale(yMax);
    var root = svg('svg', { class: 'chart', viewBox: '0 0 ' + width + ' ' + height, width: width, height: height, role: 'img', 'aria-label': label });

    function sy(y) { return margin.top + plotH - y / scale.max * plotH; }

    // xPos(index) is the position of a label on the X axis for a month index
    function drawAxes(fromIndex, toIndex, xPos) {
      var steps = Math.round(scale.max / scale.step);
      for (var i = 0; i <= steps; i++) {
        var y = sy(i * scale.step);
        root.appendChild(svg('line', { class: i ? 'grid' : 'axis', x1: margin.left, x2: width - margin.right, y1: y, y2: y }));
        root.appendChild(svg('text', { class: 'axis-label', x: margin.left - 8, y: y + 4, 'text-anchor': 'end', text: formatAxis(i * scale.step, scale.step) }));
      }
      var ticks = timeTicks(fromIndex, toIndex, Math.max(2, Math.floor(plotW / 70)));
      ticks.ticks.forEach(function (index) {
        root.appendChild(svg('text', { class: 'axis-label', x: xPos(index), y: height - 8, 'text-anchor': 'middle', text: timeTickLabel(index, ticks.step) }));
      });
    }

    return { root: root, width: width, height: height, margin: margin, plotW: plotW, plotH: plotH, sy: sy, drawAxes: drawAxes };
  }

  // A product's display name (an empty one is replaced by a fallback)
  function productName(m) {
    return typeof m.name === 'string' && m.name.trim() ? m.name : MC.core.t('name.untitled');
  }

  // A dropdown menu on a toggle button: clicking the toggle opens/closes it; a click outside container and Escape close it.
  // Menu items call close() themselves when the menu should close after a choice. Returns { close }.
  function attachMenu(container, toggle, menu) {
    function close() {
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', onOutside, true);
      document.removeEventListener('keydown', onKey);
    }
    function onOutside(event) { if (!container.contains(event.target)) close(); }
    function onKey(event) { if (event.key === 'Escape') { close(); toggle.focus(); } }
    toggle.addEventListener('click', function () {
      if (!menu.hidden) { close(); return; }
      menu.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      document.addEventListener('click', onOutside, true);
      document.addEventListener('keydown', onKey);
    });
    return { close: close };
  }

  MC.ui.dom = {
    EMPTY: EMPTY,
    el: el,
    svg: svg,
    clear: clear,
    isNumber: isNumber,
    numberInput: numberInput,
    formatMoney: formatMoney,
    formatPercent: formatPercent,
    formatTerm: formatTerm,
    monthLabel: monthLabel,
    seriesColor: seriesColor,
    dateIndex: dateIndex,
    indexToDate: indexToDate,
    chartFrame: chartFrame,
    productName: productName,
    attachMenu: attachMenu
  };
})();
