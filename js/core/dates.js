(function () {
  'use strict';

  // startDate: {year, month}, month = 1..12. Returns a new {year, month}.
  function addMonths(startDate, n) {
    var index = startDate.year * 12 + (startDate.month - 1) + n;
    return { year: Math.floor(index / 12), month: (index % 12 + 12) % 12 + 1 };
  }

  // {year: 2027, month: 3} -> "Mar 2027" (the month abbreviation is localised)
  function formatMonth(date) {
    return MC.core.t('monthShort.' + date.month) + ' ' + date.year;
  }

  MC.core.addMonths = addMonths;
  MC.core.formatMonth = formatMonth;
})();
