/* ============================================================================
   dashboard.js — shared engine · Public Persuasion (MSC 482)
   Builds the chrome (sidebar · hero pills · mobile drawer + bottom bar) and
   renders the week's checklist FROM window.COURSE (data.js) as a sticky-column
   table + mobile cards. State persists to localStorage + Supabase (realtime).
   Page opts in via <body data-week="N">.
   ============================================================================ */
(function () {
  'use strict';

  const SB_URL = 'https://skuaffvhdmmshliocsks.supabase.co';
  const SB_KEY = 'sb_publishable_5BCw0TUgGV_31MiwHj1-4w_4IL43HTo';
  const SB_TABLE = 'checklist_state';
  const SB_HEADERS = { 'apikey': SB_KEY, 'Content-Type': 'application/json' };
  const SB_ON = location.protocol !== 'file:';
  const LS = 'msc482:';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
  const esc = s => (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lsGet = k => { try { return localStorage.getItem(LS + k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(LS + k, v); } catch (e) {} };

  // ── Page memory: remember the last page visited, so index.html can return here ──
  const PAGES = ['week1.html', 'week2.html', 'week3.html', 'week4.html', 'week5.html', 'finish.html'];
  (function rememberThisPage() {
    const here = location.pathname.split('/').pop() || 'index.html';
    if (here === 'index.html' || PAGES.includes(here)) lsSet('lastPage', here);
  })();

  // ── Smart links: Canvas items try the Canvas app first ──
  // (Drive reading links stay as normal /view URLs — PDF Expert's own Drive connector,
  //  set up inside the app, is what keeps annotations synced back to Drive. A rewritten
  //  "direct download" URL would open a disconnected local copy instead, which defeats that.)
  function smartLink(url, label) {
    const safeLabel = esc(label);
    if (url.indexOf('canvas.northwestern.edu') !== -1) {
      const appUrl = url.replace('https://canvas.northwestern.edu/', 'canvas-courses://canvas.northwestern.edu/');
      return '<a href="' + esc(url) + '" target="_blank" rel="noopener" data-canvas-app="' + esc(appUrl) + '">' + safeLabel + '</a>';
    }
    return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + safeLabel + '</a>';
  }
  // Try the Canvas app; if it hasn't taken over the screen shortly after, fall back to the web link (same tab —
  // a delayed window.open() gets popup-blocked on mobile Safari, so same-tab fallback is the reliable option).
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-canvas-app]');
    if (!a) return;
    e.preventDefault();
    const httpsUrl = a.href, appUrl = a.getAttribute('data-canvas-app');
    let landedElsewhere = false;
    const onHide = () => { landedElsewhere = true; };
    document.addEventListener('visibilitychange', onHide, { once: true });
    setTimeout(() => {
      document.removeEventListener('visibilitychange', onHide);
      if (!landedElsewhere) window.location.href = httpsUrl;
    }, 1200);
    window.location.href = appUrl;
  });

  const DAY = 86400000;
  const parseDue = s => { if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); } return new Date(s); };
  const fmtDay = dt => dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const fmtDateTime = dt => dt.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const fmtDur = m => { if (!m) return '—'; const h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${m}m`; };

  // Traffic-light gradient (red -> green) used to color progress bars as they fill.
  const PROGRESS_STOPS = [[0, 204, 102, 85], [10, 210, 120, 80], [20, 214, 140, 80], [30, 218, 160, 85], [40, 220, 185, 90], [50, 210, 200, 100], [60, 190, 205, 105], [70, 160, 200, 105], [80, 120, 185, 100], [90, 80, 165, 90], [100, 50, 140, 75]];
  function progressColor(p) {
    let r = PROGRESS_STOPS[0][1], g = PROGRESS_STOPS[0][2], b = PROGRESS_STOPS[0][3];
    for (let i = 0; i < PROGRESS_STOPS.length - 1; i++) {
      const [t0, r0, g0, b0] = PROGRESS_STOPS[i];
      const [t1, r1, g1, b1] = PROGRESS_STOPS[i + 1];
      if (p >= t0 && p <= t1) { const ratio = (p - t0) / (t1 - t0); r = Math.round(r0 + (r1 - r0) * ratio); g = Math.round(g0 + (g1 - g0) * ratio); b = Math.round(b0 + (b1 - b0) * ratio); break; }
      else if (p > t1) { r = r1; g = g1; b = b1; }
    }
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function colorProgressBar(fillId, pctId, pct) {
    const color = pct > 0 ? progressColor(pct) : '';
    const fill = $('#' + fillId); if (fill) fill.style.background = color;
    const pctEl = $('#' + pctId); if (pctEl) pctEl.style.color = color;
  }

  const TYPE_EMOJI = { live: '💬', reading: '📖', lecture: '🎥', speech: '🎤', resource: '📄', assignment: '✏️', task: '✅' };
  const MODE = { desk: { e: '🖥️', c: 'mode-desk', t: 'Desk work' }, move: { e: '🏎️', c: 'mode-move', t: 'Move-friendly' }, flex: { e: '🔁', c: 'mode-flex', t: 'Flexible' } };
  const GROUP_MODES = ['type', 'date', 'effort', 'material', 'none'];
  const GROUP_LABELS = { type: 'By type', date: 'By date', effort: 'By effort', material: 'By material', none: 'None' };
  const TYPE_ORDER = ['live', 'reading', 'lecture', 'speech', 'resource', 'assignment', 'task'];
  const TYPE_HEAD = { live: 'Live sessions', reading: 'Readings', lecture: 'Lectures', speech: 'Speeches', resource: 'Resources', assignment: 'Assignments', task: 'Steps' };
  // The Finish Plan page (finish.html) is not a syllabus week — it renders COURSE.plan,
  // an ordered list that reuses existing Week 4/5 items by id alongside its own w6- steps.
  const PLAN_WEEK = 6;
  const ZONE_LABEL = { briefing: 'Briefing', execution: 'Execution', reference: 'Reference' };
  const SUB = 'Northwestern · MSC 482 · Prof. Jason DeSanto';

  let WEEK = null, ITEMS = [], groupIdx = 0, sbClient = null, armed = false, wasFull = false;
  const CHECKED = new Set(); const SEQ = {};

  document.addEventListener('DOMContentLoaded', () => {
    if (!window.COURSE) return;
    if ('hub' in document.body.dataset) return initHub();
    const w = document.body.dataset.week;
    if (!w) return;
    WEEK = Number(w);
    if (WEEK === PLAN_WEEK) {
      ITEMS = planItems();
      const dateMode = GROUP_MODES.indexOf('date');
      if (dateMode !== -1) groupIdx = dateMode;   // the plan reads as a day-by-day list, not by type
    } else {
      ITEMS = window.COURSE.items.filter(i => i.week === WEEK);
    }
    ITEMS.forEach((i, n) => SEQ[i.id] = n + 1);
    pruneEmptySections();
    buildChrome();
    hydrateLocal();
    renderAll();
    armed = true;
    loadRemote();
    subscribeRealtime();
  });

  // Resolve COURSE.plan against COURSE.items, in plan order. Returns COPIES: a per-entry
  // override (e.g. whyOrder) must never leak back onto the shared object the week pages read.
  function planItems() {
    const out = [];
    (window.COURSE.plan || []).forEach(group => {
      (group.entries || []).forEach(entry => {
        const base = window.COURSE.items.find(i => i.id === entry.id);
        if (!base) { console.error('dashboard.js: COURSE.plan references unknown item id \u201c' + entry.id + '\u201d \u2014 step not rendered.'); return; }
        const copy = Object.assign({}, base, entry);
        copy.date = group.date;   // the plan's day is this step's "Best timing" and its grouping key
        out.push(copy);
      });
    });
    return out;
  }

  /* ── Chrome ─────────────────────────────────────────────────────────────── */
  function weekOptions() {
    let o = '<option value="index.html">🏠 Home</option>';
    for (let n = 1; n <= 5; n++) o += '<option value="week' + n + '.html"' + (n === WEEK ? ' selected' : '') + '>Week ' + n + '</option>';
    o += '<option value="finish.html"' + (WEEK === PLAN_WEEK ? ' selected' : '') + '>\ud83c\udfc1 Finish Plan</option>';
    return o;
  }
  function sections() { return $$('.section-card').map(s => ({ id: s.id, zone: s.dataset.zone, icon: s.dataset.icon || '•', nav: s.dataset.nav || s.id })); }
  function pruneEmptySections() {
    if (!ITEMS.some(i => i.type === 'assignment' && i.required)) $('#s-deliv')?.remove();
  }

  function navHTML() {
    let html = '';
    sections().forEach(s => {
      html += '<a class="nav-link" href="#' + s.id + '" data-nav="' + s.id + '"><span class="nav-ic">' + s.icon + '</span>' + esc(s.nav) + '</a>';
    });
    return html;
  }
  function navEntriesHTML() {
    const EYE = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    let html = '';
    sections().forEach(s => {
      html += '<div class="nav-entry" data-section="' + s.id + '" draggable="true">' +
        '<span class="drag-handle" aria-hidden="true" title="Drag to reorder">\u283f</span>' +
        '<a class="nav-link" href="#' + s.id + '" data-nav="' + s.id + '"><span class="nav-ic">' + s.icon + '</span>' + esc(s.nav) + '</a>' +
        '<button class="nav-eye" data-eye="' + s.id + '" title="Hide/show section" aria-label="Toggle section visibility">' + EYE + '</button></div>';
    });
    return html;
  }

  function buildChrome() {
    const meta = window.COURSE.weeks[WEEK];

    // sidebar
    $$('.week-select').forEach(sel => sel.innerHTML = weekOptions());
    const sbp = $('#sbProgress');
    if (sbp) sbp.innerHTML =
      '<div class="sbp-top"><span>' + (WEEK === PLAN_WEEK ? 'Plan progress' : 'Week progress') + '</span><span><b id="sbDone">0</b>/<span id="sbTotal">0</span> <span class="sbp-pct" id="sbPct">0%</span></span></div>' +
      '<div class="sbp-track"><span class="sbp-fill" id="sbFill"></span></div>' +
      '<div class="sbp-time"><span id="sbTime"></span> <span class="sbp-sync" id="sbSync"></span></div>' +
      '<div class="sbp-actions"><button class="btn primary sm" id="sbNext">↓ Next unchecked</button><button class="btn sm" id="sbReset">Reset</button></div>';
    const nl = $('#navList'); if (nl) nl.innerHTML = navEntriesHTML();

    // hero
    const hero = $('#hero');
    if (hero) hero.innerHTML =
      '<div class="hero-top"><div class="hero-week"><select class="week-select" data-week-switch aria-label="Switch week">' + weekOptions() + '</select><span class="hero-dash">Francis Roberts Study Dashboard</span></div>' +
      '<div class="hero-eyebrow">' + (WEEK === PLAN_WEEK ? 'Finish Plan' : 'Week ' + String(WEEK).padStart(2, '0')) + '</div></div>' +
      '<h1 class="hero-title">' + esc(meta.title) + '</h1>' +
      '<p class="hero-sub">' + esc(SUB) + ' · ' + esc(meta.range) + '</p>' +
      '<div class="pill-row">' +
      '<span class="pill pill-accent" id="pillTarget">🎯 —</span>' +
      '<span class="pill pill-prog" id="pillProg" title="Jump to checklist"><span class="pill-prog-track"><span class="pill-prog-fill" id="pillProgFill"></span></span> <span id="pillProgText">0 of 0</span></span>' +
      '<span class="pill pill-next" id="pillNext" title="Jump to next task">↓ <span id="pillNextText">…</span></span>' +
      '<span class="pill pill-amber" id="pillEffort">⏱ —</span>' +
      '<span class="pill pill-sage" id="pillRemain">⏳ —</span></div>';

    // group toggle (in checklist head)
    const tb = $('#toolbar');
    if (tb) { const g = el('button', 'btn sm', 'Group: ' + GROUP_LABELS[GROUP_MODES[groupIdx]] + ' ▾'); g.id = 'grpBtn'; g.addEventListener('click', () => { groupIdx = (groupIdx + 1) % GROUP_MODES.length; g.textContent = 'Group: ' + GROUP_LABELS[GROUP_MODES[groupIdx]] + ' ▾'; renderChecklist(); }); tb.appendChild(g); }

    // mobile drawer + bar
    const dr = $('#mDrawer');
    if (dr) dr.innerHTML =
      '<div class="m-drawer-head"><div class="sb-name">🎙️ MSC 482</div><button class="m-close" id="mClose" aria-label="Close">×</button></div>' +
      '<div class="sbp-actions" style="margin-bottom:14px"><button class="btn primary sm" id="mNext">↓ Next</button><button class="btn sm" id="mReset">Reset</button></div>' +
      '<div class="sb-label">On this page</div><nav class="nav-list">' + navHTML() + '</nav>';
    const bar = $('#mBar');
    if (bar) bar.innerHTML =
      '<button class="m-bar-btn" id="mbMenu"><span class="m-bar-ic">☰</span><span class="m-bar-lb">Menu</span></button>' +
      '<button class="m-bar-btn" id="mbList"><span class="m-bar-ic">📌</span><span class="m-bar-lb">Checklist</span></button>' +
      '<button class="m-bar-btn" id="mbDone"><span class="m-bar-ic">☑️</span><span class="m-bar-lb">Done</span></button>' +
      '<button class="m-bar-btn" id="mbTop"><span class="m-bar-ic">⬆️</span><span class="m-bar-lb">Top</span></button>';

    wire(); applyHidden(); applyOrder(); initDrag();
  }

  function wire() {
    $$('[data-week-switch]').forEach(sel => sel.addEventListener('change', () => { if (!sel.value) return; if (sel.value === 'index.html') { try { sessionStorage.setItem('msc482:homeNav', '1'); } catch (e) {} } location.href = sel.value; }));
    // nav links (smooth scroll + close drawer)
    $$('.nav-link').forEach(a => a.addEventListener('click', e => {
      e.preventDefault(); const t = $('#' + a.dataset.nav); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); closeDrawer();
    }));
    // eye hide/show
    $$('.nav-eye').forEach(btn => btn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const id = btn.dataset.eye; const wasHidden = getHidden().includes(id);
      setSectionHidden(id, !wasHidden);
      if (wasHidden) $('#' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    // sidebar collapse
    const col = $('#sbCollapse'), show = $('#sbShow');
    if (col) col.addEventListener('click', () => document.body.classList.add('sb-hidden'));
    if (show) show.addEventListener('click', () => document.body.classList.remove('sb-hidden'));
    // actions
    ['sbNext', 'mNext'].forEach(id => { const b = $('#' + id); if (b) b.addEventListener('click', () => { jumpNext(); closeDrawer(); }); });
    ['sbReset', 'mReset'].forEach(id => { const b = $('#' + id); if (b) b.addEventListener('click', resetWeek); });
    const pn = $('#pillNext'); if (pn) pn.addEventListener('click', jumpNext);
    const pp = $('#pillProg'); if (pp) pp.addEventListener('click', () => { const c = $('#s-checklist'); if (c) c.scrollIntoView({ behavior: 'smooth' }); });
    // mobile drawer
    const bd = $('#mBackdrop');
    [['#mbMenu', openDrawer], ['#mClose', closeDrawer]].forEach(([s, f]) => { const e = $(s); if (e) e.addEventListener('click', f); });
    if (bd) bd.addEventListener('click', closeDrawer);
    const mbList = $('#mbList'); if (mbList) mbList.addEventListener('click', () => $('#s-checklist')?.scrollIntoView({ behavior: 'smooth' }));
    const mbDone = $('#mbDone'); if (mbDone) mbDone.addEventListener('click', () => { const g = $('.grp-row.completed') || $('.grp-card.completed'); (g || $('#s-checklist'))?.scrollIntoView({ behavior: 'smooth' }); });
    const mbTop = $('#mbTop'); if (mbTop) mbTop.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
    // scrollspy
    if ('IntersectionObserver' in window) {
      const obs = new IntersectionObserver(ents => ents.forEach(en => { if (en.isIntersecting) { $$('.nav-link').forEach(a => a.classList.toggle('active', a.dataset.nav === en.target.id)); } }), { rootMargin: '-20% 0px -70% 0px' });
      $$('.section-card').forEach(s => obs.observe(s));
    }
    // sticky-hero condense on scroll
    const heroEl = $('#hero'), mainEl = $('.main');
    if (heroEl && mainEl && 'IntersectionObserver' in window) {
      const sent = document.createElement('div'); sent.style.height = '1px';
      mainEl.insertBefore(sent, heroEl);
      new IntersectionObserver(([e]) => heroEl.classList.toggle('is-stuck', !e.isIntersecting), { threshold: 0 }).observe(sent);
    }
    // copy-to-clipboard for NotebookLM prompt boxes
    $$('.copy-btn[data-copy]').forEach(btn => btn.addEventListener('click', async () => {
      const src = $('#' + btn.dataset.copy);
      if (!src) return;
      const text = src.textContent;
      try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
        else { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }
        const orig = btn.textContent; btn.textContent = 'Copied!'; btn.classList.add('copied');
        setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1600);
      } catch (e) {}
    }));
  }
  function openDrawer() { $('#mDrawer')?.classList.add('show'); $('#mBackdrop')?.classList.add('show'); }
  function closeDrawer() { $('#mDrawer')?.classList.remove('show'); $('#mBackdrop')?.classList.remove('show'); }

  /* ── Layout prefs: hide + reorder (device-local) ────────────────────────── */
  const ORDER_KEY = 'order', HIDDEN_KEY = 'hidden';
  function getHidden() { try { return JSON.parse(lsGet(HIDDEN_KEY) || '[]'); } catch (e) { return []; } }
  function updateNavHidden() { const h = getHidden(); $$('.nav-entry').forEach(en => en.classList.toggle('is-hidden', h.includes(en.dataset.section))); }
  function setSectionHidden(id, hidden) { const c = $('#' + id); if (c) c.classList.toggle('section-hidden', hidden); const a = getHidden().filter(x => x !== id); if (hidden) a.push(id); lsSet(HIDDEN_KEY, JSON.stringify(a)); updateNavHidden(); }
  function applyHidden() { const h = getHidden(); $$('.section-card[id]').forEach(c => c.classList.toggle('section-hidden', h.includes(c.id))); updateNavHidden(); }
  function saveOrder() { lsSet(ORDER_KEY, JSON.stringify($$('#navList .nav-entry').map(e => e.dataset.section))); }
  function applyOrder() {
    let ids; try { ids = JSON.parse(lsGet(ORDER_KEY) || '[]'); } catch (e) { return; }
    if (!ids.length) return;
    const nav = $('#navList'), main = $('.main'); if (!nav || !main) return;
    ids.forEach(id => { const en = nav.querySelector('.nav-entry[data-section="' + id + '"]'); if (en) nav.appendChild(en); const card = $('#' + id); if (card) main.appendChild(card); });
  }
  function initDrag() {
    const nav = $('#navList'); if (!nav) return; let src = null;
    nav.addEventListener('dragstart', e => { const en = e.target.closest('.nav-entry'); if (!en) return; src = en; en.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    nav.addEventListener('dragend', () => { $$('.nav-entry').forEach(x => x.classList.remove('dragging', 'drag-over')); src = null; });
    nav.addEventListener('dragover', e => { e.preventDefault(); const en = e.target.closest('.nav-entry'); if (!en || en === src) return; $$('.nav-entry').forEach(x => x.classList.remove('drag-over')); en.classList.add('drag-over'); });
    nav.addEventListener('drop', e => {
      e.preventDefault(); const tgt = e.target.closest('.nav-entry'); if (!tgt || !src || tgt === src) return; tgt.classList.remove('drag-over');
      const r = tgt.getBoundingClientRect(); const before = e.clientY < r.top + r.height / 2;
      nav.insertBefore(src, before ? tgt : tgt.nextSibling);
      const main = $('.main'); $$('#navList .nav-entry').forEach(en => { const card = $('#' + en.dataset.section); if (card) main.appendChild(card); });
      saveOrder();
    });
  }

  function jumpNext() {
    const nx = ITEMS.find(i => i.required && !CHECKED.has(i.id));
    if (!nx) return;
    const box = ($('#check-wrap')?.offsetParent ? $('#check-wrap') : $('#check-cards')) || document;
    const cb = box.querySelector('.ck[data-id="' + cssId(nx.id) + '"]');
    (cb ? cb.closest('tr,.ccard') : $('#s-checklist'))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function cssId(id) { return id.replace(/"/g, '\\"'); }

  /* ── Render ─────────────────────────────────────────────────────────────── */
  function renderAll() { renderChecklist(); renderDeliverables(); }

  function groupItems(mode, list) {
    if (mode === 'none') return [{ label: '', items: list }];
    if (mode === 'date') {
      const order = [], map = {};
      list.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(i => { const k = i.date || '-'; if (!map[k]) { order.push(k); map[k] = []; } map[k].push(i); });
      return order.map(k => ({ label: k === '-' ? 'No date' : fmtDay(parseDue(k)), items: map[k] }));
    }
    if (mode === 'material') { const order = [], map = {}; list.forEach(i => { if (!map[i.material]) { order.push(i.material); map[i.material] = []; } map[i.material].push(i); }); return order.map(m => ({ label: m, items: map[m] })); }
    if (mode === 'effort') { const b = { s: [], m: [], l: [] }; list.forEach(i => { const e = i.effort || 0; (e <= 20 ? b.s : e <= 40 ? b.m : b.l).push(i); }); return [['Short (≤20m)', b.s], ['Medium (21–40m)', b.m], ['Long (40m+)', b.l]].filter(g => g[1].length).map(g => ({ label: g[0], items: g[1] })); }
    return TYPE_ORDER.map(t => ({ label: TYPE_HEAD[t], items: list.filter(i => i.type === t) })).filter(g => g.items.length);
  }

  function renderChecklist() {
    const mode = GROUP_MODES[groupIdx];
    const open = ITEMS.filter(i => !CHECKED.has(i.id));
    const done = ITEMS.filter(i => CHECKED.has(i.id)).sort((a, b) => SEQ[a.id] - SEQ[b.id]);
    const groups = groupItems(mode, open);
    if (done.length) groups.push({ label: 'Completed ✓', items: done, completed: true });
    const totalMin = ITEMS.reduce((a, i) => a + (i.effort || 0), 0);
    const remainMin = ITEMS.filter(i => !CHECKED.has(i.id)).reduce((a, i) => a + (i.effort || 0), 0);
    const tfoot = '<tfoot><tr class="foot-total"><td colspan="6">Total estimated active work time</td><td colspan="2">About ' + fmtDur(totalMin) + '</td></tr>' +
      '<tr class="foot-remain"><td colspan="6">Estimated remaining</td><td colspan="2">' + (remainMin ? fmtDur(remainMin) : 'All done \u2713') + '</td></tr></tfoot>';
    const footCards = '<div class="check-footer"><div><span>Total active work</span><b>About ' + fmtDur(totalMin) + '</b></div><div><span>Remaining</span><b>' + (remainMin ? fmtDur(remainMin) : 'All done \u2713') + '</b></div></div>';

    const wrap = $('#check-wrap');
    if (wrap) {
      const cols = ['', '#', 'Task', 'What to capture', 'Best timing', 'Why this order', 'Effort', 'Mode'];
      let html = '<table class="check-table"><thead><tr>' + cols.map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>';
      groups.forEach(g => { if (g.label) html += '<tr class="grp-row' + (g.completed ? ' completed' : '') + '"><td colspan="8">' + esc(g.label) + ' · ' + g.items.length + '</td></tr>'; g.items.forEach(i => html += tableRow(i)); });
      wrap.innerHTML = html + '</tbody>' + tfoot + '</table>';
      $$('input.ck', wrap).forEach(cb => cb.addEventListener('change', () => toggle(cb.dataset.id, cb.checked)));
    }
    const cc = $('#check-cards');
    if (cc) {
      let html = '';
      groups.forEach(g => { if (g.label) html += '<div class="grp-card' + (g.completed ? ' completed' : '') + '">' + esc(g.label) + ' · ' + g.items.length + '</div>'; g.items.forEach(i => html += cardRow(i)); });
      cc.innerHTML = html + footCards;
      $$('input.ck', cc).forEach(cb => cb.addEventListener('change', () => toggle(cb.dataset.id, cb.checked)));
    }
    updateProgress();
    renderApproach();
  }

  function renderApproach() {
    $$('.order-list').forEach(ol => {
      let first = true;
      $$('li[data-items]', ol).forEach(li => {
        const done = li.dataset.items.split(/\s+/).every(id => CHECKED.has(id));
        li.classList.toggle('approach-done', done);
        li.classList.toggle('approach-first', !done && first);
        if (!done) first = false;
      });
    });
  }

  function taskInner(i) {
    const emoji = '<span class="t-emoji">' + (TYPE_EMOJI[i.type] || '•') + '</span>';
    return i.url ? emoji + smartLink(i.url, i.label)
      : emoji + '<span class="t-nolink">' + esc(i.label) + '</span><span class="t-nolink-tag">no link</span>';
  }
  function modeBadge(i) { const m = MODE[i.mode] || MODE.flex; return '<span class="mode-badge ' + m.c + '" title="' + m.t + '">' + m.e + '</span>'; }
  function tableRow(i) {
    const d = CHECKED.has(i.id);
    return '<tr class="' + (d ? 'done' : '') + '">' +
      '<td><input class="ck" type="checkbox" data-id="' + esc(i.id) + '"' + (d ? ' checked' : '') + '></td>' +
      '<td>' + SEQ[i.id] + '</td>' +
      '<td class="task-cell">' + taskInner(i) + (i.note ? '<div class="t-note">' + esc(i.note) + '</div>' : '') + '</td>' +
      '<td class="cap-cell">' + esc(i.capture || '') + '</td>' +
      '<td class="when-cell">' + (i.date ? esc(fmtDay(parseDue(i.date))) : '') + '</td>' +
      '<td class="why-cell">' + esc(i.whyOrder || '') + '</td>' +
      '<td class="eff-cell">' + fmtDur(i.effort) + '</td>' +
      '<td class="mode-cell">' + modeBadge(i) + '</td></tr>';
  }
  function cardRow(i) {
    const d = CHECKED.has(i.id);
    const meta = ['#' + SEQ[i.id], i.date ? fmtDay(parseDue(i.date)) : '', fmtDur(i.effort)].filter(Boolean);
    return '<div class="ccard' + (d ? ' done' : '') + '">' +
      '<input class="ck" type="checkbox" data-id="' + esc(i.id) + '"' + (d ? ' checked' : '') + '>' +
      '<div class="ccard-body"><div class="ccard-task">' + taskInner(i) + '</div>' +
      (i.capture ? '<div class="ccard-cap">' + esc(i.capture) + '</div>' : '') +
      '<div class="ccard-meta">' + meta.map(esc).join('<span class="dot"></span>') + '</div></div>' + modeBadge(i) + '</div>';
  }

  function renderDeliverables() {
    const host = $('#deliverables'); if (!host) return;
    const graded = ITEMS.filter(i => i.type === 'assignment' && i.required);
    let html = '<table class="deliv-table"><thead><tr><th>Deliverable</th><th>Points</th><th>Your target</th><th>Actual due</th></tr></thead><tbody>';
    graded.forEach(i => { const real = parseDue(i.due), target = new Date(real.getTime() - DAY);
      html += '<tr><td>' + (i.url ? smartLink(i.url, i.label) : esc(i.label)) + '</td>' +
        '<td class="deliv-pts">' + esc((i.note || '').split('·')[0].trim() || '—') + '</td><td>' + fmtDay(target) + '</td><td>' + fmtDateTime(real) + '</td></tr>'; });
    host.innerHTML = html + '</tbody></table>';
  }

  /* ── Toggle + progress ──────────────────────────────────────────────────── */
  function toggle(id, checked) {
    if (checked) CHECKED.add(id); else CHECKED.delete(id);
    lsSet(id, checked ? '1' : '0');
    renderChecklist();
    if (SB_ON) { setSync('saving'); sbUpsert(id, checked).then(ok => setSync(ok ? 'ok' : 'err')); }
  }

  function updateProgress() {
    const req = ITEMS.filter(i => i.required);
    const total = req.length, done = req.filter(i => CHECKED.has(i.id)).length;
    const pct = total ? Math.round(done / total * 100) : 0;
    const remain = req.filter(i => !CHECKED.has(i.id)).reduce((a, i) => a + (i.effort || 0), 0);
    const totalMin = req.reduce((a, i) => a + (i.effort || 0), 0);
    const set = (id, v) => { const e = $('#' + id); if (e) e.textContent = v; };
    const wid = (id, v) => { const e = $('#' + id); if (e) e.style.width = v; };
    set('sbDone', done); set('sbTotal', total); set('sbPct', pct + '%'); wid('sbFill', pct + '%'); colorProgressBar('sbFill', 'sbPct', pct);
    set('sbTime', pct === 100 ? 'All done · ' + fmtDur(totalMin) + ' total' : '≈ ' + fmtDur(remain) + ' left');
    set('pillProgText', done + ' of ' + total + ' done'); wid('pillProgFill', pct + '%');
    set('pillEffort', '⏱ ~' + fmtDur(totalMin) + (WEEK === PLAN_WEEK ? ' on this plan' : ' this week'));
    set('pillRemain', remain ? '⏳ ~' + fmtDur(remain) + ' left' : '✅ All done');
    const nx = req.find(i => !CHECKED.has(i.id));
    set('pillNextText', nx ? nx.label.replace(/ —.*$/, '') : 'All done 🎉');
    // target pill
    const softs = ITEMS.filter(i => i.dueType !== 'event').map(i => parseDue(i.due)).sort((a, b) => a - b);
    const grad = ITEMS.filter(i => i.type === 'assignment' && i.required).map(i => parseDue(i.due)).sort((a, b) => a - b);
    const anchor = grad[0] || softs[softs.length - 1];
    set('pillTarget', anchor ? '🎯 Target ' + fmtDay(new Date(anchor.getTime() - DAY)) : '🎯 —');

    const full = pct === 100 && total > 0;
    if (armed && full && !wasFull) celebrate();
    wasFull = full;
  }

  /* ── Supabase ───────────────────────────────────────────────────────────── */
  async function sbUpsert(id, checked) {
    try { const r = await fetch(SB_URL + '/rest/v1/' + SB_TABLE + '?on_conflict=id', { method: 'POST', headers: Object.assign({}, SB_HEADERS, { 'Prefer': 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ id, checked, updated_at: new Date().toISOString() }) }); return r.ok; } catch (e) { return false; }
  }
  // Fetch exactly this page's ids. (Was a `like.w<WEEK>-*` prefix match, which couples state
  // to the id naming scheme and can't express a page whose items span several weeks.)
  async function sbLoadItems() {
    const ids = ITEMS.map(i => encodeURIComponent(i.id)).join(',');
    if (!ids) return [];
    try { const r = await fetch(SB_URL + '/rest/v1/' + SB_TABLE + '?select=id,checked&id=in.(' + ids + ')', { headers: SB_HEADERS }); return r.ok ? await r.json() : null; } catch (e) { return null; }
  }
  async function sbResetWeek() { try { const rows = ITEMS.map(i => ({ id: i.id, checked: false, updated_at: new Date().toISOString() })); const r = await fetch(SB_URL + '/rest/v1/' + SB_TABLE + '?on_conflict=id', { method: 'POST', headers: Object.assign({}, SB_HEADERS, { 'Prefer': 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(rows) }); return r.ok; } catch (e) { return false; } }
  function hydrateLocal() { ITEMS.forEach(i => { if (lsGet(i.id) === '1') CHECKED.add(i.id); }); }
  async function loadRemote() {
    if (!SB_ON) return;
    const rows = await sbLoadItems(); if (!rows) { setSync('err'); return; }
    let changed = false;
    rows.forEach(({ id, checked }) => { if (!ITEMS.some(i => i.id === id)) return; const had = CHECKED.has(id); if (checked && !had) { CHECKED.add(id); changed = true; } if (!checked && had) { CHECKED.delete(id); changed = true; } lsSet(id, checked ? '1' : '0'); });
    if (changed) renderChecklist(); setSync('ok');
  }
  function subscribeRealtime() {
    if (!SB_ON || !window.supabase) return;
    try {
      sbClient = window.supabase.createClient(SB_URL, SB_KEY);
      sbClient.channel('sync-w' + WEEK).on('postgres_changes', { event: '*', schema: 'public', table: SB_TABLE }, p => {
        const row = p.new; if (!row || !row.id || !ITEMS.some(i => i.id === row.id)) return;
        if (CHECKED.has(row.id) === !!row.checked) return;
        if (row.checked) CHECKED.add(row.id); else CHECKED.delete(row.id);
        lsSet(row.id, row.checked ? '1' : '0'); renderChecklist();
      }).subscribe(st => { if (st === 'SUBSCRIBED') setSync('ok'); });
    } catch (e) {}
  }
  function resetWeek() {
    const ask = WEEK === PLAN_WEEK
      ? 'Reset the Finish Plan? This also unchecks the shared Week 4 and Week 5 items.'
      : 'Reset your progress for Week ' + WEEK + '?';
    if (!confirm(ask)) return;
    ITEMS.forEach(i => { CHECKED.delete(i.id); lsSet(i.id, '0'); });
    renderChecklist(); closeDrawer();
    if (SB_ON) { setSync('saving'); sbResetWeek().then(ok => setSync(ok ? 'ok' : 'err')); }
  }

  let syncT = null;
  function setSync(state) {
    const s = $('#sbSync'); if (!s) return;
    s.textContent = { saving: '↑ saving…', ok: '✓ synced', err: '⚠ offline' }[state] || '';
    s.style.opacity = state ? '1' : '0';
    clearTimeout(syncT); if (state === 'ok') syncT = setTimeout(() => { s.style.opacity = '0'; }, 1500);
  }

  /* ── Celebration ────────────────────────────────────────────────────────── */
  function celebrate() {
    const b = $('#banner');
    if (b) { b.innerHTML = '<div class="bt">' + (WEEK === PLAN_WEEK ? 'Finish Plan complete' : 'Week ' + WEEK + ' complete') + '</div><div class="bs">Every item checked off. Nicely done.</div>'; b.classList.add('show'); setTimeout(() => b.classList.remove('show'), 4200); }
    confetti();
  }
  function confetti() {
    const c = $('#confetti'); if (!c) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    c.width = innerWidth; c.height = innerHeight; c.style.display = 'block';
    const cols = ['#836eaa', '#4e2a84', '#b6acd1', '#92560e', '#684c96'];
    const P = Array.from({ length: 130 }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * .3, r: 3 + Math.random() * 5, vy: 2 + Math.random() * 3.5, vx: -1.5 + Math.random() * 3, col: cols[(Math.random() * cols.length) | 0], rot: Math.random() * 6.28, vr: -.2 + Math.random() * .4 }));
    let f = 0;
    (function draw() { ctx.clearRect(0, 0, c.width, c.height); P.forEach(p => { p.x += p.vx; p.y += p.vy; p.rot += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.col; ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 1.4); ctx.restore(); }); if (++f < 220) requestAnimationFrame(draw); else c.style.display = 'none'; })();
  }

  /* -- HUB (index.html) -- */
  const HUB = new Set();
  const WEEK_BOUNDS = { 1: ['2026-07-26','2026-08-01'], 2: ['2026-08-02','2026-08-08'], 3: ['2026-08-09','2026-08-15'], 4: ['2026-08-16','2026-08-22'], 5: ['2026-08-23','2026-08-29'], 6: ['2026-08-24','2026-08-27'] };
  const MILESTONE_SHORT = { 'w1-live1': 'Course Launch', 'w2-asg1': 'Private Writing', 'w3-live1': 'Live Discussion (Wk 3)', 'w5-live1': 'Live Discussion (Wk 5)', 'w5-asg1': 'Speech script', 'w5-asg2': 'Speech video' };

  function initHub() {
    buildHubChrome();
    renderHubPinned(); renderHubSchedule(); renderHubFinish(); renderHubWeeks();
    applyHidden(); applyOrder(); initDrag();
    loadHubRemote(); subscribeHubRealtime();
  }

  function buildHubChrome() {
    $$('.week-select').forEach(sel => sel.innerHTML = weekOptions());
    const sbp = $('#hubProgress');
    if (sbp) sbp.innerHTML =
      '<div class="sbp-top"><span>Course progress</span><span><b id="hubDone">0</b>/<span id="hubTotal">0</span> <span class="sbp-pct" id="hubPct">0%</span></span></div>' +
      '<div class="sbp-track"><span class="sbp-fill" id="hubFill"></span></div><div class="sbp-time" id="hubTime"></div>';
    const nl = $('#navList'); if (nl) nl.innerHTML = navEntriesHTML();
    const hero = $('#hero');
    if (hero) hero.innerHTML =
      '<div class="hero-top"><div class="hero-week"><select class="week-select" data-week-switch aria-label="Switch week">' + weekOptions() + '</select><span class="hero-dash">Francis Roberts Study Dashboard</span></div>' +
      '<div class="hero-eyebrow">Course Home</div></div>' +
      '<h1 class="hero-title">Public Persuasion</h1>' +
      '<p class="hero-sub">' + esc(SUB) + ' \u00b7 Jul 26 \u2013 Aug 29</p>' +
      '<div class="pill-row">' +
      '<span class="pill pill-prog" id="hubPill" title="Jump to weeks"><span class="pill-prog-track"><span class="pill-prog-fill" id="hubPillFill"></span></span> <span id="hubPillText">0 of 0</span></span>' +
      '<span class="pill pill-accent" id="hubNext">\u23f3 \u2014</span>' +
      '<span class="pill pill-amber" id="hubTimePill">\u23f1 \u2014</span>' +
      '<span class="pill pill-sage" id="hubRemainPill">\u23f3 \u2014</span></div>';
    const dr = $('#mDrawer');
    if (dr) dr.innerHTML = '<div class="m-drawer-head"><div class="sb-name">\ud83c\udf99\ufe0f MSC 482</div><button class="m-close" id="mClose" aria-label="Close">\u00d7</button></div><div class="sb-label">On this page</div><nav class="nav-list">' + navHTML() + '</nav>';
    const bar = $('#mBar');
    if (bar) bar.innerHTML =
      '<button class="m-bar-btn" id="mbMenu"><span class="m-bar-ic">\u2630</span><span class="m-bar-lb">Menu</span></button>' +
      '<button class="m-bar-btn" id="mbTop"><span class="m-bar-ic">\u2b06\ufe0f</span><span class="m-bar-lb">Top</span></button>';
    wireHub();
  }

  function wireHub() {
    $$('[data-week-switch]').forEach(sel => sel.addEventListener('change', () => { if (!sel.value) return; if (sel.value === 'index.html') { try { sessionStorage.setItem('msc482:homeNav', '1'); } catch (e) {} } location.href = sel.value; }));
    $$('.nav-link').forEach(a => a.addEventListener('click', e => { e.preventDefault(); $('#' + a.dataset.nav)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); closeDrawer(); }));
    const col = $('#sbCollapse'), show = $('#sbShow');
    if (col) col.addEventListener('click', () => document.body.classList.add('sb-hidden'));
    if (show) show.addEventListener('click', () => document.body.classList.remove('sb-hidden'));
    $$('.nav-eye').forEach(btn => btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); const id = btn.dataset.eye; const was = getHidden().includes(id); setSectionHidden(id, !was); if (was) $('#' + id)?.scrollIntoView({ behavior: 'smooth' }); }));
    const bd = $('#mBackdrop'); [['#mbMenu', openDrawer], ['#mClose', closeDrawer]].forEach(([s, f]) => { const e = $(s); if (e) e.addEventListener('click', f); }); if (bd) bd.addEventListener('click', closeDrawer);
    $('#mbTop')?.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
    $('#hubPill')?.addEventListener('click', () => $('#s-weeks')?.scrollIntoView({ behavior: 'smooth' }));
    $('#hubPinned')?.addEventListener('click', e => { if (!e.target.closest('#pinFrameworkLink')) return; e.preventDefault(); $('#s-framework')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    if ('IntersectionObserver' in window) { const obs = new IntersectionObserver(ents => ents.forEach(en => { if (en.isIntersecting) $$('.nav-link').forEach(a => a.classList.toggle('active', a.dataset.nav === en.target.id)); }), { rootMargin: '-20% 0px -70% 0px' }); $$('.section-card').forEach(s => obs.observe(s)); }
  }

  function daysWord(target, now) {
    const d = Math.ceil((target - now) / DAY);
    if (d < 0) return 'past due';
    if (d === 0) return 'due today';
    if (d === 1) return 'due tomorrow';
    return 'due in ' + d + 'd';
  }

  function renderHubPinned() {
    const host = $('#hubPinned'); if (!host) return;
    const now = new Date();
    const byId = id => window.COURSE.items.find(i => i.id === id);
    const pw = byId('w2-asg1');
    const sp1 = byId('w5-asg1'), sp2 = byId('w5-asg2');

    const pwDue = parseDue(pw.due), pwTarget = new Date(pwDue.getTime() - DAY);
    const pwDone = HUB.has(pw.id);
    const pwCard = '<a class="pin-card' + (pwDone ? ' pin-done' : '') + '" href="' + esc(pw.url) + '" target="_blank" rel="noopener">' +
      '<div class="pin-top"><span class="pin-badge">\u2709\ufe0f Private Writing</span>' + (pwDone ? '<span class="pin-check">\u2713 done</span>' : '<span class="pin-count">' + esc(daysWord(pwDue, now)) + '</span>') + '</div>' +
      '<div class="pin-target">Target ' + fmtDay(pwTarget) + '</div>' +
      '<div class="pin-real">Due ' + fmtDay(pwDue) + ' \u00b7 5:00 p.m. CT \u00b7 30 pts</div></a>';

    const sp1Due = parseDue(sp1.due), sp1Target = new Date(sp1Due.getTime() - DAY);
    const sp2Due = parseDue(sp2.due);
    const sp1Done = HUB.has(sp1.id), sp2Done = HUB.has(sp2.id);
    const spNextDue = sp1Done ? sp2Due : sp1Due;
    const spStatus = sp1Done && sp2Done ? '<span class="pin-check">\u2713 done</span>' : '<span class="pin-count">' + esc(daysWord(spNextDue, now)) + '</span>';
    const spCard = '<div class="pin-card' + (sp1Done && sp2Done ? ' pin-done' : '') + '">' +
      '<div class="pin-top"><span class="pin-badge">\ud83c\udfa4 Persuasive Policy Speech</span>' + spStatus + '</div>' +
      '<div class="pin-target">Target ' + fmtDay(sp1Target) + ' (script)</div>' +
      '<div class="pin-real">Text due Wed Aug 26 \u00b7 Video due Thu Aug 27 \u00b7 5:00 p.m. CT</div>' +
      '<div class="pin-links"><a href="' + esc(sp1.url) + '" target="_blank" rel="noopener">' + (sp1Done ? '\u2713 ' : '') + 'Part 1 \u2014 script</a><a href="' + esc(sp2.url) + '" target="_blank" rel="noopener">' + (sp2Done ? '\u2713 ' : '') + 'Part 2 \u2014 video</a></div></div>';

    const fwCard = '<a class="pin-card pin-framework" href="#s-framework" id="pinFrameworkLink"><div class="pin-top"><span class="pin-badge">\ud83e\udded Speech Analysis Framework</span></div><div class="pin-real">A structured way to break down any speech before you write your own.</div></a>';

    host.innerHTML = pwCard + spCard + fwCard;
  }

  function planEntryIds() { return (window.COURSE.plan || []).reduce((a, g) => a.concat((g.entries || []).map(e => e.id)), []); }

  function renderHubFinish() {
    const host = $('#hubFinish'); if (!host) return;
    const meta = window.COURSE.weeks[PLAN_WEEK]; if (!meta) return;
    const ids = planEntryIds();
    const done = ids.filter(id => HUB.has(id)).length;
    const pct = ids.length ? Math.round(done / ids.length * 100) : 0;
    const now = new Date(), b = WEEK_BOUNDS[PLAN_WEEK];
    const cur = b && now >= parseDue(b[0]) && now < new Date(parseDue(b[1]).getTime() + DAY);
    const status = pct === 100
      ? '<span class="pin-check">\u2713 done</span>'
      : '<span class="pin-count">' + (b ? esc(daysWord(parseDue(b[1]), now)) : '') + '</span>';
    host.innerHTML = '<a class="pin-card pin-finish' + (cur ? ' current' : '') + (pct === 100 ? ' pin-done' : '') + '" href="finish.html">' +
      '<div class="pin-top"><span class="pin-badge">\ud83c\udfc1 Finish Plan</span>' + status + '</div>' +
      '<div class="pin-target">' + esc(meta.title) + '</div>' +
      '<div class="wk-card-bar"><span style="width:' + pct + '%"></span></div>' +
      '<div class="pin-real">' + done + ' / ' + ids.length + ' steps done \u00b7 ' + esc(meta.range) + '</div></a>';
  }

  function renderHubWeeks() {
    const host = $('#hubWeeks'); if (!host) return;
    const today = new Date(); let html = '';
    for (let n = 1; n <= 5; n++) {
      const meta = window.COURSE.weeks[n];
      const items = window.COURSE.items.filter(i => i.week === n);
      const done = items.filter(i => HUB.has(i.id)).length;
      const pct = items.length ? Math.round(done / items.length * 100) : 0;
      const grad = window.COURSE.items.find(i => i.week === n && i.type === 'assignment' && i.required);
      const b = WEEK_BOUNDS[n]; const cur = b && today >= parseDue(b[0]) && today < new Date(parseDue(b[1]).getTime() + DAY);
      html += '<a class="wk-card' + (cur ? ' current' : '') + (pct === 100 ? ' complete' : '') + '" href="week' + n + '.html">' +
        '<div class="wk-card-top"><span class="wk-num">Week ' + n + '</span>' + (cur ? '<span class="wk-now">This week</span>' : '') + '</div>' +
        '<div class="wk-card-title">' + esc(meta.title) + '</div>' +
        '<div class="wk-card-range">' + esc(meta.range) + '</div>' +
        '<div class="wk-card-bar"><span style="width:' + pct + '%"></span></div>' +
        '<div class="wk-card-foot"><span>' + done + ' / ' + items.length + ' done</span>' + (grad ? '<span class="wk-card-deliv">\u270f\ufe0f ' + esc(grad.label.split('\u2014')[0].trim()) + '</span>' : '') + '</div></a>';
    }
    host.innerHTML = html;
  }

  function renderHubSchedule() {
    const host = $('#hubSchedule'); if (!host) return;
    const ms = window.COURSE.items.filter(i => i.type === 'live' || (i.type === 'assignment' && i.required)).sort((a, b) => parseDue(a.due) - parseDue(b.due));
    let html = '<table class="sched-table"><tbody>';
    ms.forEach(i => {
      const real = parseDue(i.due), isEvent = i.dueType === 'event';
      const shown = isEvent ? fmtDateTime(real) : fmtDay(new Date(real.getTime() - DAY));
      html += '<tr class="' + (HUB.has(i.id) ? 'done' : '') + '"><td class="sched-icon">' + (i.type === 'live' ? '\ud83d\udcac' : '\u270f\ufe0f') + '</td>' +
        '<td class="sched-date">' + shown + (isEvent ? '' : ' <span class="sched-real">due ' + fmtDay(real) + '</span>') + '</td>' +
        '<td class="sched-label">' + (i.url ? smartLink(i.url, i.label) : esc(i.label)) + ' <span class="sched-wk">W' + i.week + '</span></td>' +
        '<td class="sched-kind">' + (i.type === 'assignment' ? esc((i.note || '').split('\u00b7')[0].trim()) : 'Zoom') + '</td></tr>';
    });
    host.innerHTML = html + '</tbody></table>';
  }

  function updateHubProgress() {
    const all = window.COURSE.items.filter(i => i.week !== PLAN_WEEK);
    const total = all.length, done = all.filter(i => HUB.has(i.id)).length;
    const pct = total ? Math.round(done / total * 100) : 0;
    const remain = all.filter(i => !HUB.has(i.id)).reduce((a, i) => a + (i.effort || 0), 0);
    const totalMin = all.reduce((a, i) => a + (i.effort || 0), 0);
    const set = (id, v) => { const e = $('#' + id); if (e) e.textContent = v; };
    const wid = (id, v) => { const e = $('#' + id); if (e) e.style.width = v; };
    set('hubDone', done); set('hubTotal', total); set('hubPct', pct + '%'); wid('hubFill', pct + '%'); colorProgressBar('hubFill', 'hubPct', pct);
    set('hubTime', pct === 100 ? 'Course complete \ud83c\udf89' : '\u2248 ' + fmtDur(remain) + ' of ' + fmtDur(totalMin) + ' left');
    set('hubPillText', done + ' of ' + total + ' done'); wid('hubPillFill', pct + '%');
    set('hubTimePill', '\u23f1 ~' + fmtDur(totalMin) + ' total');
    set('hubRemainPill', remain ? '\u23f3 ~' + fmtDur(remain) + ' left' : '\u2705 All done');
    const now = new Date();
    const up = window.COURSE.items.filter(i => i.required && (i.type === 'assignment' || i.type === 'live') && parseDue(i.due) >= now).sort((a, b) => parseDue(a.due) - parseDue(b.due))[0];
    const short = up ? (MILESTONE_SHORT[up.id] || up.label.split('\u2014')[0].trim()) : '';
    set('hubNext', up ? '\u23f3 ' + short + ' \u2014 ' + daysWord(parseDue(up.due), now) : '\u23f3 term complete');
  }

  function hubApply() { updateHubProgress(); renderHubPinned(); renderHubFinish(); renderHubWeeks(); renderHubSchedule(); }
  async function loadHubRemote() {
    window.COURSE.items.forEach(i => { if (lsGet(i.id) === '1') HUB.add(i.id); });
    hubApply();
    if (!SB_ON) return;
    try { const r = await fetch(SB_URL + '/rest/v1/' + SB_TABLE + '?select=id,checked', { headers: SB_HEADERS }); if (!r.ok) return; (await r.json()).forEach(({ id, checked }) => { if (checked) HUB.add(id); else HUB.delete(id); }); hubApply(); } catch (e) {}
  }
  function subscribeHubRealtime() {
    if (!SB_ON || !window.supabase) return;
    try { window.supabase.createClient(SB_URL, SB_KEY).channel('sync-hub').on('postgres_changes', { event: '*', schema: 'public', table: SB_TABLE }, p => { const row = p.new; if (!row || !row.id) return; if (row.checked) HUB.add(row.id); else HUB.delete(row.id); hubApply(); }).subscribe(); } catch (e) {}
  }
})();
