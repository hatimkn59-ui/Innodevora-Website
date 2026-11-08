/* =========================================================================
   Visionwork banner — state + behaviour

   Vanilla ES2020, matching the rest of the project (no build step, no
   dependencies). All project content lives in the PROJECTS array below;
   `render()` is the single function that pushes state into the DOM, so the
   tabs are a projection of state rather than a parallel source of truth.

   Loaded only by the homepage, where the banner lives inside the existing
   `.manifesto` section. Every id is `vw-`-prefixed and every element lookup
   is guarded, so nothing here can touch the rest of the page.
   ========================================================================= */

/* ── marks ──────────────────────────────────────────────────────────────── */
/* One distinct mark per project, reused at brand size in the preview's nav and
   at icon size in the tab strip so each identity stays consistent. */
const MARKS = {
  innosol:
    '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="4" fill="none" stroke="currentColor" stroke-width="1.7"/>' +
    '<circle cx="12" cy="12" r="3" fill="currentColor"/>' +
    '<path d="M8 3.5v2M12 3.5v2M16 3.5v2M8 18.5v2M12 18.5v2M16 18.5v2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  innotvweb:
    '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/>' +
    '<path d="M10 9.2l5 2.8-5 2.8z" fill="currentColor"/>' +
    '<path d="M8 21h8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  innohotel:
    '<svg viewBox="0 0 24 24"><path d="M4 20V8.5L12 4l8 4.5V20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>' +
    '<path d="M8 20v-5h8v5M8 10h.01M12 10h.01M16 10h.01" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  space:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".5"/>' +
    '<circle cx="12" cy="12" r="3.2" fill="currentColor"/>' +
    '<path d="M12 1.8v3.4M12 18.8v3.4M1.8 12h3.4M18.8 12h3.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  carweb:
    '<svg viewBox="0 0 24 24"><path d="M4 14l1.6-5h12.8L20 14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>' +
    '<path d="M3 14h18v4H3z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>' +
    '<circle cx="7" cy="18" r="1.7" fill="currentColor"/><circle cx="17" cy="18" r="1.7" fill="currentColor"/></svg>'
};

/* ── projects ───────────────────────────────────────────────────────────── */
/* Innodevora's live sites. Order matches the tab strip; InnoSol is the
   initial active tab. Every image is an actual 1600x900 screenshot of the
   live page, captured locally and stored under assets/images/work/. The
   address bar and every preview CTA point at the project's real URL. */
