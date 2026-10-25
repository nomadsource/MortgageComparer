(function () {
  'use strict';

  var KEY = 'mortgageComparer.v2';
  var LEGACY_KEY = 'mortgageComparer.v1'; // a single portfolio without scenarios; read on migration and never deleted
  var BROKEN_KEY = 'mortgageComparer.v2.broken'; // a copy of an unreadable v2 before the default set overwrites it
  var DEBOUNCE_MS = 400;
  var MAX_TERM_MONTHS = 1200; // matches the term fields' max in rows.js

  function validTerm(term) {
    return typeof term === 'number' && isFinite(term) && term >= 1 && term <= MAX_TERM_MONTHS;
  }

  // Corrupt data (including a term that would hang the app) counts as no data
  function validPortfolio(portfolio) {
    return portfolio.products.every(function (p) {
      var term = p.kind === 'deposit' ? p.termMonths : p.terms.termMonths;
      return typeof p.name === 'string' && validTerm(term);
    });
  }

  // A scenario store over an object with the Web Storage interface (getItem/setItem); getBackend() may throw
  // or return null (private mode, file:// in some browsers) - then nothing is read or written.
  // A separate instance with a fake store lets tests avoid touching user data.
  function create(getBackend) {
    var timer = null;
    var pending = null;

    function backend() {
      try { return getBackend(); } catch (e) { return null; }
    }

    function read(store, key) {
      var raw = store.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }

    // An unreadable v2 does not vanish silently: its raw text is kept in BROKEN_KEY (until the next corruption) and loading gives null
    function loadV2(store, raw) {
      try {
        return MC.domain.ScenarioSet.fromJSON(JSON.parse(raw), validPortfolio);
      } catch (e) {
        try { store.setItem(BROKEN_KEY, raw); } catch (e2) { /* no space: there will be no backup */ }
        return null;
      }
    }

    // Returns a ScenarioSet or null (no data / corrupt data).
    // Without a v2 key the old v1 key is used (a single portfolio; the legacy { mortgages: [...] } format is understood too):
    // it becomes the only scenario. A corrupt scenario is skipped, the others load.
    function load() {
      var store = backend();
      if (!store) return null;
      try {
        var raw = store.getItem(KEY);
        if (raw) { return loadV2(store, raw); }
        var legacy = read(store, LEGACY_KEY);
        if (!legacy) return null;
        var portfolio = MC.domain.Portfolio.fromJSON(legacy);
        return validPortfolio(portfolio) ? MC.domain.ScenarioSet.fromPortfolio(portfolio) : null;
      } catch (e) {
        return null;
      }
    }

    function write(scenarios) {
      var store = backend();
      if (!store) return;
      try {
        store.setItem(KEY, JSON.stringify(scenarios.toJSON()));
      } catch (e) {
        // quota exceeded or writing forbidden - the save is skipped
      }
    }

    function save(scenarios) {
      pending = scenarios;
      clearTimeout(timer);
      timer = setTimeout(flush, DEBOUNCE_MS);
    }

    function flush() {
      clearTimeout(timer);
      if (pending) {
        write(pending);
        pending = null;
      }
    }

    return { load: load, save: save, flush: flush };
  }

  var instance = create(function () { return window.localStorage; });
  window.addEventListener('beforeunload', instance.flush);

  MC.ui.Storage = { create: create, load: instance.load, save: instance.save, flush: instance.flush, validPortfolio: validPortfolio };
})();
