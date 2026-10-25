(function () {
  'use strict';

  MC.core.i18n = {};
  MC.core.locales = {};
  // The fallback language: used when nothing else is chosen (and by tests, which never load core/locale.js)
  MC.core.locale = 'en';

  // A dictionary file registers its language: meta is { tag (number-format BCP 47 tag), name (the language's own name,
  // shown in the switcher) } and dict is { key: text }.
  MC.core.registerLocale = function (code, meta, dict) {
    MC.core.locales[code] = meta;
    MC.core.i18n[code] = dict;
  };

  // Simple dictionary with {param} substitution. An unknown key is returned as is.
  function t(key, params) {
    var dict = MC.core.i18n[MC.core.locale] || {};
    var text = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key;
    if (params) {
      text = text.replace(/\{(\w+)\}/g, function (match, name) {
        return Object.prototype.hasOwnProperty.call(params, name) ? params[name] : match;
      });
    }
    return text;
  }

  // The BCP 47 tag used for number formatting in the current language
  MC.core.numberLocale = function () {
    return MC.core.locales[MC.core.locale].tag;
  };

  MC.core.t = t;
})();
