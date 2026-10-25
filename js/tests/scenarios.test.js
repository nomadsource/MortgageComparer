(function () {
  'use strict';

  var D = MC.domain;

  function names(set) { return set.scenarios.map(function (s) { return s.name; }); }

  // An in-memory fake store: the tests do not touch the app's localStorage
  function fakeStore() {
    var data = {};
    return {
      getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
      setItem: function (key, value) { data[key] = String(value); }
    };
  }

  test('ScenarioSet: the default set is one scenario, and it is active', function () {
    var set = D.ScenarioSet.createDefault();
    assertEqual(set.scenarios.length, 1);
    assertEqual(set.active().id, set.scenarios[0].id);
    assertEqual(set.active().name, 'Set 1');
    assertEqual(set.active().portfolio.products.length, 2);
  });

  test('ScenarioSet.add: a new scenario is active, names are unique', function () {
    var set = D.ScenarioSet.createDefault();
    var second = set.add();
    assertEqual(set.activeId, second.id);
    assertEqual(second.name, 'Set 2');
    var third = set.add('Set 2');
    assertEqual(third.name, 'Set 2 (2)');
    assertTrue(set.get(second.id).portfolio !== set.scenarios[0].portfolio);
    assertEqual(second.portfolio.products.length, 1);
    assertEqual(second.portfolio.products[0].kind, 'classic');
  });

  test('ScenarioSet.add: the default name is the first free "Set N" after deletions', function () {
    var set = D.ScenarioSet.createDefault();
    var second = set.add();
    set.remove(set.scenarios[0].id);
    assertDeepEqual(names(set), ['Set 2']);
    assertEqual(set.add().name, 'Set 1');
    assertEqual(set.add().name, 'Set 3');
    assertTrue(!!second);
  });

  test('ScenarioSet.duplicate: the copy goes after the original, independent, active', function () {
    var set = D.ScenarioSet.createDefault();
    var first = set.active();
    set.add();
    var copy = set.duplicate(first.id);
    assertEqual(set.scenarios.indexOf(copy), 1);
    assertEqual(set.activeId, copy.id);
    assertEqual(copy.name, 'Set 1 (copy)');
    copy.portfolio.products[0].name = 'Another';
    assertTrue(first.portfolio.products[0].name !== 'Another');
    assertEqual(copy.portfolio.products.length, first.portfolio.products.length);
  });

  test('ScenarioSet: names and ids like constructor are not considered taken', function () {
    var set = D.ScenarioSet.createDefault();
    assertEqual(set.uniqueName('constructor'), 'constructor');
    assertEqual(set.uniqueName('toString'), 'toString');
    var json = set.toJSON();
    json.scenarios.push({ id: 'constructor', name: 'Special', portfolio: json.scenarios[0].portfolio });
    assertEqual(D.ScenarioSet.fromJSON(json).scenarios.length, 2);
  });

  test('ScenarioSet.rename: an empty name is ignored, whitespace is trimmed', function () {
    var set = D.ScenarioSet.createDefault();
    var id = set.active().id;
    set.rename(id, '  Flat  ');
    assertEqual(set.active().name, 'Flat');
    set.rename(id, '   ');
    assertEqual(set.active().name, 'Flat');
  });

  test('ScenarioSet.remove: the last one is never removed, the active one moves to a neighbour', function () {
    var set = D.ScenarioSet.createDefault();
    var a = set.active();
    assertEqual(set.remove(a.id), false);
    var b = set.add();
    var c = set.add();
    set.setActive(b.id);
    assertEqual(set.remove(b.id), true);
    assertEqual(set.activeId, c.id);
    assertEqual(set.remove(c.id), true);
    assertEqual(set.activeId, a.id);
    assertEqual(set.remove('missing'), false);
    assertEqual(set.scenarios.length, 1);
  });

  test('ScenarioSet JSON: a round trip keeps names, the active one and the products', function () {
    var set = D.ScenarioSet.createDefault();
    set.add('Second');
    set.active().portfolio.products[0].name = 'My mortgage';
    var back = D.ScenarioSet.fromJSON(JSON.parse(JSON.stringify(set.toJSON())));
    assertDeepEqual(names(back), ['Set 1', 'Second']);
    assertEqual(back.activeId, set.activeId);
    assertEqual(back.active().portfolio.products[0].name, 'My mortgage');
  });

  test('ScenarioSet.fromJSON: a corrupt scenario is skipped, none valid - an error', function () {
    var json = D.ScenarioSet.createDefault().toJSON();
    json.scenarios.push({ id: 'x', name: 'corrupt', portfolio: { products: 5 } });
    json.scenarios.push({ id: json.scenarios[0].id, name: 'duplicate id', portfolio: json.scenarios[0].portfolio });
    var set = D.ScenarioSet.fromJSON(json);
    assertEqual(set.scenarios.length, 1);
    json.activeId = 'no such id';
    assertEqual(D.ScenarioSet.fromJSON(json).activeId, json.scenarios[0].id);
    var threw = false;
    try { D.ScenarioSet.fromJSON({ scenarios: [{ id: 'x', name: 'y', portfolio: null }] }); } catch (e) { threw = true; }
    assertTrue(threw);
    threw = false;
    try { D.ScenarioSet.fromJSON(null); } catch (e) { threw = true; }
    assertTrue(threw);
  });

  test('ScenarioSet.fromJSON: isValid rejects invalid scenarios', function () {
    var set = D.ScenarioSet.createDefault();
    set.add('Second');
    var kept = D.ScenarioSet.fromJSON(set.toJSON(), function (p) { return p === p && true; });
    assertEqual(kept.scenarios.length, 2);
    var calls = 0;
    var one = D.ScenarioSet.fromJSON(set.toJSON(), function () { calls++; return calls === 1; });
    assertEqual(one.scenarios.length, 1);
    assertEqual(one.activeId, one.scenarios[0].id);
  });

  test('Storage.load: the v1 key migrates into a single scenario, v2 takes priority', function () {
    var store = fakeStore();
    store.setItem('mortgageComparer.v1', JSON.stringify(D.Portfolio.createDefault().toJSON()));
    var storage = MC.ui.Storage.create(function () { return store; });
    var migrated = storage.load();
    assertEqual(migrated.scenarios.length, 1);
    assertEqual(migrated.active().portfolio.products.length, 2);
    var set = D.ScenarioSet.createDefault();
    set.add('Second');
    store.setItem('mortgageComparer.v2', JSON.stringify(set.toJSON()));
    assertEqual(storage.load().scenarios.length, 2);
    store.setItem('mortgageComparer.v2', '{broken json');
    assertEqual(storage.load(), null);
    assertEqual(store.getItem('mortgageComparer.v2.broken'), '{broken json');
    store.setItem('mortgageComparer.v2', JSON.stringify({ scenarios: [] }));
    assertEqual(storage.load(), null);
    assertEqual(store.getItem('mortgageComparer.v2.broken'), '{"scenarios":[]}');
  });

  test('Storage.save: flush writes the latest set; an unavailable store does not throw', function () {
    var store = fakeStore();
    var storage = MC.ui.Storage.create(function () { return store; });
    var set = D.ScenarioSet.createDefault();
    storage.save(set);
    assertEqual(store.getItem('mortgageComparer.v2'), null);
    storage.flush();
    assertEqual(JSON.parse(store.getItem('mortgageComparer.v2')).scenarios.length, 1);
    var broken = MC.ui.Storage.create(function () { throw new Error('no access'); });
    broken.save(set);
    broken.flush();
    assertEqual(broken.load(), null);
  });
})();

