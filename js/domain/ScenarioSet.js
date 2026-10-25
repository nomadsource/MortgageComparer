(function () {
  'use strict';

  var D = MC.domain;
  var counter = 0;

  function newId() {
    counter += 1;
    return 's' + counter + '-' + Math.random().toString(36).slice(2, 8);
  }

  // A set of scenarios: each has its own name and its own Portfolio; one is active (the one the app shows).
  // Invariant: at least one scenario, and activeId always points to an existing one.
  function ScenarioSet(opts) {
    this.scenarios = (opts.scenarios || []).slice();
    if (!this.scenarios.length) { throw new Error('ScenarioSet: at least one scenario is required'); }
    this.activeId = this.get(opts.activeId) ? opts.activeId : this.scenarios[0].id;
  }

  function indexOf(set, id) {
    for (var i = 0; i < set.scenarios.length; i++) {
      if (set.scenarios[i].id === id) { return i; }
    }
    return -1;
  }

  ScenarioSet.prototype.get = function (id) {
    var i = indexOf(this, id);
    return i === -1 ? null : this.scenarios[i];
  };

  ScenarioSet.prototype.active = function () {
    return this.get(this.activeId);
  };

  // ASSUMPTION: switching to a nonexistent id is not an error (does nothing).
  ScenarioSet.prototype.setActive = function (id) {
    if (this.get(id)) { this.activeId = id; }
  };

  // A name not yet used by any scenario: base, then "base (2)", "base (3)"...
  ScenarioSet.prototype.uniqueName = function (base) {
    var names = Object.create(null);
    this.scenarios.forEach(function (s) { names[s.name] = true; });
    var name = base;
    for (var n = 2; names[name]; n++) { name = base + ' (' + n + ')'; }
    return name;
  };

  // The first free default name "Set N" (after deletions the scenario count and the numbers diverge)
  ScenarioSet.prototype.defaultName = function () {
    var taken = Object.create(null);
    this.scenarios.forEach(function (s) { taken[s.name] = true; });
    var n = 1;
    while (taken[MC.core.t('scenario.defaultName', { n: n })]) { n++; }
    return MC.core.t('scenario.defaultName', { n: n });
  };

  // Appends a scenario and makes it active. No portfolio: one classic mortgage; no name: the default "Set N".
  ScenarioSet.prototype.add = function (name, portfolio) {
    var scenario = {
      id: newId(),
      name: this.uniqueName(name || this.defaultName()),
      portfolio: portfolio || new D.Portfolio({ products: [D.ProductRegistry.createDefault('classic')] })
    };
    this.scenarios.push(scenario);
    this.activeId = scenario.id;
    return scenario;
  };

  // The copy goes right after the original and becomes active; the portfolio is copied through JSON (independent objects).
  ScenarioSet.prototype.duplicate = function (id) {
    var i = indexOf(this, id);
    if (i === -1) { throw new Error('ScenarioSet.duplicate: no scenario ' + id); }
    var source = this.scenarios[i];
    var copy = {
      id: newId(),
      name: this.uniqueName(source.name + MC.core.t('name.copySuffix')),
      portfolio: D.Portfolio.fromJSON(JSON.parse(JSON.stringify(source.portfolio.toJSON())))
    };
    this.scenarios.splice(i + 1, 0, copy);
    this.activeId = copy.id;
    return copy;
  };

  // ASSUMPTION: an empty name is rejected (the old one stays); duplicate names are allowed on manual rename.
  ScenarioSet.prototype.rename = function (id, name) {
    var scenario = this.get(id);
    var trimmed = String(name).trim();
    if (scenario && trimmed) { scenario.name = trimmed; }
  };

  // The last scenario is never removed; removing the active one activates a neighbour (the next, else the previous).
  ScenarioSet.prototype.remove = function (id) {
    var i = indexOf(this, id);
    if (i === -1 || this.scenarios.length === 1) { return false; }
    this.scenarios.splice(i, 1);
    if (this.activeId === id) { this.activeId = this.scenarios[Math.min(i, this.scenarios.length - 1)].id; }
    return true;
  };

  ScenarioSet.prototype.toJSON = function () {
    return {
      version: 2,
      activeId: this.activeId,
      scenarios: this.scenarios.map(function (s) {
        return { id: s.id, name: s.name, portfolio: s.portfolio.toJSON() };
      })
    };
  };

  // Exchange file of one scenario: { version: 2, name, portfolio }.
  ScenarioSet.prototype.exportScenario = function (id) {
    var scenario = this.get(id);
    if (!scenario) { throw new Error('ScenarioSet.exportScenario: no scenario ' + id); }
    return { version: 2, name: scenario.name, portfolio: scenario.portfolio.toJSON() };
  };

  // Imports an exchange file: a new scenario (new id, unique name) that becomes active; existing ones are untouched.
  // A bare portfolio (no wrapper) is accepted too, given the default name. Corrupt data throws and leaves the set unchanged.
  ScenarioSet.prototype.importScenario = function (obj, isValid) {
    if (!obj || typeof obj !== 'object') { throw new Error('ScenarioSet.importScenario: invalid data'); }
    var wrapped = obj.portfolio !== undefined;
    var portfolio = D.Portfolio.fromJSON(wrapped ? obj.portfolio : obj);
    if (isValid && !isValid(portfolio)) { throw new Error('ScenarioSet.importScenario: invalid values'); }
    var name = wrapped && typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : undefined;
    return this.add(name, portfolio);
  };

  // isValid(portfolio) is an optional per-scenario check; corrupt scenarios are skipped, the rest load.
  // Throws if none is valid.
  ScenarioSet.fromJSON = function (obj, isValid) {
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.scenarios)) {
      throw new Error('ScenarioSet.fromJSON: invalid data');
    }
    var scenarios = [];
    var seen = Object.create(null);
    obj.scenarios.forEach(function (raw) {
      try {
        if (!raw || typeof raw.id !== 'string' || typeof raw.name !== 'string' || seen[raw.id]) { return; }
        var portfolio = D.Portfolio.fromJSON(raw.portfolio);
        if (isValid && !isValid(portfolio)) { return; }
        seen[raw.id] = true;
        scenarios.push({ id: raw.id, name: raw.name, portfolio: portfolio });
      } catch (e) {
        // skip a corrupt scenario
      }
    });
    if (!scenarios.length) { throw new Error('ScenarioSet.fromJSON: no valid scenarios'); }
    return new ScenarioSet({ scenarios: scenarios, activeId: obj.activeId });
  };

  ScenarioSet.fromPortfolio = function (portfolio) {
    return new ScenarioSet({ scenarios: [{ id: newId(), name: MC.core.t('scenario.defaultName', { n: 1 }), portfolio: portfolio }] });
  };

  ScenarioSet.createDefault = function () {
    return ScenarioSet.fromPortfolio(D.Portfolio.createDefault());
  };

  D.ScenarioSet = ScenarioSet;
})();
