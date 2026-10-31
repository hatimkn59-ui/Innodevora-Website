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
  haloform:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="currentColor" opacity=".2"/>' +
    '<path d="M12 3a9 9 0 1 0 0 18 6.6 6.6 0 0 1 0-18Z" fill="currentColor"/></svg>',
  cartway:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" stroke-width="1.7"/>' +
    '<circle cx="12" cy="12" r="3.3" fill="currentColor"/>' +
    '<path d="M12 3.6v2.6M12 17.8v2.6M3.6 12h2.6M17.8 12h2.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  ledgerly:
    '<svg viewBox="0 0 24 24"><path d="M12 21.2v-8.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
    '<path d="M12 13.1c0-4.4 3.6-8 8-8 0 4.4-3.6 8-8 8Z" fill="currentColor"/>' +
    '<path d="M12 16.4c0-3.1-2.5-5.6-5.6-5.6 0 3.1 2.5 5.6 5.6 5.6Z" fill="currentColor" opacity=".55"/></svg>',
  signal:
    '<svg viewBox="0 0 24 24"><path d="M11 2.6l1.9 6.5 6.5 1.9-6.5 1.9-1.9 6.5-1.9-6.5L2.6 11l6.5-1.9z" fill="currentColor"/>' +
    '<path d="M18.6 3.2l.75 2.3 2.3.75-2.3.75-.75 2.3-.75-2.3-2.3-.75 2.3-.75z" fill="currentColor" opacity=".6"/></svg>'
};

/* ── projects ───────────────────────────────────────────────────────────── */
/* Innodevora's own work: one project per discipline — UI/UX, frontend,
   backend and full stack — each shown as its client's brand with the
   address bar on innodevora.com/work/<slug>. Order matches the tab strip;
   Cartway (the cyclist) is the initial active tab. Imagery
   is local and each project uses a different file — nothing is shared. */
const PROJECTS = [
  {
    id: 'haloform',
    name: 'Haloform',
    tabLabel: 'Haloform',
    domain: 'innodevora.com/work/haloform',
    logo: 'Haloform',
    navLinks: ['Product', 'Design', 'Contact'],
    ctaNav: 'Book a demo',

    eyebrow: 'UI/UX Design',
    headline: 'Interfaces that explain themselves.',
    lede: 'Research, wireframes and a shipped design system for Haloform — every screen tested with real users before a line of code was written.',
    ctaLabel: 'See the flows',
    trustText: 'Trusted by 40+ Product Teams',

    image: '/projects/ornate/media/ornate-ellipse1.webp',
    alt: 'Classical marble statue framed by coral ferns against a teal sky',
    imgPos: '64% 44%',

    accent: '#ffa27e',
    accentSoft: 'rgba(255, 241, 236, .86)',
    headlineFont: "Satoshi-Variable, Arial, sans-serif",
    headlineWeight: '800',
    headlineTracking: '-.035em',
    eyebrowTransform: 'uppercase',
    eyebrowTracking: '.2em',
    ledeWeight: '400',
    pillBg: '#ff8f6b',
    pillFg: '#1a0d08',
    scrim:
      'linear-gradient(96deg, rgba(14, 8, 6, .93) 0%, rgba(14, 8, 6, .76) 32%,' +
      ' rgba(14, 8, 6, .36) 58%, rgba(14, 8, 6, .02) 100%)'
  },
  {
    id: 'cartway',
    name: 'Cartway',
    tabLabel: 'Cartway',
    domain: 'innodevora.com/work/cartway',
    logo: 'Cartway',
    navLinks: ['Shop', 'Journal', 'Support'],
    ctaNav: 'Shop new in',

    eyebrow: 'Frontend Engineering',
    headline: 'A storefront that loads before you blink.',
    lede: 'The Cartway storefront rebuilt by Innodevora — server-rendered pages, a checkout that never stutters and 98+ Lighthouse on every device.',
    ctaLabel: 'View the build',
    trustText: 'Trusted by 1.2M Shoppers',

    image: '/brand/visionwork-hero.webp',
    alt: 'Cyclist racing along a sunlit road, photographed with warm motion blur',
    imgPos: '72% 46%',

    accent: '#ffffff',
    accentSoft: 'rgba(255, 255, 255, .84)',
    headlineFont: "CabinetGrotesk-Variable, Arial, sans-serif",
    headlineWeight: '700',
    headlineTracking: '-.024em',
    eyebrowTransform: 'none',
    eyebrowTracking: '.16em',
    ledeWeight: '400',
    pillBg: '#ffffff',
    pillFg: '#101010',
    scrim:
      'linear-gradient(96deg, rgba(9, 7, 6, .90) 0%, rgba(9, 7, 6, .62) 32%,' +
      ' rgba(9, 7, 6, .20) 60%, rgba(9, 7, 6, 0) 100%)'
  },
  {
    id: 'ledgerly',
    name: 'Ledgerly',
    tabLabel: 'Ledgerly',
    domain: 'innodevora.com/work/ledgerly',
    logo: 'Ledgerly',
    navLinks: ['Docs', 'Status', 'Pricing'],
    ctaNav: 'Read the docs',

    eyebrow: 'Backend & APIs',
    headline: 'Money moves. Nothing breaks.',
    lede: 'A payments ledger and API layer on Laravel and PostgreSQL — idempotent transactions, signed webhooks and an audit trail you can prove.',
    ctaLabel: 'Explore the API',
    trustText: '99.99% Uptime, 40+ Integrations',

    image: '/playground/posters/playground-forest.webp',
    alt: 'Glass sphere glowing on a forest floor as shafts of light fall through the trees',
    imgPos: '58% 42%',

    accent: '#d3e3aa',
    accentSoft: 'rgba(240, 246, 232, .84)',
    headlineFont: "CabinetGrotesk-Variable, Arial, sans-serif",
    headlineWeight: '450',
    headlineTracking: '-.006em',
    eyebrowTransform: 'none',
    eyebrowTracking: '.22em',
    ledeWeight: '400',
    pillBg: '#e9efdc',
    pillFg: '#12180c',
    scrim:
      'linear-gradient(96deg, rgba(6, 10, 7, .87) 0%, rgba(6, 10, 7, .56) 33%,' +
      ' rgba(6, 10, 7, .16) 61%, rgba(6, 10, 7, 0) 100%)'
  },
  {
    id: 'signal',
    name: 'Signal',
    tabLabel: 'Signal',
    domain: 'innodevora.com/work/signal',
    logo: 'Signal',
    navLinks: ['Product', 'Models', 'Sign in'],
    ctaNav: 'Open Signal',

    eyebrow: 'Full-Stack Product',
    headline: 'One team. The whole stack.',
    lede: 'Signal is an AI research workspace designed, built and deployed by Innodevora — interface, application layer and inference API under one roof.',
    ctaLabel: 'Start building',
    trustText: 'Trusted by 9,000+ Teams',

    image: '/contact/textures/sphere-desktop.webp',
    alt: 'Soft violet and amber gradient glow resembling a luminous field',
    imgPos: '52% 50%',

    accent: '#b9a2ff',
    accentSoft: 'rgba(238, 234, 255, .85)',
    headlineFont: "Satoshi-Variable, Arial, sans-serif",
    headlineWeight: '600',
    headlineTracking: '-.018em',
    eyebrowTransform: 'uppercase',
    eyebrowTracking: '.2em',
    ledeWeight: '400',
    pillBg: '#b9a2ff',
    pillFg: '#120b26',
    scrim:
      'linear-gradient(96deg, rgba(9, 7, 16, .90) 0%, rgba(9, 7, 16, .62) 32%,' +
      ' rgba(9, 7, 16, .22) 60%, rgba(9, 7, 16, 0) 100%)'
  }
];