(function () {
  'use strict';

  var D = MC.domain;

  test('ScenarioSet export/import: a round trip, a new id, a unique name, the source set intact', function () {
    var set = D.ScenarioSet.createDefault();
    set.active().portfolio.products[0].name = 'Mine';
    var file = JSON.parse(JSON.stringify(set.exportScenario(set.active().id)));
    assertEqual(file.version, 2);
    assertEqual(file.name, 'Set 1');
    var imported = set.importScenario(file);
    assertEqual(set.scenarios.length, 2);
    assertEqual(set.activeId, imported.id);
    assertEqual(imported.name, 'Set 1 (2)');
    assertTrue(imported.id !== set.scenarios[0].id);
    assertEqual(imported.portfolio.products[0].name, 'Mine');
    assertTrue(imported.portfolio !== set.scenarios[0].portfolio);
  });

  test('ScenarioSet.importScenario: a bare portfolio is accepted, corrupt data - an Error with no changes', function () {
    var set = D.ScenarioSet.createDefault();
    var bare = D.Portfolio.createDefault().toJSON();
    assertEqual(set.importScenario(bare).name, 'Set 2');
    var bad = [null, 5, { portfolio: { products: 5 } }, { name: 'x', portfolio: null }];
    bad.forEach(function (obj) {
      var threw = false;
      try { set.importScenario(obj); } catch (e) { threw = true; }
      assertTrue(threw);
    });
    var threw = false;
    try { set.importScenario(bare, function () { return false; }); } catch (e) { threw = true; }
    assertTrue(threw);
    assertEqual(set.scenarios.length, 2);
    assertTrue(!!set.active());
  });
})();

(function () {
  'use strict';

  function placeholders(text) {
    return (text.match(/\{\w+\}/g) || []).sort().join(',');
  }

  // Languages other than the reference (en): any dictionary file added later is covered automatically
  function others() {
    return Object.keys(MC.core.i18n).filter(function (code) { return code !== 'en'; });
  }

  test('i18n: every dictionary has the same keys and {param} placeholders as en', function () {
    var en = MC.core.i18n.en;
    others().forEach(function (code) {
      var dict = MC.core.i18n[code];
      Object.keys(en).forEach(function (key) {
        assertTrue(Object.prototype.hasOwnProperty.call(dict, key), code + ' lacks the key ' + key);
        assertEqual(placeholders(dict[key]), placeholders(en[key]), code + ' placeholders of ' + key);
      });
      Object.keys(dict).forEach(function (key) {
        assertTrue(Object.prototype.hasOwnProperty.call(en, key), 'en lacks the key ' + key + ' of ' + code);
      });
    });
  });

  test('i18n: every language is registered with a tag and a name', function () {
    Object.keys(MC.core.i18n).forEach(function (code) {
      assertTrue(!!MC.core.locales[code], code + ' is not registered');
      assertTrue(typeof MC.core.locales[code].tag === 'string' && !!MC.core.locales[code].name, code + ' meta');
    });
  });

  test('i18n: t, formatMonth and numberLocale follow the chosen language', function () {
    var saved = MC.core.locale;
    try {
      MC.core.locale = 'en';
      assertEqual(MC.core.t('toolbar.reset'), 'Reset');
      assertEqual(MC.core.formatMonth({ year: 2027, month: 3 }), 'Mar 2027');
      assertEqual(MC.core.numberLocale(), 'en-US');
      assertEqual(MC.core.t('no such key'), 'no such key');
      others().forEach(function (code) {
        MC.core.locale = code;
        assertEqual(MC.core.numberLocale(), MC.core.locales[code].tag);
        assertTrue(MC.core.t('toolbar.reset') !== 'Reset', code + ' must translate the key');
        assertTrue(MC.core.formatMonth({ year: 2027, month: 3 }) !== 'Mar 2027', code + ' must localise the month');
      });
    } finally {
      MC.core.locale = saved;
    }
  });
})();
