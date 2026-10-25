(function () {
  'use strict';

  var D = MC.domain;

  function Portfolio(opts) {
    this.products = (opts.products || []).slice();
    this.links = (opts.links || []).slice();
  }

  function indexOf(portfolio, id) {
    for (var i = 0; i < portfolio.products.length; i++) {
      if (portfolio.products[i].id === id) { return i; }
    }
    return -1;
  }

  Portfolio.prototype.get = function (id) {
    var i = indexOf(this, id);
    return i === -1 ? null : this.products[i];
  };

  Portfolio.prototype.add = function (product) {
    // ASSUMPTION: a duplicate id is an error (otherwise get/links become ambiguous).
    if (this.get(product.id)) { throw new Error('Portfolio.add: id already exists: ' + product.id); }
    this.products.push(product);
    return product;
  };

  // ASSUMPTION: removing a nonexistent id is not an error (does nothing).
  Portfolio.prototype.remove = function (id) {
    var i = indexOf(this, id);
    if (i === -1) { return; }
    this.products.splice(i, 1);
    this.links = this.links.filter(function (l) {
      return l.mortgageId !== id && l.depositId !== id;
    });
  };

  // Shifts a product by delta positions (-1 left, +1 right); never goes past the edges.
  Portfolio.prototype.move = function (id, delta) {
    var i = indexOf(this, id);
    var j = i + delta;
    if (i === -1 || j < 0 || j >= this.products.length) { return; }
    var item = this.products.splice(i, 1)[0];
    this.products.splice(j, 0, item);
  };

  Portfolio.prototype.duplicate = function (id) {
    var i = indexOf(this, id);
    if (i === -1) { throw new Error('Portfolio.duplicate: no product ' + id); }
    var copy = D.ProductRegistry.duplicate(this.products[i]);
    var links = this.linksOf(id);
    this.products.splice(i + 1, 0, copy);
    links.forEach(function (link) {
      this.links.push(new D.DepositLink({
        mortgageId: copy.id,
        depositId: link.depositId,
        useInterest: link.useInterest
      }));
    }, this);
    return copy;
  };

  // Copies a product into another portfolio (new ids, same name), appended to its columns; returns the copy.
  // A classic mortgage brings its deposits (each a separate copy) and recreates the links; a deposit is copied alone.
  Portfolio.prototype.copyTo = function (target, id) {
    var product = this.get(id);
    if (!product) { throw new Error('Portfolio.copyTo: no product ' + id); }
    var copy = D.ProductRegistry.duplicate(product);
    target.add(copy);
    this.linksOf(id).forEach(function (link) {
      var deposit = D.ProductRegistry.duplicate(this.get(link.depositId));
      target.add(deposit);
      target.addLink(copy.id, deposit.id);
      target.setUseInterest(copy.id, deposit.id, link.useInterest);
    }, this);
    return copy;
  };

  Portfolio.prototype.linksOf = function (mortgageId) {
    return this.links.filter(function (l) { return l.mortgageId === mortgageId; });
  };

  Portfolio.prototype.findLink = function (mortgageId, depositId) {
    for (var i = 0; i < this.links.length; i++) {
      if (this.links[i].mortgageId === mortgageId && this.links[i].depositId === depositId) { return this.links[i]; }
    }
    return null;
  };

  function requireClassic(portfolio, mortgageId, who) {
    var mortgage = portfolio.get(mortgageId);
    if (!mortgage || mortgage.kind !== 'classic') {
      throw new Error('Portfolio.' + who + ': a link is only possible for a classic mortgage');
    }
  }

  function requireDeposit(portfolio, depositId, who) {
    var deposit = portfolio.get(depositId);
    if (!deposit || deposit.kind !== 'deposit') {
      throw new Error('Portfolio.' + who + ': no deposit ' + depositId);
    }
  }

  // A (mortgage, deposit) pair is unique; a classic mortgage can have several deposits.
  Portfolio.prototype.addLink = function (mortgageId, depositId) {
    requireClassic(this, mortgageId, 'addLink');
    requireDeposit(this, depositId, 'addLink');
    if (this.findLink(mortgageId, depositId)) { throw new Error('Portfolio.addLink: this link already exists'); }
    var link = new D.DepositLink({ mortgageId: mortgageId, depositId: depositId, useInterest: false });
    this.links.push(link);
    return link;
  };

  // ASSUMPTION: removing a nonexistent link is not an error (does nothing).
  Portfolio.prototype.removeLink = function (mortgageId, depositId) {
    var link = this.findLink(mortgageId, depositId);
    if (!link) { return; }
    this.links = this.links.filter(function (l) { return l !== link; });
  };

  Portfolio.prototype.changeLinkDeposit = function (mortgageId, oldDepositId, newDepositId) {
    var link = this.findLink(mortgageId, oldDepositId);
    if (!link) { throw new Error('Portfolio.changeLinkDeposit: no such link'); }
    requireDeposit(this, newDepositId, 'changeLinkDeposit');
    if (newDepositId !== oldDepositId && this.findLink(mortgageId, newDepositId)) {
      throw new Error('Portfolio.changeLinkDeposit: this link already exists');
    }
    link.depositId = newDepositId;
    return link;
  };

  Portfolio.prototype.setUseInterest = function (mortgageId, depositId, value) {
    var link = this.findLink(mortgageId, depositId);
    if (!link) { throw new Error('Portfolio.setUseInterest: no such link'); }
    link.useInterest = value === true;
  };

  Portfolio.prototype.mortgages = function () {
    return this.products.filter(function (p) { return p.kind !== 'deposit'; });
  };

  Portfolio.prototype.deposits = function () {
    return this.products.filter(function (p) { return p.kind === 'deposit'; });
  };

  Portfolio.prototype.toJSON = function () {
    return {
      products: this.products.map(function (p) { return p.toJSON(); }),
      links: this.links.map(function (l) { return l.toJSON(); })
    };
  };

  // Legacy format: {mortgages:[...]}, the deposit lived inside the classic mortgage.
  function migrateLegacy(obj) {
    if (!Array.isArray(obj.mortgages)) { throw new Error('Portfolio.fromJSON: mortgages must be an array'); }
    var products = [];
    var links = [];
    obj.mortgages.forEach(function (raw) {
      var mortgage = D.ProductRegistry.fromJSON(raw);
      products.push(mortgage);
      if (mortgage.kind !== 'classic' || !raw.deposit) { return; }
      var old = raw.deposit;
      var deposit = D.ProductRegistry.createDefault('deposit');
      deposit.name = mortgage.name + ': ' + MC.core.t('default.depositName');
      deposit.termMonths = mortgage.terms.termMonths;
      // The old rule "deposit month 1 = mortgage month 1": the deposit starts with the mortgage.
      deposit.startDate = { year: mortgage.terms.startDate.year, month: mortgage.terms.startDate.month };
      deposit.plan = D.CashFlowPlan.fromJSON(old.plan);
      deposit.rates = new D.RateSchedule({ entries: [{ fromMonth: 1, annualRate: old.annualRate }] });
      deposit.taxRate = old.taxRate;
      deposit.report = new D.ReportPoint({ month: mortgage.report.month });
      // ASSUMPTION: the new deposit is inserted right after its mortgage.
      products.push(deposit);
      links.push(new D.DepositLink({
        mortgageId: mortgage.id,
        depositId: deposit.id,
        useInterest: raw.useDepositInterest === true
      }));
    });
    return { products: products, links: links };
  }

  Portfolio.fromJSON = function (obj) {
    if (!obj || typeof obj !== 'object') { throw new Error('Portfolio.fromJSON: invalid data'); }
    var parts;
    if (obj.products === undefined && obj.mortgages !== undefined) {
      parts = migrateLegacy(obj);
    } else {
      if (!Array.isArray(obj.products)) { throw new Error('Portfolio.fromJSON: products must be an array'); }
      // ASSUMPTION: a missing links is an empty list; a non-array is an error.
      if (obj.links !== undefined && !Array.isArray(obj.links)) {
        throw new Error('Portfolio.fromJSON: links must be an array');
      }
      parts = {
        products: obj.products.map(function (p) { return D.ProductRegistry.fromJSON(p); }),
        links: (obj.links || []).map(function (l) { return D.DepositLink.fromJSON(l); })
      };
    }

    var portfolio = new Portfolio(parts);
    var seen = {};
    portfolio.products.forEach(function (p) {
      if (Object.prototype.hasOwnProperty.call(seen, p.id)) {
        throw new Error('Portfolio.fromJSON: duplicate id ' + p.id);
      }
      seen[p.id] = true;
    });
    var linked = {};
    portfolio.links.forEach(function (l) {
      var m = portfolio.get(l.mortgageId);
      var d = portfolio.get(l.depositId);
      if (!m || m.kind !== 'classic') { throw new Error('Portfolio.fromJSON: link to an unsuitable mortgage ' + l.mortgageId); }
      if (!d || d.kind !== 'deposit') { throw new Error('Portfolio.fromJSON: link to an unsuitable deposit ' + l.depositId); }
      var key = JSON.stringify([l.mortgageId, l.depositId]);
      if (Object.prototype.hasOwnProperty.call(linked, key)) {
        throw new Error('Portfolio.fromJSON: duplicate link ' + l.mortgageId + ' / ' + l.depositId);
      }
      linked[key] = true;
    });
    // A deposit without startDate in the save (pre-date format) gets its linked mortgage's date;
    // an unlinked one keeps the current month (Deposit.fromJSON). The legacy format sets the date during migration.
    // ASSUMPTION: if a deposit is linked to several mortgages, the date of the first link is used.
    if (obj.products !== undefined) {
      obj.products.forEach(function (raw, i) {
        var dep = portfolio.products[i];
        if (dep.kind !== 'deposit' || (raw.startDate && typeof raw.startDate === 'object')) { return; }
        for (var k = 0; k < portfolio.links.length; k++) {
          if (portfolio.links[k].depositId === dep.id) {
            var s = portfolio.get(portfolio.links[k].mortgageId).terms.startDate;
            dep.startDate = { year: s.year, month: s.month };
            return;
          }
        }
      });
    }
    return portfolio;
  };

  Portfolio.createDefault = function () {
    return new Portfolio({
      products: [D.ProductRegistry.createDefault('classic'), D.ProductRegistry.createDefault('offset')],
      links: []
    });
  };

  D.Portfolio = Portfolio;
})();