const PROJECTS = [
  {
    id: 'innosol',
    name: 'InnoSol',
    tabLabel: 'InnoSol',
    url: 'https://innosol.netlify.app/',
    displayUrl: 'innosol.netlify.app',
    logo: 'InnoSol',
    navLinks: ['The idea', 'Design', 'Finishes', 'Specifications'],
    ctaNav: 'Choose your finish',

    eyebrow: 'Product Website',
    headline: 'Sound that holds the room.',
    lede: 'A product launch site for the InnoSol HALO S1 portable spatial speaker.',
    ctaLabel: 'Open InnoSol',
    trustText: 'Live website',

    image: '/assets/images/work/innosol.webp',
    alt: "Screenshot of InnoSol's HALO S1 product homepage",
    imgPos: '50% 50%',

    accent: '#f9f6ef',
    accentSoft: 'rgba(249, 246, 239, .86)',
    headlineFont: "Satoshi-Variable, Arial, sans-serif",
    headlineWeight: '800',
    headlineTracking: '-.03em',
    eyebrowTransform: 'uppercase',
    eyebrowTracking: '.2em',
    ledeWeight: '400',
    pillBg: '#f9f6ef',
    pillFg: '#101010',
    scrim: 'none'
  },
  {
    id: 'innotvweb',
    name: 'InnoTVweb',
    tabLabel: 'InnoTVweb',
    url: 'https://innotvweb.netlify.app/',
    displayUrl: 'innotvweb.netlify.app',
    logo: 'InnoTVweb',
    navLinks: ['Films', 'Television', 'Index'],
    ctaNav: 'Browse films',

    eyebrow: 'Film Library',
    headline: 'Discover the InnoTVweb library of Films',
    lede: 'A cinematic film catalogue built around an interactive disc gallery.',
    ctaLabel: 'Open InnoTVweb',
    trustText: 'Live website',

    image: '/assets/images/work/innotvweb.webp',
    alt: "Screenshot of InnoTVweb's film library homepage",
    imgPos: '50% 50%',

    accent: '#111111',
    accentSoft: 'rgba(17, 17, 17, .82)',
    headlineFont: "Satoshi-Variable, Arial, sans-serif",
    headlineWeight: '600',
    headlineTracking: '-.02em',
    eyebrowTransform: 'uppercase',
    eyebrowTracking: '.2em',
    ledeWeight: '400',
    pillBg: '#111111',
    pillFg: '#ffffff',
    scrim: 'none'
  },
  {
    id: 'innohotel',
    name: 'InnoHotel',
    tabLabel: 'InnoHotel',
    url: 'https://innohotel.netlify.app/',
    displayUrl: 'innohotel.netlify.app',
    logo: 'InnoHotel',
    navLinks: ['Stay', 'Dine', 'Experiences', 'Journal', 'Weddings'],
    ctaNav: 'Book now',

    eyebrow: 'Hospitality',
    headline: 'La dolce vita',
    lede: 'A boutique luxury hotel website with rooms, dining, experiences and direct reservations.',
    ctaLabel: 'Open InnoHotel',
    trustText: 'Live website',

    image: '/assets/images/work/innohotel.webp',
    alt: "Screenshot of InnoHotel's boutique hotel homepage",
    imgPos: '50% 50%',

    accent: '#e8d9b8',
    accentSoft: 'rgba(232, 217, 184, .9)',
    headlineFont: "CabinetGrotesk-Variable, Arial, sans-serif",
    headlineWeight: '450',
    headlineTracking: '-.01em',
    eyebrowTransform: 'uppercase',
    eyebrowTracking: '.2em',
    ledeWeight: '400',
    pillBg: '#e8d9b8',
    pillFg: '#1f1a14',
    scrim: 'none'
  },
  {
    id: 'space',
    name: 'Space',
    tabLabel: 'Space',
    url: 'https://spaceinnodevora.netlify.app/',
    displayUrl: 'spaceinnodevora.netlify.app',
    logo: 'Space',
    navLinks: ['Space Service', 'Satellites', 'Contact'],
    ctaNav: 'Design your mission',

    eyebrow: 'Space Technology',
    headline: 'Space missions made simple',
    lede: 'A satellite mission design, launch and operations website for Innodevora Space.',
    ctaLabel: 'Open Space',
    trustText: 'Live website',

    image: '/assets/images/work/space.webp',
    alt: "Screenshot of Innodevora Space's satellite mission homepage",
    imgPos: '50% 50%',

    accent: '#2ea3ff',
    accentSoft: 'rgba(46, 163, 255, .85)',
    headlineFont: "Satoshi-Variable, Arial, sans-serif",
    headlineWeight: '700',
    headlineTracking: '-.025em',
    eyebrowTransform: 'uppercase',
    eyebrowTracking: '.2em',
    ledeWeight: '400',
    pillBg: '#2ea3ff',
    pillFg: '#03101f',
    scrim: 'none'
  },
  {
    id: 'carweb',
    name: 'CarWeb',
    tabLabel: 'CarWeb',
    url: 'https://carwebinnodevora.netlify.app/',
    displayUrl: 'carwebinnodevora.netlify.app',
    logo: 'CarWeb',
    navLinks: ['Home', 'Projects', 'Services', 'About', 'Contact'],
    ctaNav: 'Start driving',

    eyebrow: 'Web Studio',
    headline: 'Websites and web apps, made in New York.',
    lede: 'An interactive studio website with a driveable 3D world and project gallery.',
    ctaLabel: 'Open CarWeb',
    trustText: 'Live website',

    image: '/assets/images/work/carweb.webp',
    alt: 'Screenshot of the CarWeb interactive studio homepage',
    imgPos: '50% 50%',

    accent: '#2563eb',
    accentSoft: 'rgba(37, 99, 235, .85)',
    headlineFont: "Satoshi-Variable, Arial, sans-serif",
    headlineWeight: '700',
    headlineTracking: '-.025em',
    eyebrowTransform: 'uppercase',
    eyebrowTracking: '.2em',
    ledeWeight: '400',
    pillBg: '#2563eb',
    pillFg: '#ffffff',
    scrim: 'none'
  }
];