const INITIAL_ID = 'cartway';

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

    btn.append(icon, label);
    btn.addEventListener('click', () => select(p.id));
    el.tabs.appendChild(btn);
  });
}

/* roving tabindex + arrow-key navigation, per the ARIA tabs pattern */
function syncTabs() {
  const tabs = Array.from(el.tabs.querySelectorAll('.vw-tab'));
  tabs.forEach((t) => {
    const on = t.dataset.id === state.activeId;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
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

  el.url.textContent = p.domain;

  el.brandMark.innerHTML = MARKS[p.id];
  el.brandName.textContent = p.logo;
  el.brand.setAttribute('aria-label', p.name + ' home');

  el.links.innerHTML = '';
  el.links.setAttribute('aria-label', p.name + ' navigation');
  p.navLinks.forEach((label) => {
    const a = document.createElement('a');
    a.href = '#manifesto';
    a.textContent = label;
    el.links.appendChild(a);
  });
  el.navCta.textContent = p.ctaNav;
  el.navCta.setAttribute('aria-label', p.ctaNav + ' — ' + p.name);

  el.eyebrow.textContent = p.eyebrow;
  el.headline.textContent = p.headline;
  el.lede.textContent = p.lede;
  el.pillLabel.textContent = p.ctaLabel;
  el.pill.setAttribute('aria-label', p.ctaLabel + ' — ' + p.name);
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
  el.status.textContent = 'Now previewing ' + p.name + ' at ' + p.domain;

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
/* The strip advances on its own every second so all four projects get seen
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
  const url = 'https://' + p.domain;
  try {
    if (navigator.clipboard) { await navigator.clipboard.writeText(url); }
    el.status.textContent = 'Copied ' + url + ' to the clipboard';
  } catch (_) {
    el.status.textContent = 'Share link: ' + url;
  }
}

/* The links inside the previewed site are part of the artwork, not real
   navigation. They must be swallowed in the CAPTURE phase: the site installs
   its own delegated anchor handler that rewrites the hash and runs the section
   ScrollTrigger, so a plain bubble-phase preventDefault still let the page
   jump to `#manifesto` when the preview's CTA was clicked. */
function onSiteClick(e) {
  const a = e.target.closest && e.target.closest('.vw-site a');
  if (!a) return;
  e.preventDefault();
  e.stopPropagation();
}

/* ── boot ───────────────────────────────────────────────────────────────── */
if (READY) {
  el.tabs.addEventListener('keydown', onTabKeydown);
  el.back.addEventListener('click', onBack);
  el.fwd.addEventListener('click', onForward);
  el.reload.addEventListener('click', onReload);
  el.share.addEventListener('click', onShare);
  document.addEventListener('click', onSiteClick, true);   // capture phase

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
