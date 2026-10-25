(function () {
  'use strict';

  var dom = MC.ui.dom;
  var t = MC.core.t;
  var el = dom.el;
  var NOTE_MS = 4000;

  // The scenario tab bar above the comparison table.
  // handlers: { onSwitch(id), onAdd(), onRename(id, name), onDuplicate(id), onExport(id), onImport(text | null on a read error), onDelete(id) }
  function create(container, handlers) {
    var root = el('div', { className: 'scn-bar', role: 'group', 'aria-label': t('scenario.label') });
    container.appendChild(root);
    var renaming = false;
    var note = el('span', { className: 'scn-note', role: 'status' });
    var noteTimer = null;

    // Import: a hidden file input; the file text goes to the handler, the input is reset (the same file can be chosen again)
    var fileInput = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { handlers.onImport(String(reader.result)); };
      reader.onerror = function () { handlers.onImport(null); };
      reader.readAsText(file);
    });
    container.appendChild(fileInput);

    // Rename in place: an input instead of the tab label; Enter/blur saves, Esc cancels
    function renameTab(scenario, tab) {
      renaming = true;
      var input = el('input', { type: 'text', className: 'scn-input', value: scenario.name, title: t('scenario.rename') });
      var done = false;
      function finish(save) {
        if (done) return;
        done = true;
        renaming = false;
        if (save) handlers.onRename(scenario.id, input.value);
        else if (tab.parentNode) tab.parentNode.replaceChild(tab, input);
      }
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') finish(true);
        else if (event.key === 'Escape') finish(false);
      });
      input.addEventListener('blur', function () { finish(true); });
      tab.parentNode.replaceChild(input, tab);
      input.focus();
      input.select();
    }

    // An icon button inside a tab; on inactive tabs it is hidden until hover (except delete)
    function tool(text, labelKey, onClick, className) {
      return el('button', {
        type: 'button', className: 'icon-btn scn-tool ' + (className || ''), text: text,
        title: t(labelKey), 'aria-label': t(labelKey), on: { click: onClick }
      });
    }

    // The "+" button with a choice: the main part is a new scenario, the arrow opens a menu ("New scenario", "Import from file...")
    function makeAdd() {
      var menu = el('ul', { className: 'add-menu', role: 'menu', hidden: true }, [
        el('li', { role: 'none' }, el('button', {
          type: 'button', role: 'menuitem', className: 'add-item', text: t('scenario.new'),
          on: { click: function () { closeMenu(); handlers.onAdd(); } }
        })),
        el('li', { role: 'none' }, el('button', {
          type: 'button', role: 'menuitem', className: 'add-item', text: t('scenario.importFile'),
          title: t('scenario.importHint'),
          on: { click: function () { closeMenu(); fileInput.click(); } }
        }))
      ]);
      var toggle = el('button', {
        type: 'button', className: 'btn-small scn-add-toggle', text: '▾', title: t('scenario.addChoose'),
        'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': t('scenario.addChoose')
      });
      var split = el('div', { className: 'scn-add-split' }, [
        el('button', { type: 'button', className: 'btn-small scn-add', text: '+', title: t('scenario.add'), on: { click: handlers.onAdd } }),
        toggle,
        menu
      ]);
      var closeMenu = dom.attachMenu(split, toggle, menu).close;
      return split;
    }

    function render(set) {
      dom.clear(root);
      set.scenarios.forEach(function (s) {
        var active = s.id === set.activeId;
        var tab = el('button', {
          type: 'button', className: 'scn-tab' + (active ? ' active' : ''),
          text: s.name, title: s.name
        });
        if (active) tab.setAttribute('aria-current', 'true');
        tab.addEventListener('click', function () { if (!active) handlers.onSwitch(s.id); });
        tab.addEventListener('dblclick', function () { if (active && !renaming) renameTab(s, tab); });
        // A scenario's actions are part of its tab: rename, duplicate, export; the only scenario cannot be deleted
        var item = el('div', { className: 'scn-item' + (active ? ' active' : '') }, [
          tab,
          tool('✎', 'scenario.renameHint', function () { renameTab(s, tab); }),
          tool('⧉', 'scenario.duplicateHint', function () { handlers.onDuplicate(s.id); }),
          tool('⤓', 'scenario.exportHint', function () { handlers.onExport(s.id); })
        ]);
        if (set.scenarios.length > 1) item.appendChild(tool('×', 'scenario.deleteHint', function () { handlers.onDelete(s.id); }, 'scn-close icon-btn-danger'));
        root.appendChild(item);
      });
      root.appendChild(makeAdd());
      root.appendChild(note);
    }

    // A short message next to the tabs (disappears by itself)
    function notify(text) {
      note.textContent = text;
      clearTimeout(noteTimer);
      noteTimer = setTimeout(function () { note.textContent = ''; }, NOTE_MS);
    }

    return { render: render, notify: notify };
  }

  MC.ui.ScenarioTabs = { create: create };
})();