const INITIAL_ID = 'innosol';

/* ── dom ────────────────────────────────────────────────────────────────── */
const el = {
  browser:   document.querySelector('.vw-browser'),
  tabs:      document.getElementById('vw-tabs'),
  panel:     document.getElementById('vw-panel'),
  site:      document.getElementById('vw-site'),
  url:       document.getElementById('vw-url'),
  brand:     document.getElementById('vw-brand'),
  brandMark: document.getElementById('vw-brand-mark'),
  brandName: document.getElementById('vw-brand-name'),
  links:     document.getElementById('vw-links'),
  navCta:    document.getElementById('vw-cta'),
  eyebrow:   document.getElementById('vw-eyebrow'),
  headline:  document.getElementById('vw-headline'),
  lede:      document.getElementById('vw-lede'),
  pill:      document.getElementById('vw-pill'),
  pillLabel: document.getElementById('vw-pill-label'),
  trust:     document.getElementById('vw-trust-text'),
  imgs:      [document.getElementById('vw-img-a'), document.getElementById('vw-img-b')],
  status:    document.getElementById('vw-status'),
  back:      document.getElementById('vw-back'),
  fwd:       document.getElementById('vw-fwd'),
  reload:    document.getElementById('vw-reload'),
  share:     document.getElementById('vw-share')
};

const byId = (id) => PROJECTS.find((p) => p.id === id);
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* The banner markup lives inside the homepage's `.manifesto`; if it is ever
   absent (another page, a trimmed build) simply do nothing rather than throw. */
const READY = el.tabs && el.panel && el.site && el.imgs[0] && el.imgs[1];

/* ── state ──────────────────────────────────────────────────────────────── */
/* One state object. `render()` derives the DOM from it, which is what keeps
   the selected tab, the address bar and the preview always in agreement. */
const state = {
  activeId: INITIAL_ID,
  history: [INITIAL_ID],
  cursor: 0
};

let shownImg = 0;      // which of the two <img> layers is currently visible
let swapTimer = null;  // pending crossfade hand-off

/* ── tab strip ──────────────────────────────────────────────────────────── */
function buildTabs() {
  el.tabs.innerHTML = '';
  PROJECTS.forEach((p) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vw-tab';
    btn.id = 'vw-tab-' + p.id;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-controls', 'vw-panel');
    btn.setAttribute('aria-selected', 'false');
    btn.tabIndex = -1;
    btn.dataset.id = p.id;

    const icon = document.createElement('span');
    icon.className = 'vw-tab__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = MARKS[p.id];

    const label = document.createElement('span');
    label.textContent = p.tabLabel;

    /* The selected tab is also the live-site link: clicking an inactive tab
       switches the preview, clicking the already-selected one opens the
       project's real site. The small arrow only appears on the active tab. */
    const open = document.createElement('span');
    open.className = 'vw-tab__open';
    open.setAttribute('aria-hidden', 'true');
    open.innerHTML =
      '<svg viewBox="0 0 24 24"><path d="M8 16 16 8M9 8h7v7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    btn.append(icon, label, open);
    btn.addEventListener('click', () => {
      if (p.id === state.activeId) openProject(p);
      else select(p.id);
    });
    el.tabs.appendChild(btn);
  });
}

