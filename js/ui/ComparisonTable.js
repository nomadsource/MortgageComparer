(function () {
  'use strict';

  var dom = MC.ui.dom;
  var t = MC.core.t;
  var el = dom.el;

  function resolve(root, path) {
    var cur = root;
    var parts = path.split('.');
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || cur === undefined) return { ok: false };
      cur = cur[parts[i]];
    }
    return { ok: cur !== undefined, value: cur };
  }

  function setPath(root, path, value) {
    var parts = path.split('.');
    var cur = root;
    for (var i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
    cur[parts[parts.length - 1]] = value;
  }

  // Editors: (def, m, options) -> { el, update }. update() syncs only the labels,
  // the inputs are not recreated (focus is not lost). Changes are reported through options.onChange(m).

  function numberEditor(def, m, options) {
    var ed = def.editor;
    function read() { return resolve(m, def.path).value; }
    var input = dom.numberInput(ed, read, function (v) {
      setPath(m, def.path, v);
      options.onChange(m);
    });
    var hint = ed.hint ? el('span', { className: 'hint' }) : null;
    function update() {
      if (hint) hint.textContent = dom.monthLabel(read(), m.terms ? m.terms.startDate : m.startDate);
    }
    update();
    return { el: el('div', { className: 'cell-number' }, [input, hint]), update: update };
  }

  function monthEditor(def, m, options) {
    function read() { return resolve(m, def.path).value; }
    var select = el('select', { className: 'inp' }, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (n) {
      return el('option', { value: String(n), text: t('month.' + n) });
    }));
    select.value = String(read().month);
    var year = dom.numberInput({ min: 1, int: true }, function () { return read().year; }, function (v) {
      setPath(m, def.path, { year: v, month: Number(select.value) });
      options.onChange(m);
    });
    select.addEventListener('change', function () {
      // the year field may hold unconfirmed input, so the year is taken from the domain
      year.value = read().year;
      year.classList.remove('invalid');
      setPath(m, def.path, { year: read().year, month: Number(select.value) });
      options.onChange(m);
    });
    return { el: el('div', { className: 'cell-date' }, [select, year]), update: function () {} };
  }

  function strategyEditor(def, m, options) {
    var ed = def.editor;
    var registry = MC.domain[ed.registry];
    var select = el('select', { className: 'inp' }, registry.kinds.map(function (kind) {
      return el('option', { value: kind, text: t(ed.labelPrefix + kind) });
    }));
    select.value = resolve(m, def.path).value.kind;
    select.addEventListener('change', function () {
      setPath(m, def.path, registry.create(select.value));
      options.onChange(m);
    });
    return { el: select, update: function () {} };
  }

  // A compound editor: several fields of one entity in one cell (each is an ordinary editor with its own label and path).
  function composeEditor(def, m, options) {
    var parts = def.editor.parts.map(function (part) {
      var sub = { path: part.path, editor: part.editor };
      return { sub: sub, editor: editors[part.editor.type](sub, m, options), labelKey: part.labelKey };
    });
    return {
      el: el('div', { className: 'cell-compose' }, parts.map(function (p) {
        return el('label', { className: 'compose-part' }, [el('span', { className: 'hint', text: t(p.labelKey) }), p.editor.el]);
      })),
      update: function () { parts.forEach(function (p) { p.editor.update(); }); },
      sig: function () {
        return JSON.stringify(parts.map(function (p) { return resolve(m, p.sub.path).value; }));
      }
    };
  }

  // A mortgage's initial amount: a number (terms.principal) or a percent of the property value.
  // The mode is a select; the fields of the chosen mode are below. The "loan amount" row is recomputed in update() without recreating the fields.
  function principalEditor(def, m, options) {
    var terms = m.terms;
    function field(key, spec) {
      return dom.numberInput(spec, function () { return terms[key]; }, function (v) {
        terms[key] = v;
        options.onChange(m);
      });
    }
    function part(labelKey, input) {
      return el('label', { className: 'compose-part' }, [el('span', { className: 'hint', text: t(labelKey) }), input]);
    }
    var select = el('select', { className: 'inp' }, ['amount', 'percent'].map(function (mode) {
      return el('option', { value: mode, text: t('principal.mode.' + mode) });
    }));
    select.value = terms.principalMode;
    var amountInput = field('principal', { min: 0 });
    var valueInput = field('propertyValue', { min: 0 });
    var percentInput = field('principalPercent', { min: 0, max: 100 });
    var note = el('small', { className: 'hint' });
    var amountBox = el('div', { className: 'cell-compose' }, [amountInput]);
    var percentBox = el('div', { className: 'cell-compose' }, [
      part('principal.propertyValue', valueInput), part('principal.percent', percentInput), note
    ]);
    function update() {
      var percent = terms.principalMode === 'percent';
      amountBox.hidden = percent;
      percentBox.hidden = !percent;
      note.textContent = t('principal.loanAmount', { v: dom.formatMoney(terms.loanAmount()) });
    }
    select.addEventListener('change', function () {
      terms.principalMode = select.value;
      // ASSUMPTION: on the first switch to percent the property value is chosen so the current amount stays the same;
      // on switching back to "amount" principal is left alone
      if (terms.principalMode === 'percent' && !(terms.propertyValue > 0) && terms.principalPercent > 0) {
        terms.propertyValue = Math.round(terms.principal / (terms.principalPercent / 100));
        valueInput.dispatchEvent(new Event('blur'));
      }
      update();
      options.onChange(m);
    });
    update();
    return {
      el: el('div', { className: 'cell-compose' }, [select, amountBox, percentBox]),
      update: update,
      sig: function () { return JSON.stringify(terms.loanAmount()); }
    };
  }

  // A classic mortgage's deposit links: a list of rows [deposit v] [flag "interest to overpayment"] [x] and a link
  // "+ Add deposit". A row's choices are the deposits not yet linked to this mortgage, plus the current one. Edits Portfolio;
  // adding/removing/changing a deposit is a structural redraw, the flag an ordinary change. Deposit labels
  // follow a rename without recreating the field (update).
  function depositLinkEditor(def, m, options) {
    var root = el('div', { className: 'cell-flag link-list' });
    var built = null;
    function state() {
      var p = options.portfolio();
      return JSON.stringify([
        p.linksOf(m.id).map(function (l) { return [l.depositId, l.useInterest === true]; }),
        p.deposits().map(function (d) { return [d.id, dom.productName(d)]; })
      ]);
    }
    function act(fn) {
      try {
        fn();
      } catch (e) {
        console.error(e);
        build();
        return;
      }
      options.onStructural(m);
    }
    function build() {
      var portfolio = options.portfolio();
      var deposits = portfolio.deposits();
      var links = portfolio.linksOf(m.id);
      var taken = {};
      links.forEach(function (l) { taken[l.depositId] = true; });
      dom.clear(root);
      links.forEach(function (link) {
        var select = el('select', { className: 'inp' });
        deposits.forEach(function (d) {
          if (d.id === link.depositId || !taken[d.id]) {
            select.appendChild(el('option', { value: d.id, text: dom.productName(d) }));
          }
        });
        select.value = link.depositId;
        select.addEventListener('change', function () {
          act(function () { portfolio.changeLinkDeposit(m.id, link.depositId, select.value); });
        });
        var box = el('input', { type: 'checkbox', checked: link.useInterest === true });
        box.addEventListener('change', function () {
          portfolio.setUseInterest(m.id, link.depositId, box.checked);
          built = state();
          options.onChange(m);
        });
        var remove = el('button', {
          type: 'button', className: 'btn-icon', text: '×', title: t('link.remove'),
          on: { click: function () { act(function () { portfolio.removeLink(m.id, link.depositId); }); } }
        });
        root.appendChild(el('div', { className: 'link-item' }, [
          el('div', { className: 'link-line' }, [select, remove]),
          el('label', { className: 'check' }, [box, el('span', { text: t(def.editor.flagKey) })])
        ]));
      });
      if (!deposits.length) {
        root.appendChild(el('span', { className: 'hint', text: t('link.noDeposits') }));
      } else if (deposits.some(function (d) { return !taken[d.id]; })) {
        root.appendChild(el('button', {
          type: 'button', className: 'btn-link', text: t('link.add'),
          on: {
            click: function () {
              var free = deposits.filter(function (d) { return !taken[d.id]; })[0];
              act(function () { portfolio.addLink(m.id, free.id); });
            }
          }
        }));
      }
      built = state();
    }
    build();

    return {
      el: root,
      update: function () { if (state() !== built) build(); },
      sig: function () {
        var links = options.portfolio().linksOf(m.id);
        return links.length
          ? links.map(function (l) { return l.depositId + ':' + (l.useInterest === true); }).join('|')
          : 'none';
      }
    };
  }

  // A list; if the product has ed.tax.path (a deposit), a TaxField widget goes under it. The tax is part of the cell's sig.
  function listEditor(def, m, options) {
    var ed = def.editor;
    var list = MC.ui.ListEditor.create({
      items: resolve(m, def.path).value,
      fields: ed.fields,
      fixedFirst: ed.fixedFirst,
      newItem: function (items) { return ed.newItem(items, m); },
      startDate: function () { return m.terms ? m.terms.startDate : m.startDate; },
      onChange: function () { options.onChange(m); }
    });
    if (!ed.tax || !resolve(m, ed.tax.path).ok) return list;
    var tax = MC.ui.TaxField.create({
      read: function () { return resolve(m, ed.tax.path).value; },
      write: function (v) { setPath(m, ed.tax.path, v); },
      onChange: function () { options.onChange(m); }
    });
    return {
      el: el('div', { className: 'cell-rates' }, [list.el, tax.el]),
      update: list.update,
      sig: function () { return JSON.stringify([resolve(m, def.path).value, resolve(m, ed.tax.path).value]); }
    };
  }

  var editors = {
    number: numberEditor,
    month: monthEditor,
    strategy: strategyEditor,
    depositLink: depositLinkEditor,
    compose: composeEditor,
    principal: principalEditor,
    list: listEditor
  };

  // A cell: { td, key, sig(), refresh() }
  //  key   - a number for highlighting the best (null for editors);
  //  sig() - a string for comparing values (difference highlight, "Only differences"); null - no value ("-").

  // A row with pathByKind / editorByKind reads and edits different fields and editors for different product kinds
  function defForKind(def, kind) {
    if (!(def.pathByKind && def.pathByKind[kind]) && !(def.editorByKind && def.editorByKind[kind])) { return def; }
    var copy = {};
    Object.keys(def).forEach(function (key) { copy[key] = def[key]; });
    if (def.pathByKind && def.pathByKind[kind]) { copy.path = def.pathByKind[kind]; }
    if (def.editorByKind && def.editorByKind[kind]) { copy.editor = def.editorByKind[kind]; }
    return copy;
  }

  function makeEditCell(rowDef, m, options) {
    var def = defForKind(rowDef, m.kind);
    var td = el('td', { className: 'cell' });
    var cell = { td: td, key: null, sig: function () { return null; }, refresh: function () {} };
    if ((def.appliesTo && def.appliesTo.indexOf(m.kind) < 0) || (def.path && !resolve(m, def.path).ok)) {
      td.className += ' na';
      td.textContent = dom.EMPTY;
      return cell;
    }
    var editor = editors[def.editor.type](def, m, options);
    td.appendChild(editor.el);
    // An editor without a path (the deposit link) supplies the value for comparison itself
    cell.sig = editor.sig || function () { return JSON.stringify(resolve(m, def.path).value); };
    cell.refresh = editor.update;
    return cell;
  }

  // Deposit results in pairs: one entry per linked mortgage - { name, entry } (entry is an element of the mortgage's result.deposits)
  function pairsOf(product, results, mortgages) {
    if (product.kind !== 'deposit') { return []; }
    var out = [];
    mortgages.forEach(function (mortgage) {
      var res = results[mortgage.id];
      var entry = res && res.deposits ? res.deposits.filter(function (d) { return d.depositId === product.id; })[0] : null;
      if (entry) { out.push({ name: dom.productName(mortgage), entry: entry }); }
    });
    return out;
  }

  function makeResultCell(def, col) {
    var ed = def.editor;
    var td = el('td', { className: 'cell result' });
    var signature = null;
    var cell = { td: td, key: null, sig: function () { return signature; } };

    cell.refresh = function () {
      var res = col.result;
      td.className = 'cell result';
      td.textContent = '';
      cell.key = null;
      signature = null;
      if (ed.type === 'status') {
        if (res && res.error) {
          signature = res.error;
          td.className += ' error';
          td.textContent = t('error.' + res.error);
        } else {
          td.className += ' na';
          td.textContent = dom.EMPTY;
        }
        return;
      }
      // A deposit paired with mortgages: the value net of withdrawals, as a separate line per pair
      if (!ed.lines && col.pairs.length && def.path.indexOf('metrics.') === 0) {
        var vals = col.pairs.map(function (p) { return { name: p.name, r: resolve(p.entry, def.path) }; });
        var keys = vals.map(function (v) { return v.r.ok ? MC.ui.rows.resultKey(ed.format, v.r.value) : null; });
        if (keys.every(function (k) { return k === null; })) {
          td.className += ' na';
          td.textContent = dom.EMPTY;
          return;
        }
        cell.key = keys[0];
        signature = keys.join('|');
        vals.forEach(function (v, i) {
          td.appendChild(el('div', { className: 'pair-line' }, [
            el('span', { className: 'pair-name', text: v.name }),
            el('span', { className: 'pair-value', text: keys[i] === null ? dom.EMPTY : MC.ui.rows.resultText(ed.format, v.r.value) })
          ]));
        });
        return;
      }
      var r = res && !res.error ? resolve(res, def.path) : { ok: false };
      var key = r.ok ? MC.ui.rows.resultKey(ed.format, r.value) : null;
      if (key === null) {
        td.className += ' na';
        td.textContent = dom.EMPTY;
        return;
      }
      cell.key = key;
      signature = String(key);
      td.textContent = MC.ui.rows.resultText(ed.format, r.value);
      // Small lines under the number (like the payment breakdown in the monthly table): ed.lines - [{ labelKey, value(m, result) }]
      (ed.lines || []).forEach(function (l) {
        if (l.show && !l.show(col.m, res)) return;
        td.appendChild(el('small', { className: 'result-line', text: t(l.labelKey, { v: l.text ? l.text(col.m, res) : dom.formatMoney(l.value(col.m, res)) }) }));
      });
    };
    cell.refresh();
    return cell;
  }

  // Difference from the row's best value: money as an amount, term and date in months ("+1 yr 2 mo.")
  function deltaText(format, key, best) {
    var diff = key - best;
    var size = Math.abs(diff);
    if (format === 'percent') return (diff > 0 ? '+' : '−') + (Math.round(size * 100) / 100).toLocaleString(MC.core.numberLocale(), { maximumFractionDigits: 2 }) + ' ' + t('unit.pp');
    return (diff > 0 ? '+' : '−') + (format === 'money' ? dom.formatMoney(size) : dom.formatTerm(size));
  }

  function isResultRow(def) {
    return !!def.editor && (def.editor.type === 'result' || def.editor.type === 'status');
  }

  // options: { container, portfolio() -> Portfolio, onChange(m), onStructural(m), onAdd(kind), onDuplicate(m), onMove(m, delta), onCopyTo(m, scenarioId), onDelete(m), scenarios() -> ScenarioSet }
  function create(options) {
    var wrap = el('div', { className: 'cmp-wrap' });
    options.container.appendChild(wrap);

    var cols = [];
    var rowObjs = [];
    var groupObjs = [];
    var onlyDiff = false;
    // Group collapse state lives here, so it survives a table redraw
    var collapsed = {};
    var initialStateSet = false;
    MC.ui.rows.groups.forEach(function (g) { collapsed[g.key] = !!g.collapsed; });

    // Whether values differ among the row's APPLICABLE cells (not "-"): the shared rule for difference highlight and "Only differences".
    // The calculation status row is shown while anyone has an error.
    function rowDiffers(ro) {
      if (ro.def.editor && ro.def.editor.type === 'status') return ro.cells.some(function (c) { return c.sig() !== null; });
      var sigs = ro.cells.map(function (c) { return c.sig(); }).filter(function (s) { return s !== null; });
      return sigs.length > 1 && sigs.some(function (s) { return s !== sigs[0]; });
    }

    // Highlight: the best value and the difference from it in results; differing values in parameters
    function applyHighlight() {
      rowObjs.forEach(function (ro) {
        if (isResultRow(ro.def)) {
          if (!ro.def.editor.better) return;
          var best = MC.ui.rows.bestKey(ro.cells.map(function (c) { return c.key; }), ro.def.editor.better);
          ro.cells.forEach(function (c) {
            var old = c.td.querySelector('.delta');
            if (old) c.td.removeChild(old);
            var isBest = best !== null && c.key === best;
            c.td.classList.toggle('best', isBest);
            if (best !== null && c.key !== null && !isBest) {
              c.td.appendChild(el('small', { className: 'delta', text: deltaText(ro.def.editor.format, c.key, best) }));
            }
          });
          return;
        }
        var differs = rowDiffers(ro);
        ro.cells.forEach(function (c) { c.td.classList.toggle('diff', differs && c.sig() !== null); });
      });
    }

    function applyVisibility() {
      var filtering = onlyDiff && cols.length > 1;
      rowObjs.forEach(function (ro) {
        var hide = false;
        // The status row is needed only when there is an error (someone's value is not "-")
        if (ro.def.editor && ro.def.editor.type === 'status' && !rowDiffers(ro)) { hide = true; }
        if (filtering) {
          hide = !rowDiffers(ro);
          // A row the user is typing in is not hidden
          if (ro.tr.contains(document.activeElement)) hide = false;
        }
        ro.tr.classList.toggle('is-hidden', hide);
      });
      // In "Only differences" mode a group header is hidden only together with all its rows
      groupObjs.forEach(function (g) {
        var allHidden = g.rows.every(function (ro) { return ro.tr.classList.contains('is-hidden'); });
        g.tr.classList.toggle('is-hidden', allHidden);
      });
    }

    // Collapsed groups: rows are hidden by a class, the DOM and inputs stay in place
    function applyCollapsed() {
      groupObjs.forEach(function (g) {
        var isCollapsed = collapsed[g.key];
        g.button.setAttribute('aria-expanded', String(!isCollapsed));
        g.arrow.textContent = isCollapsed ? '▸' : '▾';
        g.rows.forEach(function (ro) { ro.tr.classList.toggle('is-collapsed', isCollapsed); });
      });
    }

    // The scenario choice for copying a product: items are refreshed when the list opens (scenarios may have been renamed or added)
    function makeCopyToSelect(m) {
      var select = el('select', { className: 'btn-small copy-to', title: t('action.copyTo'), 'aria-label': t('action.copyTo') });
      // The list is rebuilt only if the scenarios changed: editing it while it opens breaks the native menu
      var filled = null;
      function fill() {
        var set = options.scenarios();
        var others = set.scenarios.filter(function (s) { return s.id !== set.activeId; });
        var signature = JSON.stringify(others.map(function (s) { return [s.id, s.name]; }));
        if (signature === filled) return;
        filled = signature;
        dom.clear(select);
        select.appendChild(el('option', { value: '', text: t('action.copyTo') }));
        others.forEach(function (s) { select.appendChild(el('option', { value: s.id, text: s.name })); });
        select.disabled = !others.length;
      }
      fill();
      select.addEventListener('mousedown', fill);
      select.addEventListener('focus', fill);
      select.addEventListener('change', function () {
        var id = select.value;
        select.value = '';
        if (id) options.onCopyTo(m, id);
      });
      return select;
    }

    function makeHead(m, index) {
      var nameInput = el('input', { type: 'text', className: 'name-input', value: m.name, placeholder: t('name.untitled'), title: t('head.name') });
      nameInput.addEventListener('input', function () {
        m.name = nameInput.value;
        options.onChange(m);
      });
      return el('th', { className: 'colhead' }, [
        el('div', { className: 'colbar', style: { background: dom.seriesColor(index) } }),
        el('div', { className: 'col-tools' }, [
          el('div', { className: 'col-tools-group' }, [
            el('button', { type: 'button', className: 'icon-btn col-btn col-move', text: '◀', title: t('action.moveLeft'), 'aria-label': t('action.moveLeft'), disabled: index === 0, on: { click: function () { options.onMove(m, -1); } } }),
            el('button', { type: 'button', className: 'icon-btn col-btn col-move', text: '▶', title: t('action.moveRight'), 'aria-label': t('action.moveRight'), disabled: index === options.portfolio().products.length - 1, on: { click: function () { options.onMove(m, 1); } } })
          ]),
          el('div', { className: 'col-tools-group' }, [
            el('button', { type: 'button', className: 'icon-btn col-btn', text: '⧉', title: t('action.duplicate'), 'aria-label': t('action.duplicate'), on: { click: function () { options.onDuplicate(m); } } }),
            el('button', { type: 'button', className: 'icon-btn col-btn col-close icon-btn-danger', text: '×', title: t('action.delete'), 'aria-label': t('action.delete'), on: { click: function () { options.onDelete(m); } } })
          ])
        ]),
        nameInput,
        el('div', { className: 'kind', text: t('kind.' + m.kind) }),
        el('div', { className: 'actions' }, makeCopyToSelect(m))
      ]);
    }

    // The "Add" button with an optional kind choice: the main part adds a classic mortgage (the default kind),
    // the arrow opens the kind menu.
    var DEFAULT_KIND = 'classic';

    function makeAddHead() {
      var menu = el('ul', { className: 'add-menu', role: 'menu', hidden: true }, MC.domain.ProductRegistry.kinds.map(function (kind) {
        return el('li', { role: 'none' }, el('button', {
          type: 'button', role: 'menuitem', className: 'add-item', text: t('kind.' + kind),
          on: { click: function () { closeMenu(); options.onAdd(kind); } }
        }));
      }));
      var toggle = el('button', {
        type: 'button', className: 'btn-add add-toggle', text: '▾', title: t('action.addChoose'),
        'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': t('action.addChoose')
      });
      var split = el('div', { className: 'add-split' }, [
        el('button', {
          type: 'button', className: 'btn-add add-main', text: t('action.add'), title: t('kind.' + DEFAULT_KIND),
          on: { click: function () { options.onAdd(DEFAULT_KIND); } }
        }),
        toggle,
        menu
      ]);
      var closeMenu = dom.attachMenu(split, toggle, menu).close;
      return el('th', { className: 'addhead' }, split);
    }

    function makeRowLabel(def) {
      var label = el('th', { className: 'rowlabel' }, el('span', { text: t(def.labelKey) }));
      if (def.hintKey) {
        label.appendChild(el('span', { className: 'info', text: 'ⓘ', title: t(def.hintKey), tabIndex: 0, role: 'img', 'aria-label': t(def.hintKey) }));
      }
      return label;
    }

    // The position of the focused element (row, cell, index among the cell's elements) - to restore focus after a rebuild
    function focusPosition() {
      var active = document.activeElement;
      var td = active && wrap.contains(active) ? active.closest('td.cell') : null;
      if (!td) return null;
      var list = td.querySelectorAll('input, select, button');
      return { row: td.parentNode.rowIndex, cell: td.cellIndex, index: Array.prototype.indexOf.call(list, active) };
    }

    function restoreFocus(table, pos) {
      var tr = pos && table.rows[pos.row];
      var td = tr && tr.cells[pos.cell];
      var target = td && td.querySelectorAll('input, select, button')[pos.index];
      if (target) target.focus({ preventScroll: true });
    }

    // A full table rebuild (the set of columns / structure changed). The wrapper and its scroll are kept.
    function render(products, results) {
      // The initial group state is chosen once, from the first portfolio; after that the user controls it
      if (!initialStateSet) {
        initialStateSet = true;
        MC.ui.rows.groups.forEach(function (g) {
          if (g.expandIfKinds && products.some(function (p) { return g.expandIfKinds.indexOf(p.kind) >= 0; })) collapsed[g.key] = false;
        });
      }
      var scrollLeft = wrap.scrollLeft;
      var scrollTop = wrap.scrollTop;
      var focus = focusPosition();
      cols = products.map(function (m) { return { m: m, result: results[m.id], pairs: pairsOf(m, results, options.portfolio().mortgages()) }; });
      rowObjs = [];
      groupObjs = [];

      var table = el('table', { className: 'cmp' });
      table.style.setProperty('--cols', cols.length);
      var headRow = el('tr', null, el('th', { className: 'corner', text: t('table.parameters') }));
      cols.forEach(function (col, i) { headRow.appendChild(makeHead(col.m, i)); });
      headRow.appendChild(makeAddHead());
      table.appendChild(el('thead', null, headRow));

      var tbody = el('tbody');
      MC.ui.rows.groups.forEach(function (group) {
        var arrow = el('span', { className: 'group-arrow' });
        var button = el('button', { type: 'button', className: 'group-toggle' }, [arrow, el('span', { text: t(group.labelKey) })]);
        var groupTr = el('tr', { className: 'group' }, el('th', { colSpan: cols.length + 2 }, el('span', { className: 'group-label' }, button)));
        tbody.appendChild(groupTr);
        var groupObj = { key: group.key, tr: groupTr, rows: [], button: button, arrow: arrow };
        groupObjs.push(groupObj);
        // A click on the whole header row collapses it; a click and Enter on the button bubble up here
        groupTr.addEventListener('click', function () {
          collapsed[group.key] = !collapsed[group.key];
          applyCollapsed();
        });

        MC.ui.rows.rows.forEach(function (def) {
          if (def.group !== group.key) return;
          var tr = el('tr', { className: 'row' }, makeRowLabel(def));
          var cells = cols.map(function (col) {
            var cell = isResultRow(def) ? makeResultCell(def, col) : makeEditCell(def, col.m, options);
            tr.appendChild(cell.td);
            return cell;
          });
          tr.appendChild(el('td', { className: 'addcol' }));
          tbody.appendChild(tr);
          var ro = { def: def, tr: tr, cells: cells };
          rowObjs.push(ro);
          groupObj.rows.push(ro);
        });
      });
      table.appendChild(tbody);

      dom.clear(wrap);
      wrap.appendChild(table);
      wrap.scrollLeft = scrollLeft;
      wrap.scrollTop = scrollTop;
      if (!cols.length) wrap.appendChild(el('p', { className: 'empty', text: t('empty.noProducts') }));
      applyCollapsed();
      applyHighlight();
      applyVisibility();
      restoreFocus(table, focus);
    }

    // A light update after a recompute: results, month labels, highlight, row visibility
    function updateResults(results) {
      cols.forEach(function (col) { col.result = results[col.m.id]; col.pairs = pairsOf(col.m, results, options.portfolio().mortgages()); });
      rowObjs.forEach(function (ro) {
        ro.cells.forEach(function (c) { c.refresh(); });
      });
      applyHighlight();
      applyVisibility();
    }

    function setOnlyDiff(value) {
      onlyDiff = !!value;
      applyVisibility();
    }

    return { render: render, updateResults: updateResults, setOnlyDiff: setOnlyDiff };
  }

  MC.ui.ComparisonTable = { create: create };
})();
