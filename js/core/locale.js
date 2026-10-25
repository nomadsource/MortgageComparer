(function () {
  'use strict';

  var KEY = 'mortgageComparer.lang';

  function known(code) {
    return typeof code === 'string' && Object.prototype.hasOwnProperty.call(MC.core.locales, code);
  }

  function stored() {
    try {
      var code = window.localStorage.getItem(KEY);
      return known(code) ? code : null;
    } catch (e) {
      return null;
    }
  }

  // The first browser language we have a dictionary for ("pt-BR" matches "pt")
  function fromBrowser() {
    var wanted = window.navigator.languages || [window.navigator.language];
    for (var i = 0; i < wanted.length; i++) {
      var code = String(wanted[i]).toLowerCase().split('-')[0];
      if (known(code)) return code;
    }
    return null;
  }

  function store(code) {
    try { window.localStorage.setItem(KEY, code); } catch (e) { /* storage unavailable: the choice is not remembered */ }
  }

  // The chosen language lives in localStorage and is applied once, before the UI modules load
  // (they read the number format at load time); changing it reloads the page. Not loaded by tests.html.
  MC.core.locale = stored() || fromBrowser() || MC.core.locale;
  document.documentElement.lang = MC.core.locale;
  MC.core.storeLocale = store;
})();