/* roving tabindex + arrow-key navigation, per the ARIA tabs pattern */
function syncTabs() {
  const tabs = Array.from(el.tabs.querySelectorAll('.vw-tab'));
  tabs.forEach((t) => {
    const on = t.dataset.id === state.activeId;
    const p = byId(t.dataset.id);
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    if (p) t.title = on ? 'Open ' + p.name + ' website in a new tab' : 'Preview ' + p.name;
  });
  const active = tabs.find((t) => t.dataset.id === state.activeId);
  if (active) {
    el.panel.setAttribute('aria-labelledby', active.id);
    /* Keep the selected tab in view *inside the strip*. `scrollIntoView` is
       deliberately avoided: it scrolls every ancestor, so once the strip
       starts changing on a timer it could drag the page itself whenever the
       banner is only partly on screen. Only the strip's own scroll moves. */
    if (el.tabs.scrollWidth > el.tabs.clientWidth) {
      const left = active.offsetLeft;
      const right = left + active.offsetWidth;
      const view = el.tabs.scrollLeft;
      if (left < view) el.tabs.scrollLeft = Math.max(0, left - 12);
      else if (right > view + el.tabs.clientWidth) {
        el.tabs.scrollLeft = right - el.tabs.clientWidth + 12;
      }
    }
  }
}

function onTabKeydown(e) {
  const ids = PROJECTS.map((p) => p.id);
  let i = ids.indexOf(state.activeId);
  let next = null;

  switch (e.key) {
    case 'ArrowRight': next = ids[(i + 1) % ids.length]; break;
    case 'ArrowLeft':  next = ids[(i - 1 + ids.length) % ids.length]; break;
    case 'Home':       next = ids[0]; break;
    case 'End':        next = ids[ids.length - 1]; break;
    default: return;                     // let Tab / everything else through
  }

  e.preventDefault();
  select(next);
  const t = el.tabs.querySelector('#vw-tab-' + next);
  if (t) t.focus();
}

/* ── hero imagery ───────────────────────────────────────────────────────── */
function setHeroImage(p) {
  const nextIdx = shownImg === 0 ? 1 : 0;
  const incoming = el.imgs[nextIdx];
  const outgoing = el.imgs[shownImg];

  incoming.src = p.image;
  incoming.alt = p.alt;
  incoming.style.objectPosition = p.imgPos;
  incoming.classList.add('is-shown');
  outgoing.classList.remove('is-shown');
  outgoing.alt = '';                 // keep a single accessible description

  shownImg = nextIdx;

  /* if the file 404s the fallback gradient underneath is already painted */
  incoming.onerror = () => { incoming.style.visibility = 'hidden'; };
  incoming.onload  = () => { incoming.style.visibility = 'visible'; };
}

/* warm the cache so the first tab change never flashes an empty frame */
function preloadImages() {
  PROJECTS.forEach((p) => { const i = new Image(); i.src = p.image; });
}

