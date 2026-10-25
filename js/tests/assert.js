// A mini test runner. Globals: test, assertEqual, assertClose, assertTrue, assertDeepEqual.
// Results go to #results (if present) and to the console; the total goes to #summary[data-failed].
(function () {
  'use strict';

  var passed = 0;
  var failed = 0;

  function report(name, error) {
    if (error) { failed++; } else { passed++; }
    if (typeof console !== 'undefined') {
      console.log((error ? 'FAIL ' : 'PASS ') + name + (error ? ' :: ' + error.message : ''));
    }
    var box = document.getElementById('results');
    if (box) {
      var item = document.createElement('div');
      item.className = error ? 'fail' : 'pass';
      item.textContent = (error ? '✗ ' : '✓ ') + name + (error ? ' — ' + error.message : '');
      box.appendChild(item);
    }
    var summary = document.getElementById('summary');
    if (summary) {
      summary.setAttribute('data-failed', String(failed));
      summary.setAttribute('data-passed', String(passed));
      summary.className = failed ? 'fail' : 'pass';
      summary.textContent = 'Passed: ' + passed + ', failed: ' + failed;
    }
  }

  window.test = function (name, fn) {
    try { fn(); report(name, null); } catch (e) { report(name, e); }
  };

  window.assertTrue = function (cond, message) {
    if (!cond) { throw new Error(message || 'expected true'); }
  };

  window.assertEqual = function (actual, expected, message) {
    if (actual !== expected) {
      throw new Error((message ? message + ': ' : '') + 'expected ' + expected + ', got ' + actual);
    }
  };

  window.assertClose = function (actual, expected, eps, message) {
    eps = eps === undefined ? 0.005 : eps;
    if (!(Math.abs(actual - expected) <= eps)) {
      throw new Error((message ? message + ': ' : '') + 'expected ≈' + expected + ', got ' + actual);
    }
  };

  window.assertDeepEqual = function (actual, expected, message) {
    var a = JSON.stringify(actual);
    var b = JSON.stringify(expected);
    if (a !== b) {
      throw new Error((message ? message + ': ' : '') + 'expected ' + b + ', got ' + a);
    }
  };
})();
