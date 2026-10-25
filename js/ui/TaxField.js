(function () {
  'use strict';

  var dom = MC.ui.dom;
  var t = MC.core.t;
  var el = dom.el;

  // A compact "Tax, %" field (0-100) with an (i) tooltip; a reusable widget, not tied to the table.
  // options: {
  //   read,      // function () -> the current number (from the domain object)
  //   write,     // function (v) -> writes a valid number to the domain object
  //   onChange   // function () -> reports a change
  // }
  // Returns { el }.
  function create(options) {
    var spec = { min: 0, max: 100 };
    var input = dom.numberInput(spec, options.read, function (v) {
      options.write(v);
      options.onChange();
    });
    var hintText = t('hint.depositTax');
    var root = el('label', { className: 'tax-field' }, [
      el('span', { className: 'tax-label', text: t('field.tax') }),
      el('span', { className: 'info', text: 'ⓘ', title: hintText, tabIndex: 0, role: 'img', 'aria-label': hintText }),
      input
    ]);
    return { el: root };
  }

  MC.ui.TaxField = { create: create };
})();