/* ── render ─────────────────────────────────────────────────────────────── */
function paint(p) {
  /* visual identity → CSS custom properties */
  const s = el.site.style;
  s.setProperty('--accent', p.accent);
  s.setProperty('--accent-soft', p.accentSoft);
  s.setProperty('--headline-font', p.headlineFont);
  s.setProperty('--headline-weight', p.headlineWeight);
  s.setProperty('--headline-tracking', p.headlineTracking);
  s.setProperty('--eyebrow-transform', p.eyebrowTransform);
  s.setProperty('--eyebrow-tracking', p.eyebrowTracking);
  s.setProperty('--lede-weight', p.ledeWeight);
  s.setProperty('--pill-bg', p.pillBg);
  s.setProperty('--pill-fg', p.pillFg);
  s.setProperty('--scrim', p.scrim);
  el.site.dataset.project = p.id;
  el.site.title = 'Open ' + p.name + ' website in a new tab';

  el.url.textContent = p.displayUrl;
  el.url.href = p.url;
  el.url.setAttribute('aria-label', 'Open ' + p.name + ' website in a new tab');

  el.brand.href = p.url;
  el.brand.target = '_blank';
  el.brand.rel = 'noopener';
  el.brandMark.innerHTML = MARKS[p.id];
  el.brandName.textContent = p.logo;
  el.brand.setAttribute('aria-label', p.name + ' website (opens in a new tab)');

  el.links.innerHTML = '';
  el.links.setAttribute('aria-label', p.name + ' navigation');
  p.navLinks.forEach((label) => {
    const a = document.createElement('a');
    a.href = p.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = label;
    el.links.appendChild(a);
  });
  el.navCta.textContent = p.ctaNav;
  el.navCta.href = p.url;
  el.navCta.target = '_blank';
  el.navCta.rel = 'noopener';
  el.navCta.setAttribute('aria-label', p.ctaNav + ' — ' + p.name + ' (opens in a new tab)');

  el.eyebrow.textContent = p.eyebrow;
  el.headline.textContent = p.headline;
  el.lede.textContent = p.lede;
  el.pillLabel.textContent = p.ctaLabel;
  el.pill.href = p.url;
  el.pill.target = '_blank';
  el.pill.rel = 'noopener';
  el.pill.setAttribute('aria-label', p.ctaLabel + ' — ' + p.name + ' (opens in a new tab)');
  el.trust.textContent = p.trustText;

  setHeroImage(p);
}

function syncHistoryButtons() {
  el.back.disabled = state.cursor <= 0;
  el.fwd.disabled = state.cursor >= state.history.length - 1;
}

/* The one entry point. Everything visible derives from `state`. */
function render(opts) {
  const p = byId(state.activeId);
  syncTabs();
  syncHistoryButtons();
  el.status.textContent = 'Now previewing ' + p.name + ' at ' + p.url;

  if (reduced()) { paint(p); return; }

  /* The auto-rotation swaps with a cut instead. The hero keeps the main
     thread busy, so the crossfade below stretches far past its nominal
     length and the panel ends up dark for a large slice of every second —
     measured at ~40% of captured frames fully black. A real browser swaps
     tabs with a cut anyway. */
  if (opts && opts.auto) { paint(p); return; }

  /* fade the outgoing site out, swap content at the trough, fade back in.
     `is-out` MUST be dropped in the same task that applies `is-in`, otherwise
     it lingers and the panel never comes back from opacity:0. */
  clearTimeout(swapTimer);
  el.site.classList.add('is-out');
  swapTimer = setTimeout(() => {
    paint(p);
    el.site.classList.remove('is-out');
    el.site.classList.add('is-in');           // hold at 0 for one frame
    requestAnimationFrame(() => {
      requestAnimationFrame(() => el.site.classList.remove('is-in'));
    });
  }, 170);
}

function select(id, opts) {
  if (!byId(id) || id === state.activeId) return;

  state.activeId = id;

  /* Only a real visitor choice writes history: a fresh selection truncates
     any forward entries, like a real browser. Auto-rotation and the Back /
     Forward buttons pass `fromAuto` / `fromHistory` and leave it untouched, so
     history stays a record of what the visitor picked. */
  if (!opts || (!opts.fromHistory && !opts.fromAuto)) {
    state.history = state.history.slice(0, state.cursor + 1);
    state.history.push(id);
    state.cursor = state.history.length - 1;
  }

  render({ auto: !!(opts && opts.fromAuto) });
}

/* ── auto-rotation ──────────────────────────────────────────────────────── */
/* The strip advances on its own every second so all five projects get seen
   without any interaction. It yields the moment someone is actually using the
   window — pointer over it, keyboard focus inside it, the page tab hidden, or
   the banner scrolled mostly out of view — and it never runs under
   `prefers-reduced-motion`. */
const AUTO_MS = 1000;
let autoTimer = null;
let autoEngaged = false;   // pointer or keyboard focus is inside the window
let autoOnScreen = false;  // the banner is (mostly) within the viewport

function autoAdvance() {
  const i = PROJECTS.findIndex((p) => p.id === state.activeId);
  select(PROJECTS[(i + 1) % PROJECTS.length].id, { fromAuto: true });
}

