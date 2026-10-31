/* =========================================================================
   Dark mode — theme toggle
   - reads localStorage["portfolio.theme"] and stamps
     <html data-theme-mode="dark|light"> while still in <head>, so the
     first paint already has the right theme (no flash)
   - wires the header button (markup injected by the shared bundle)
   - keeps the button's aria state in sync when the header is (re)built
   ========================================================================= */
(function () {
  var KEY = 'portfolio.theme';
  var root = document.documentElement;

  function read() {
    try {
      return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
    } catch (e) {
      return 'light';
    }
  }

  function store(value) {
    try {
      localStorage.setItem(KEY, value);
    } catch (e) {
      /* private mode — theme just won't persist */
    }
  }

  function isDark() {
    return root.getAttribute('data-theme-mode') === 'dark';
  }

  function label(dark) {
    return dark ? 'Switch to light mode' : 'Switch to dark mode';
  }

  function syncButtons() {
    var dark = isDark();
    var buttons = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', dark ? 'true' : 'false');
      buttons[i].setAttribute('aria-label', label(dark));
      buttons[i].setAttribute('title', label(dark));
    }
  }

  /* runs in <head>, before <body> renders */
  root.setAttribute('data-theme-mode', read());

  /* toggle — delegated, so it works no matter when the header is built */
  document.addEventListener('click', function (event) {
    var node = event.target;
    if (!node || !node.closest) return;
    var button = node.closest('[data-theme-toggle]');
    if (!button) return;
    var next = isDark() ? 'light' : 'dark';
    root.setAttribute('data-theme-mode', next);
    store(next);
    syncButtons();
  });

  /* the header markup is injected by the shared bundle — watch it */
  function watchHeader() {
    var header = document.querySelector('.site-header');
    if (!header || header.dataset.themeWatched) return;
    header.dataset.themeWatched = 'true';
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(syncButtons).observe(header, { childList: true });
    }
    syncButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchHeader);
  } else {
    watchHeader();
  }

  /* the bundle is a deferred module and may inject the header a tick late —
     poll briefly so the aria state lands even then */
  var tries = 0;
  (function loop() {
    watchHeader();
    tries += 1;
    if (tries < 60 && document.readyState !== 'complete') {
      requestAnimationFrame(loop);
    } else {
      watchHeader();
    }
  })();
})();
