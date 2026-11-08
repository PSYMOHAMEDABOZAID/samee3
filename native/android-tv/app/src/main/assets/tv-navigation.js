/* SAMEE3 TV: remote-control focus enhancement, injected only into the trusted origin. */
(function () {
  'use strict';
  if (window.__samee3TvNavigationInstalled) return;
  window.__samee3TvNavigationInstalled = true;

  var STYLE_ID = 'samee3-tv-navigation-style';
  if (!document.getElementById(STYLE_ID)) {
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      ':focus-visible { outline: 3px solid #b7892d !important; outline-offset: 4px !important; }',
      'a:focus,button:focus,[role="button"]:focus,input:focus,select:focus,textarea:focus {',
      '  box-shadow: 0 0 0 4px rgba(247,217,146,.85) !important;',
      '  border-radius: 10px; }',
      'html { scroll-behavior: auto !important; }'
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
  }
  var selector = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled])',
    'select:not([disabled])', 'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])', '[role="button"]'
  ].join(',');
  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    if (el.closest('[inert],[aria-hidden="true"]')) return false;
    var style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    var rect = el.getBoundingClientRect();
    return rect.width >= 3 && rect.height >= 3;
  }
  function candidates() {
    return Array.prototype.filter.call(document.querySelectorAll(selector), visible);
  }
  function focus(el) {
    if (!el) return false;
    try {
      el.focus({preventScroll: true});
    } catch (_) {
      el.focus();
    }
    if (el.scrollIntoView) {
      try { el.scrollIntoView({block: 'nearest', inline: 'nearest'}); }
      catch (_) { el.scrollIntoView(false); }
    }
    return true;
  }
  function center(rect) { return {x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2}; }
  function move(dir) {
    var items = candidates();
    if (!items.length) return false;
    var current = document.activeElement;
    if (items.indexOf(current) < 0) return focus(items[0]);
    // Inputs and native video controls should continue to receive their native arrow actions.
    if (current.tagName === 'INPUT' && /^(range|number|text|search)$/i.test(current.type)) return false;
    if (current.tagName === 'TEXTAREA' || current.tagName === 'SELECT' || current.tagName === 'VIDEO') return false;
    var a = center(current.getBoundingClientRect());
    var choice = null, best = Infinity;
    items.forEach(function (item) {
      if (item === current) return;
      var b = center(item.getBoundingClientRect());
      var dx = b.x - a.x, dy = b.y - a.y;
      var forward = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy;
      if (forward <= 3) return;
      var cross = (dir === 'left' || dir === 'right') ? Math.abs(dy) : Math.abs(dx);
      var score = forward + cross * 3;
      if (score < best) { best = score; choice = item; }
    });
    if (choice) return focus(choice);
    // When there is no next item, scroll in that direction for content-heavy pages.
    var x = dir === 'right' ? 200 : dir === 'left' ? -200 : 0;
    var y = dir === 'down' ? 220 : dir === 'up' ? -220 : 0;
    window.scrollBy(x, y);
    return true;
  }
  function activate() {
    var target = document.activeElement;
    if (!target || !visible(target)) return focus(candidates()[0]);
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
      target.focus();
      return false;
    }
    target.click();
    return true;
  }
  window.Samee3TVNav = { move: move, activate: activate };
})();