function autoSync() {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  const run = READY && autoOnScreen && !autoEngaged && !document.hidden && !reduced();
  /* the class only tightens the photo dissolve while the strip is cycling */
  if (el.site) el.site.classList.toggle('is-auto', !!run);
  /* `#vw-status` is a polite live region. While the strip cycles on its own
     it is muted, so a screen reader is never told about a new project every
     second; the text still updates, and any real choice restores the
     announcement. */
  if (el.status) el.status.setAttribute('aria-live', run ? 'off' : 'polite');
  if (!run) return;
  autoTimer = setInterval(autoAdvance, AUTO_MS);
}

function setAutoEngaged(v) {
  autoEngaged = v;
  autoSync();
}

/* ── toolbar ────────────────────────────────────────────────────────────── */
function onBack() {
  if (state.cursor <= 0) return;
  state.cursor--;
  state.activeId = state.history[state.cursor];
  render();
}

function onForward() {
  if (state.cursor >= state.history.length - 1) return;
  state.cursor++;
  state.activeId = state.history[state.cursor];
  render();
}

function onReload() {
  if (!reduced()) {
    el.reload.classList.remove('is-spinning');
    void el.reload.offsetWidth;               // restart the animation
    el.reload.classList.add('is-spinning');
  }
  render();
  el.status.textContent = 'Reloaded ' + byId(state.activeId).name;
}

async function onShare() {
  const p = byId(state.activeId);
  const url = p.url;
  try {
    if (navigator.clipboard) { await navigator.clipboard.writeText(url); }
    el.status.textContent = 'Copied ' + url + ' to the clipboard';
  } catch (_) {
    el.status.textContent = 'Share link: ' + url;
  }
}

/* Open a project's real site in a new tab. A synthetic anchor click is used
   instead of window.open() so the browser treats it like a normal link even
   when the click landed on the preview image rather than a visible CTA. */
function openProject(p) {
  if (!p) return;
  const a = document.createElement('a');
  a.href = p.url;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
}

/* Clicking the screenshot itself opens the live site. The pill, address bar
   and active tab each handle their own link, so this only catches empty areas
   of the preview. */
function onPreviewClick(e) {
  if (e.target.closest && e.target.closest('a, button')) return;
  openProject(byId(state.activeId));
}

/* ── boot ───────────────────────────────────────────────────────────────── */
if (READY) {
  el.tabs.addEventListener('keydown', onTabKeydown);
  el.back.addEventListener('click', onBack);
  el.fwd.addEventListener('click', onForward);
  el.reload.addEventListener('click', onReload);
  el.share.addEventListener('click', onShare);
  el.site.addEventListener('click', onPreviewClick);

  buildTabs();
  preloadImages();
  paint(byId(INITIAL_ID));   // paint once with no fade so the first frame is clean
  syncTabs();
  syncHistoryButtons();

  /* Auto-rotation. Pointer Events rather than mouse events: on touch,
     `pointerleave` still fires when the finger lifts, so a tap on a phone
     cannot leave the strip stuck paused the way `mouseleave` can. */
  if (el.browser) {
    el.browser.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') setAutoEngaged(true);
    });
    el.browser.addEventListener('pointerleave', () => setAutoEngaged(false));
    el.browser.addEventListener('focusin', () => setAutoEngaged(true));
    el.browser.addEventListener('focusout', (e) => {
      if (!el.browser.contains(e.relatedTarget)) setAutoEngaged(false);
    });
  }
  if ('IntersectionObserver' in window && el.browser) {
    new IntersectionObserver((entries) => {
      autoOnScreen = entries[0].isIntersecting;
      autoSync();
    }, { threshold: 0.2 }).observe(el.browser);
  } else {
    autoOnScreen = true;   // no observer: assume on screen, hover/reduced still gate it
  }
  document.addEventListener('visibilitychange', autoSync);

  const rmq = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (rmq.addEventListener) rmq.addEventListener('change', autoSync);

  autoSync();
}
