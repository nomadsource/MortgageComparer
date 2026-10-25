(function () {
  'use strict';

  var dom = MC.ui.dom;
  var t = MC.core.t;

  // The month number of an entry for a label with a date: for an isMonth field its value; for a "when" field the month of a one-off entry
  // (a recurring entry, where everyMonths is set, has no label)
  function monthOfItem(field, item) {
    if (field.kind === 'when') { return item.everyMonths !== undefined ? undefined : item.month; }
    return item[field.key];
  }

  // A payment entry's mode: exactly one of the everyMonths / month fields
  function whenMode(item) { return item.everyMonths !== undefined ? 'everyMonths' : 'month'; }

  // The "when" cell: a select "in month" / "every, mo." + an integer >= 1. On a mode change the value moves
  // to the other field (the domain stores exactly one of month / everyMonths).
  function whenCell(item, onChange) {
    var spec = { min: 1, int: true };
    var select = dom.el('select', { className: 'inp', title: t('list.when') }, ['month', 'everyMonths'].map(function (mode) {
      return dom.el('option', { value: mode, text: t('list.when.' + mode) });
    }));
    select.value = whenMode(item);
    var input = dom.numberInput(spec, function () { return item[whenMode(item)]; }, function (v) {
      item[whenMode(item)] = v;
      onChange();
    });
    input.title = t('list.whenValue');
    select.addEventListener('change', function () {
      var from = whenMode(item);
      var to = select.value;
      if (from === to) return;
      var value = item[from];
      delete item[from];
      item[to] = value;
      input.value = dom.isNumber(value) ? String(value) : '';
      input.classList.remove('invalid');
      onChange();
    });
    return dom.el('div', { className: 'list-when' }, [select, input]);
  }

  // An editor of a list of entries inside a cell (rate schedule, payments).
  // options: {
  //   items,        // the live array from the domain object; edited in place
  //   fields,       // [{ key, labelKey, min, int, isMonth, kind }]; an isMonth field is a month number (a date label under the row);
  //                 // kind: "when" - "when is the payment": select "in month" / "every, mo." + an integer >= 1; the entry stores exactly one of month / everyMonths
  //   newItem,      // function (items) -> a new entry
  //   fixedFirst,   // the first entry: its month is fixed and it cannot be removed (keeping the list non-empty is the caller's job)
  //   startDate,    // function () -> {year, month} for the month label
  //   onChange
  // }
  // Returns { el, update }: update() refreshes only the month labels.
  function create(options) {
    var items = options.items;
    var fields = options.fields;
    var root = dom.el('div', { className: 'list' });
    var monthField = fields.filter(function (f) { return f.isMonth || f.kind === 'when'; })[0];
    var hints = [];

    function refreshHints() {
      hints.forEach(function (h) {
        h.node.textContent = dom.monthLabel(monthOfItem(monthField, h.item), options.startDate());
      });
    }

    function build() {
      dom.clear(root);
      hints = [];
      var cols = {
        gridTemplateColumns: fields.map(function (f) { return f.kind === 'when' ? 'minmax(0, 2fr)' : 'minmax(0, 1fr)'; }).join(' ') + ' 26px'
      };

      if (items.length) {
        root.appendChild(dom.el('div', { className: 'list-row list-head', style: cols }, fields.map(function (f) {
          return dom.el('span', { text: t(f.labelKey) });
        }).concat(dom.el('span'))));
      }

      items.forEach(function (item, index) {
        var locked = options.fixedFirst && index === 0;
        var cells = fields.map(function (field, fieldIndex) {
          if (field.kind === 'when') {
            return whenCell(item, function () {
              refreshHints();
              options.onChange();
            });
          }
          var input = dom.numberInput(field, function () { return item[field.key]; }, function (v) {
            item[field.key] = v;
            options.onChange();
          });
          input.title = t(field.labelKey);
          if (locked && fieldIndex === 0) input.disabled = true;
          return input;
        });
        var remove = locked ? dom.el('span') : dom.el('button', {
          type: 'button', className: 'btn-icon', text: '×', title: t('list.remove'),
          on: {
            click: function () {
              items.splice(index, 1);
              build();
              options.onChange();
            }
          }
        });
        var hint = monthField ? dom.el('span', { className: 'list-hint' }) : null;
        if (hint) hints.push({ node: hint, item: item });
        root.appendChild(dom.el('div', { className: 'list-row', style: cols }, cells.concat(remove, hint)));
      });

      root.appendChild(dom.el('button', {
        type: 'button', className: 'btn-link', text: t('list.add'),
        on: {
          click: function () {
            items.push(options.newItem(items));
            build();
            options.onChange();
          }
        }
      }));
      refreshHints();
    }

    build();
    return { el: root, update: refreshHints };
  }

  MC.ui.ListEditor = { create: create };
})();
