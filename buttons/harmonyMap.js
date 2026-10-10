/* YouChords Harmony Map — draggable live transition map and complete chord atlas. */
(() => {
  'use strict';

  if (window.ycHarmonyMap) return;

  const STORAGE_KEY = 'harmonyMapEnabled';
  const LAYOUT_KEY = 'harmonyMapLayout';
  const ROOT_RE = /^([A-G](?:#|b)?)/;
  const NOTE_VALUES = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  const FAMILY_COLORS = {
    basic: ['#202a3b', '#50648f', '#d6e0ff'],
    sixth: ['#2d233b', '#72548f', '#eadbff'],
    seventh: ['#183331', '#34776f', '#c9fff4'],
    extended: ['#1c342a', '#3d7a5a', '#d2ffe4'],
    suspended: ['#393020', '#8d7140', '#ffedc9'],
    altered: ['#3a222c', '#8d4b61', '#ffe0e9']
  };
  const NETWORK_ROOT_PITCHES = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
  const NETWORK_QUALITIES = ['', 'm', '7', 'maj7', 'm7', 'dim', 'sus4'];
  const NETWORK_VIEW = { size:660, center:330, anchorRadius:230, clusterRadius:43, nodeRadius:12 };
  const NS = 'http://www.w3.org/2000/svg';

  let host = null;
  let shadow = null;
  let svg = null;
  let chordNames = [];
  let baseNames = [];
  let roots = [];
  const pitchClassCache = new Map();
  let loadPromise = null;
  let pollId = null;
  let resizeObserver = null;
  let enableRequestVersion = 0;
  let activationSyncInProgress = false;
  let currentChord = '';
  let selectedChord = '';
  let mode = 'transitions';
  let atlasRoot = 'C';
  let atlasFamily = 'all';
  let expandedBase = '';
  let locked = false;
  let isEnabled = false;
  let restoringLayout = false;
  let saveLayoutTimer = null;

  const rootOf = (name) => ROOT_RE.exec(String(name || '').split('/')[0])?.[1] || '';
  const qualityOf = (name) => String(name || '').split('/')[0].slice(rootOf(name).length);
  const baseOf = (name) => String(name || '').split('/')[0];
  const familyOf = (quality) => {
    if (['', 'm', '5', 'dim', 'aug'].includes(quality)) return 'basic';
    if (/sus|add/i.test(quality)) return 'suspended';
    if (/^(m)?6(?:$|add9$)/.test(quality)) return 'sixth';
    if (/[#b]/.test(quality) || /^aug/i.test(quality)) return 'altered';
    if (/(9|11|13)/.test(quality)) return 'extended';
    return 'seventh';
  };

  function createPanel() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'yc-harmony-map-host';
    host.setAttribute('aria-label', 'YouChords harmony map');
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { position:fixed; z-index:2147483000; display:block; width:600px; height:700px; min-width:310px; min-height:350px; max-width:calc(100vw - 16px); max-height:calc(100vh - 16px); resize:both; overflow:hidden; color:#f3f5fa; font:12px/1.4 Inter,"Segoe UI",Arial,sans-serif; direction:rtl; }
        :host([hidden]) { display:none !important; }
        * { box-sizing:border-box; }
        .panel { width:100%; height:100%; display:flex; flex-direction:column; overflow:hidden; position:relative; border:1px solid #394352; border-radius:16px; background:linear-gradient(155deg,rgba(21,25,34,.985),rgba(12,15,21,.985)); box-shadow:0 18px 55px #000b, inset 0 1px #ffffff0d; }
        .head { min-height:43px; display:flex; align-items:center; gap:7px; padding:7px 10px; border-bottom:1px solid #272e3a; background:#11151ceF; cursor:grab; user-select:none; touch-action:none; }
        .head:active { cursor:grabbing; }
        .brand { margin-inline-end:auto; font-size:10px; font-weight:800; letter-spacing:.04em; color:#dbe3ef; white-space:nowrap; }
        .brand span { color:#64e2ce; }
        button,select,input { font:inherit; color:inherit; }
        button { cursor:pointer; }
        .icon { width:27px; height:27px; display:grid; place-items:center; border:1px solid #303947; border-radius:8px; background:#1a202a; color:#d0d8e4; padding:0; font-size:14px; }
        .icon:hover,.icon[aria-pressed="true"] { border-color:#64e2ce; color:#8cf0dc; background:#17312e; }
        .tools { display:flex; align-items:center; gap:6px; padding:9px 10px 7px; }
        .tab { min-height:30px; flex:1; border:1px solid #303846; border-radius:8px; background:#171c25; color:#aeb8c7; font-size:10px; font-weight:700; }
        .tab[aria-selected="true"] { color:#bffff2; border-color:#367a70; background:#18312e; }
        .root-select { width:88px; height:30px; border:1px solid #303846; border-radius:8px; background:#171c25; padding:0 7px; font-size:10px; }
        .search-wrap { position:relative; flex:1.2; min-width:95px; }
        .families[hidden],.search-wrap[hidden] { display:none !important; }
        .search { width:100%; height:30px; border:1px solid #303846; border-radius:8px; background:#11161e; padding:0 9px; font-size:10px; outline:none; }
        .search:focus { border-color:#64e2ce; }
        .results { position:absolute; z-index:5; top:33px; inset-inline:0; max-height:190px; overflow:auto; border:1px solid #394454; border-radius:9px; background:#11151c; box-shadow:0 14px 28px #000a; }
        .results:empty { display:none; }
        .result { width:100%; min-height:31px; display:flex; justify-content:space-between; align-items:center; padding:5px 9px; border:0; border-bottom:1px solid #252c37; background:transparent; text-align:start; font-size:10px; }
        .result:hover { background:#202936; }
        .result small { color:#8793a3; }
        .families { display:flex; gap:5px; overflow-x:auto; padding:0 10px 7px; scrollbar-width:thin; }
        .family { flex:0 0 auto; min-height:24px; padding:0 8px; border:1px solid #303846; border-radius:999px; background:#171c25; color:#aeb8c7; font-size:9px; }
        .family[aria-pressed="true"] { border-color:#6684bf; background:#202b43; color:#dce7ff; }
        .status { min-height:24px; padding:3px 11px; color:#98a5b6; font-size:9px; }
        .status b { color:#ff829b; direction:ltr; unicode-bidi:isolate; }
        .viewport { flex:1; min-height:0; overflow:auto; margin:0 8px 8px; border:1px solid #252d39; border-radius:11px; background:radial-gradient(ellipse at 50% 45%,#26394a32,transparent 67%),#10141b; scrollbar-color:#465264 #141a23; scrollbar-width:thin; }
        svg { display:block; width:100%; min-height:100%; overflow:visible; }
        svg.harmony-network { height:100%; min-height:0; }
        .edge { fill:none; stroke:#415061; stroke-width:1.5; opacity:.7; stroke-linecap:round; marker-end:url(#yc-arrow); vector-effect:non-scaling-stroke; }
        .edge.fifths { stroke:#566477; stroke-width:1.1; opacity:.42; }
        .edge.family { stroke:#657283; stroke-width:1; opacity:.27; }
        .edge.relative { stroke:#a87bc9; stroke-width:1.5; opacity:.62; }
        .edge.resolution { stroke:#dab866; stroke-width:1.8; opacity:.74; marker-end:url(#yc-arrow); }
        .edge.suggested { stroke:#a6ef5b; stroke-width:2.7; opacity:1; filter:drop-shadow(0 0 3px #a6ef5b88); marker-end:url(#yc-arrow); }
        .edge.route { stroke:#89aaff; stroke-width:3.5; opacity:1; }
        .ring { fill:none; stroke:#293340; stroke-width:1; opacity:.62; vector-effect:non-scaling-stroke; }
        .hub { fill:#171d27; stroke:#586779; stroke-width:1.5; vector-effect:non-scaling-stroke; }
        .hub-text { fill:#dce5f0; text-anchor:middle; dominant-baseline:central; font:700 12px Inter,"Segoe UI",Arial,sans-serif; }
        .hub-caption { fill:#8492a4; text-anchor:middle; dominant-baseline:central; font:8px Inter,"Segoe UI",Arial,sans-serif; }
        .node { cursor:pointer; transition:filter .16s ease,opacity .16s ease; }
        .node:hover { filter:brightness(1.32) drop-shadow(0 0 7px #74e8d377); }
        .node circle { stroke-width:1.7; }
        .node.basic circle { fill:#202a3b; stroke:#50648f; }
        .node.sixth circle { fill:#2d233b; stroke:#72548f; }
        .node.seventh circle { fill:#183331; stroke:#34776f; }
        .node.extended circle { fill:#1c342a; stroke:#3d7a5a; }
        .node.suspended circle { fill:#393020; stroke:#8d7140; }
        .node.altered circle { fill:#3a222c; stroke:#8d4b61; }
        .node.home circle { fill:#263341; stroke:#46596b; }
        .node.near circle { fill:#202c38; stroke:#364858; }
        .node.far { opacity:.76; }
        .node.far circle { fill:#171e29; stroke:#293746; }
        .node text { pointer-events:none; text-anchor:middle; dominant-baseline:central; font-family:Inter,"Segoe UI",Arial,sans-serif; font-weight:700; fill:#e6edf7; }
        .node.current circle { fill:#482332; stroke:#ff718e; stroke-width:3; }
        .node.current text { fill:#fff0f3; font-size:17px; }
        .node.candidate circle { fill:#153a38; stroke:#62dfc9; stroke-width:2.5; }
        .node.candidate text { fill:#bffff2; font-size:13px; }
        .node.compact text { font-size:12px; }
        .node.compact.current text { font-size:13px; }
        .node.compact.candidate text { font-size:10px; }
        .node.unrelated { opacity:.42; }
        .node.chosen circle { fill:#203a5c; stroke:#88aaff; stroke-width:3; }
        .node.atlas rect { stroke-width:1.5; }
        .node.atlas text { font-size:11px; }
        .node.slash text { font-size:10px; }
        .node.filtered { opacity:.12; pointer-events:none; }
        .empty { min-height:100%; display:grid; place-items:center; padding:28px; color:#94a0b0; text-align:center; font-size:12px; line-height:1.6; }
        .detail { min-height:46px; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:7px 11px; border-top:1px solid #272e3a; background:#11151c; }
        .detail-main { min-width:0; }
        .route { direction:ltr; unicode-bidi:isolate; color:#64e2ce; font-weight:800; font-size:11px; }
        .reason { margin-top:2px; overflow:hidden; color:#929baa; font-size:9px; text-overflow:ellipsis; white-space:nowrap; }
        .badge { flex:0 0 auto; color:#aab4c2; font-size:9px; }
        .resize-hint { position:absolute; bottom:2px; right:2px; width:12px; height:12px; opacity:.45; pointer-events:none; background:linear-gradient(135deg,transparent 42%,#aab4c2 44%,#aab4c2 51%,transparent 53%,transparent 64%,#aab4c2 66%,#aab4c2 72%,transparent 74%); }
        :host([data-locked="true"]) { resize:none; }
        :host([data-locked="true"]) .head { cursor:default; touch-action:auto; }
        @media(prefers-reduced-motion:reduce) { *,*::before,*::after { transition:none!important; } }
      </style>
      <section class="panel" aria-label="מפת מעברי אקורדים">
        <header class="head">
          <div class="brand">YOUCHORDS <span>/ HARMONY</span></div>
          <button class="icon side" type="button" title="העבר לצד השני" aria-label="העבר לצד השני">⇄</button>
          <button class="icon lock" type="button" aria-pressed="false" title="נעל מיקום וגודל" aria-label="נעל מיקום וגודל">🔓</button>
          <button class="icon close" type="button" title="הסתר את המפה" aria-label="הסתר את המפה">×</button>
        </header>
        <div class="tools">
          <button class="tab" data-mode="transitions" aria-selected="true">מפת מעברים</button>
          <button class="tab" data-mode="atlas" aria-selected="false">כל האקורדים</button>
          <select class="root-select" aria-label="בחירת שורש" hidden></select>
          <div class="search-wrap" hidden><input class="search" type="search" placeholder="חיפוש אקורד, למשל B7" aria-label="חיפוש אקורד"><div class="results" role="listbox"></div></div>
        </div>
        <div class="families" hidden></div>
        <div class="status" aria-live="polite">טוען את מאגר האקורדים…</div>
        <div class="viewport" role="img" aria-label="מפת קשרים בין אקורדים"><svg viewBox="0 0 700 500" aria-hidden="true"></svg></div>
        <footer class="detail" aria-live="polite"><div class="detail-main"><div class="route">בחר אקורד במפה</div><div class="reason">האקורד הנוכחי והצעות המעבר יוצגו כאן</div></div><span class="badge">YouChords</span></footer>
        <i class="resize-hint" aria-hidden="true"></i>
      </section>`;
    document.documentElement.appendChild(host);
    svg = shadow.querySelector('svg');
    bindControls();
    restoreLayout();
  }

  function svgEl(tag, attrs = {}, text = '') {
    const el = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
    if (text) el.textContent = text;
    return el;
  }

  function prepareSvg(viewBox) {
    svg.replaceChildren();
    svg.setAttribute('viewBox', viewBox);
    const [, , width, height] = viewBox.split(/\s+/).map(Number);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const defs = svgEl('defs');
    const marker = svgEl('marker', { id:'yc-arrow', markerWidth:8, markerHeight:8, refX:7, refY:4, orient:'auto', markerUnits:'strokeWidth' });
    marker.append(svgEl('path', { d:'M0,0 L8,4 L0,8 z', fill:'#60d8c5' }));
    defs.append(marker);
    svg.append(defs);
  }

  function nodeGroup({ x, y, name, family = 'basic', kind = 'normal', selected = false, current = false, candidate = false, compact = false, width = 58, height = 48, radius = 25, onClick }) {
    const group = svgEl('g', { class:`node ${family} ${kind}${compact ? ' compact' : ''}${selected ? ' chosen' : ''}${current ? ' current' : ''}${candidate ? ' candidate' : ''}`, tabindex:0, role:'button', 'aria-label':name });
    if (kind === 'atlas' || kind === 'slash') {
      const palette = FAMILY_COLORS[family] || FAMILY_COLORS.basic;
      group.append(svgEl('rect', { x:x-width/2, y:y-height/2, width, height, rx:10, fill:palette[0], stroke:palette[1] }));
      group.append(svgEl('text', { x, y:y+1, 'font-size':name.length > 9 ? 9 : 11 }, name));
    } else {
      const nodeRadius = current ? (compact ? Math.max(18, radius + 6) : Math.max(36, radius + 8)) : candidate ? (compact ? Math.max(16, radius + 4) : Math.max(31, radius + 5)) : radius;
      group.append(svgEl('circle', { cx:x, cy:y, r:nodeRadius }));
      group.append(svgEl('text', { x, y:y+1, 'font-size':compact ? (name.length > 5 ? 8 : 10) : (name.length > 6 ? 10 : 13) }, name));
    }
    const activate = (event) => { event.stopPropagation(); onClick?.(); };
    group.addEventListener('click', activate);
    group.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(event); }
    });
    return group;
  }

  function bindControls() {
    shadow.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => {
      mode = button.dataset.mode;
      selectedChord = '';
      expandedBase = '';
      render();
    }));
    const rootSelect = shadow.querySelector('.root-select');
    rootSelect.addEventListener('change', () => { atlasRoot = rootSelect.value; expandedBase = ''; render(); });
    shadow.querySelector('.families').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-family]');
      if (!button) return;
      atlasFamily = button.dataset.family;
      expandedBase = '';
      render();
    });
    const search = shadow.querySelector('.search');
    search.addEventListener('input', () => renderSearch(search.value));
    search.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') shadow.querySelector('.result')?.click();
      if (event.key === 'Escape') { search.value = ''; renderSearch(''); search.blur(); }
      event.stopPropagation();
    });
    shadow.querySelector('.close').addEventListener('click', () => {
      chrome.storage.sync.set({ [STORAGE_KEY]: false });
      setEnabled(false);
    });
    shadow.querySelector('.lock').addEventListener('click', () => {
      locked = !locked;
      updateLockUi();
      saveLayout();
    });
    shadow.querySelector('.side').addEventListener('click', flipSide);

    const head = shadow.querySelector('.head');
    head.addEventListener('pointerdown', startDrag);
    host.addEventListener('pointerdown', (event) => event.stopPropagation());
    host.addEventListener('click', (event) => event.stopPropagation());
    resizeObserver = new ResizeObserver(() => {
      if (mode === 'atlas' && chordNames.length) renderAtlas();
      if (!restoringLayout) scheduleSaveLayout();
    });
    resizeObserver.observe(host);
    window.addEventListener('resize', followPlayer, { passive:true });
    window.addEventListener('scroll', followPlayer, { passive:true, capture:true });
    document.addEventListener('click', (event) => {
      if (!event.target.closest?.('.ytp-chords-button')) return;
      setTimeout(() => { void syncActivationState(); }, 0);
    }, true);
    window.addEventListener('yt-navigate-finish', onVideoNavigation);
  }

  let dragPointerId = null;
  function startDrag(event) {
    if (locked || event.button !== 0 || event.target.closest('button')) return;
    dragPointerId = event.pointerId;
    const rect = host.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const left = rect.left;
    const top = rect.top;
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (moveEvent) => {
      if (moveEvent.pointerId !== dragPointerId) return;
      if (Math.abs(moveEvent.clientX - startX) > 2 || Math.abs(moveEvent.clientY - startY) > 2) {
        host.dataset.detached = 'true';
        delete host.dataset.offsetX;
        delete host.dataset.offsetY;
      }
      setPosition(left + moveEvent.clientX - startX, top + moveEvent.clientY - startY);
    };
    const clear = (endEvent) => {
      if (endEvent.pointerId !== dragPointerId) return;
      dragPointerId = null;
      event.currentTarget.removeEventListener('pointermove', move);
      event.currentTarget.removeEventListener('pointerup', clear);
      event.currentTarget.removeEventListener('pointercancel', clear);
      saveLayout();
    };
    event.currentTarget.addEventListener('pointermove', move);
    event.currentTarget.addEventListener('pointerup', clear);
    event.currentTarget.addEventListener('pointercancel', clear);
    event.preventDefault();
    event.stopPropagation();
  }

  function updateLockUi() {
    if (!host) return;
    host.dataset.locked = String(locked);
    const button = shadow.querySelector('.lock');
    button.setAttribute('aria-pressed', String(locked));
    button.title = locked ? 'בטל נעילה של המיקום והגודל' : 'נעל מיקום וגודל';
    button.setAttribute('aria-label', button.title);
    button.textContent = locked ? '🔒' : '🔓';
  }

  function setPosition(left, top) {
    const width = host.offsetWidth || 430;
    const height = host.offsetHeight || 540;
    host.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, left))}px`;
    host.style.top = `${Math.max(8, Math.min(window.innerHeight - height - 8, top))}px`;
    host.style.right = 'auto';
    host.style.bottom = 'auto';
  }

  function getPlayerRect() {
    const rect = document.querySelector('#movie_player')?.getBoundingClientRect?.();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
  }

  function chordButtonIsActive() {
    return window.chordsActive === true || Boolean(document.querySelector('.ytp-chords-button.chords-active'));
  }

  function playerIsVisible(player = getPlayerRect()) {
    return Boolean(player && player.bottom > 0 && player.top < window.innerHeight && player.right > 0 && player.left < window.innerWidth);
  }

  function syncPanelVisibility() {
    if (!host) return false;
    const detached = host.dataset.detached === 'true';
    const shouldShow = isEnabled && chordButtonIsActive() && (detached || playerIsVisible());
    const changed = host.hidden === shouldShow;
    host.hidden = !shouldShow;
    return changed;
  }

  function followPlayer() {
    if (!host || !isEnabled) return;
    const detached = host.dataset.detached === 'true';
    if (detached) {
      const rect = host.getBoundingClientRect();
      setPosition(rect.left, rect.top);
      syncPanelVisibility();
      return;
    }
    const player = getPlayerRect();
    syncPanelVisibility();
    if (!player || !playerIsVisible(player)) return;
    const rect = host.getBoundingClientRect();
    const offsetX = Number(host.dataset.offsetX);
    const offsetY = Number(host.dataset.offsetY);
    if (Number.isFinite(offsetX) && Number.isFinite(offsetY)) {
      const nextX = Math.min(offsetX, Math.max(8, player.width - rect.width - 8));
      const nextY = Math.min(offsetY, Math.max(8, player.height - rect.height - 8));
      host.dataset.offsetX = String(nextX);
      host.dataset.offsetY = String(nextY);
      setPosition(player.left + nextX, player.top + nextY);
    }
  }

  function flipSide() {
    if (locked) return;
    const rect = host.getBoundingClientRect();
    if (host.dataset.detached === 'true') {
      const nextLeft = rect.left + rect.width / 2 < window.innerWidth / 2
        ? window.innerWidth - rect.width - 16
        : 16;
      setPosition(nextLeft, rect.top);
      saveLayout();
      return;
    }
    const player = getPlayerRect();
    const currentOffset = player ? rect.left - player.left : rect.left;
    const nextOffset = player
      ? (currentOffset < player.width / 2 ? player.width - rect.width - 16 : 16)
      : (rect.left + rect.width / 2 < window.innerWidth / 2 ? window.innerWidth - rect.width - 16 : 16);
    setPosition((player?.left || 0) + nextOffset, rect.top);
    if (player) host.dataset.offsetX = String(nextOffset);
    saveLayout();
  }

  async function restoreLayout() {
    restoringLayout = true;
    try {
      const result = await chrome.storage.sync.get([LAYOUT_KEY]);
      const saved = result[LAYOUT_KEY];
      if (saved && typeof saved === 'object') {
        const isOldDefaultSize = (saved.width === 430 && saved.height === 540) || (saved.width === 560 && saved.height === 620);
        const savedWidth = isOldDefaultSize ? 600 : saved.width;
        const savedHeight = isOldDefaultSize ? 700 : saved.height;
        if (Number.isFinite(savedWidth)) host.style.width = `${Math.max(310, Math.min(window.innerWidth - 16, savedWidth))}px`;
        if (Number.isFinite(savedHeight)) host.style.height = `${Math.max(350, Math.min(window.innerHeight - 16, savedHeight))}px`;
        if (saved.detached === true && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
          host.dataset.detached = 'true';
          setPosition(saved.left, saved.top);
        } else if (Number.isFinite(saved.offsetX) && Number.isFinite(saved.offsetY)) {
          host.dataset.detached = 'false';
          host.dataset.offsetX = String(saved.offsetX);
          host.dataset.offsetY = String(saved.offsetY);
          const player = getPlayerRect();
          setPosition((player?.left || 0) + saved.offsetX, (player?.top || 0) + saved.offsetY);
        } else if (Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
          host.dataset.detached = 'true';
          setPosition(saved.left, saved.top);
        }
        locked = saved.locked === true;
      } else {
        host.dataset.detached = 'false';
        const player = getPlayerRect();
        if (player) {
          const left = Math.max(8, player.width - host.offsetWidth - 16);
          host.dataset.offsetX = String(left);
          host.dataset.offsetY = '16';
          setPosition(player.left + left, player.top + 16);
        } else {
          host.style.top = '16px';
          host.style.right = '16px';
          host.style.left = 'auto';
          host.style.bottom = 'auto';
        }
      }
      updateLockUi();
    } catch (error) {
      console.warn('[HarmonyMap] Could not restore panel layout:', error);
    } finally {
      requestAnimationFrame(() => {
        restoringLayout = false;
        followPlayer();
        void syncActivationState();
      });
    }
  }

  function scheduleSaveLayout() {
    clearTimeout(saveLayoutTimer);
    saveLayoutTimer = setTimeout(saveLayout, 250);
  }

  function saveLayout() {
    if (!host || restoringLayout) return;
    const rect = host.getBoundingClientRect();
    const player = getPlayerRect();
    const detached = host.dataset.detached === 'true';
    const layout = { width:rect.width, height:rect.height, locked, detached };
    if (!detached && player) {
      layout.offsetX = rect.left - player.left;
      layout.offsetY = rect.top - player.top;
      host.dataset.offsetX = String(layout.offsetX);
      host.dataset.offsetY = String(layout.offsetY);
    } else {
      layout.left = rect.left;
      layout.top = rect.top;
    }
    chrome.storage.sync.set({ [LAYOUT_KEY]: layout });
  }

  async function loadChordIndex() {
    if (chordNames.length) return chordNames;
    if (!loadPromise) {
      loadPromise = (async () => {
        if (!window.COMPLETE_CHORDS) {
          await import(chrome.runtime.getURL('data/chords.complete.js'));
        }
        if (!window.COMPLETE_CHORDS) throw new Error('Chord catalog did not initialize');
        chordNames = Object.keys(window.COMPLETE_CHORDS).sort((a, b) => a.localeCompare(b, 'en', { numeric:true, sensitivity:'base' }));
        baseNames = chordNames.filter((name) => !name.includes('/'));
        roots = [...new Set(baseNames.map(rootOf).filter(Boolean))];
        roots.sort((a, b) => (NOTE_VALUES[a] ?? 99) - (NOTE_VALUES[b] ?? 99) || a.localeCompare(b));
        atlasRoot = roots.includes('C') ? 'C' : roots[0] || 'C';
        const select = shadow.querySelector('.root-select');
        select.replaceChildren(...roots.map((root) => {
          const option = document.createElement('option');
          option.value = root;
          option.textContent = `שורש ${root}`;
          return option;
        }));
        select.value = atlasRoot;
        buildFamilyButtons();
        return chordNames;
      })().catch((error) => { loadPromise = null; throw error; });
    }
    return loadPromise;
  }

  function buildFamilyButtons() {
    const container = shadow.querySelector('.families');
    const entries = [['all','הכול'],['basic','בסיסיים'],['sixth','6'],['seventh','7'],['extended','מורחבים'],['suspended','sus / add'],['altered','משתנים']];
    container.replaceChildren(...entries.map(([family, label]) => {
      const button = document.createElement('button');
      button.className = 'family';
      button.dataset.family = family;
      button.textContent = label;
      button.setAttribute('aria-pressed', String(atlasFamily === family));
      return button;
    }));
  }

  function activeSongChord() {
    const songData = window.chordsDisplay?.currentSongData;
    const currentVideoId = new URLSearchParams(window.location.search).get('v');
    if (songData?.videoId && currentVideoId && songData.videoId !== currentVideoId) return '';
    const chords = songData?.chords;
    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    if (!Array.isArray(chords) || !chords.length || !video) return '';
    const time = Number(video.currentTime) || 0;
    let found = null;
    for (const chord of chords) {
      const chordTime = Number(chord?.time);
      if (Number.isFinite(chordTime) && chordTime <= time && (!found || chordTime >= found.time)) {
        found = { time:chordTime, name:String(chord?.name || '').trim() };
      }
    }
    return found?.name || '';
  }

  function onVideoNavigation() {
    currentChord = '';
    selectedChord = '';
    expandedBase = '';
    updateCurrentChord();
  }

  function updateCurrentChord() {
    if (!host || host.hidden) return;
    const next = activeSongChord();
    if (next === currentChord) return;
    currentChord = next;
    if (mode === 'transitions') selectedChord = '';
    render();
  }

  async function syncActivationState() {
    if (!host || activationSyncInProgress) return;
    const wasHidden = syncPanelVisibility();
    if (host.hidden) return;
    if (!chordNames.length) {
      activationSyncInProgress = true;
      shadow.querySelector('.viewport').innerHTML = '<div class="empty">טוען את כל שמות האקורדים והווריאציות…</div>';
      try {
        await loadChordIndex();
      } catch (error) {
        console.error('[HarmonyMap] Failed to load chord catalog:', error);
        if (isEnabled && chordButtonIsActive()) {
          shadow.querySelector('.viewport').innerHTML = '<div class="empty">לא הצלחתי לטעון את מאגר האקורדים. נסו לרענן את YouTube.</div>';
          shadow.querySelector('.status').textContent = 'טעינת מאגר האקורדים נכשלה';
        }
        return;
      } finally {
        activationSyncInProgress = false;
      }
    }
    if (!isEnabled || !chordButtonIsActive()) {
      syncPanelVisibility();
      return;
    }
    if (wasHidden) render();
    updateCurrentChord();
  }

  function chordPitch(name) { return NOTE_VALUES[rootOf(name)]; }

  function rootForPitch(pitch, preferFlats) {
    const choices = roots.filter((root) => NOTE_VALUES[root] === ((pitch % 12) + 12) % 12);
    if (!choices.length) return '';
    return choices.find((root) => preferFlats ? root.includes('b') : root.includes('#')) || choices[0];
  }

  function likelyKeyPitchForChord(name) {
    const pitch = chordPitch(name);
    if (pitch == null) return null;
    const quality = qualityOf(name).toLowerCase();
    const offset = /^(?:7|9|11|13|aug7)/.test(quality) && !/maj/.test(quality) ? 5 : /dim|m7b5|mb5/.test(quality) ? 1 : /^m(?!aj)/.test(quality) ? 3 : 0;
    return (pitch + offset) % 12;
  }

  function prefersFlatsForKey(pitch) {
    return [1,3,5,6,8,10].includes(((pitch % 12) + 12) % 12);
  }

  function prefersFlatSpellingForChord(name) {
    const root = rootOf(name);
    if (root.includes('b')) return true;
    if (root.includes('#')) return false;
    const keyPitch = likelyKeyPitchForChord(name);
    return keyPitch != null && prefersFlatsForKey(keyPitch);
  }

  function chordPitchClasses(name) {
    const base = baseOf(name);
    if (pitchClassCache.has(base)) return pitchClassCache.get(base);
    const rootPitch = chordPitch(base);
    if (rootPitch == null) return new Set();
    const quality = qualityOf(base).toLowerCase();
    const isMinor = /^m(?!aj)/.test(quality);
    const isDiminished = /dim|m7b5|mb5/.test(quality);
    const isAugmented = /aug|#5/.test(quality);
    const isSus2 = /sus2/.test(quality);
    const isSus4 = /sus4/.test(quality);
    let intervals = isDiminished ? [0,3,6] : isAugmented ? [0,isMinor ? 3 : 4,8] : isSus2 ? [0,2,7] : isSus4 ? [0,5,7] : isMinor ? [0,3,7] : quality === '5' ? [0,7] : [0,4,7];
    if (/b5/.test(quality) && !isDiminished) intervals = intervals.map((value) => value === 7 ? 6 : value);
    if (/^dim7/.test(quality)) intervals = [0,3,6,9];
    else if (/m7b5|mb5/.test(quality)) intervals = [0,3,6,10];
    else if (/^(?:maj|mmaj)(?:7|9|11|13)/.test(quality)) intervals.push(11);
    else if (/^(?:m(?:7|9|11|13)|7|9|11|13|aug7)/.test(quality)) intervals.push(10);
    if (/6/.test(quality)) intervals.push(9);
    if (/add9|maj9|m9|^9/.test(quality)) intervals.push(/b9/.test(quality) ? 1 : /#9/.test(quality) ? 3 : 2);
    if (/11/.test(quality)) intervals.push(/#11/.test(quality) ? 6 : 5);
    if (/13/.test(quality)) intervals.push(9);
    if (/b9/.test(quality)) intervals.push(1);
    if (/#9/.test(quality)) intervals.push(3);
    if (/#5/.test(quality) && !isAugmented) intervals = intervals.map((value) => value === 7 ? 8 : value);
    const pitchClasses = new Set(intervals.map((interval) => (rootPitch + interval) % 12));
    pitchClassCache.set(base, pitchClasses);
    return pitchClasses;
  }

  function buildNetworkChordNames(current = '') {
    const preferFlats = prefersFlatSpellingForChord(current);
    const names = [];
    for (const pitch of NETWORK_ROOT_PITCHES) {
      const root = rootForPitch(pitch, preferFlats);
      if (!root) continue;
      for (const quality of NETWORK_QUALITIES) {
        const name = root + quality;
        if (baseNames.includes(name)) names.push(name);
      }
    }
    return [...new Set(names)];
  }

  function transitionScore(from, to) {
    const rootFrom = rootOf(from);
    const rootTo = rootOf(to);
    const pitchFrom = chordPitch(from);
    const pitchTo = chordPitch(to);
    if (pitchFrom == null || pitchTo == null) return 0;
    const fromQuality = qualityOf(from).toLowerCase();
    const toQuality = qualityOf(to).toLowerCase();
    const fromTones = chordPitchClasses(from);
    const toTones = chordPitchClasses(to);
    let commonTones = 0;
    fromTones.forEach((pitch) => { if (toTones.has(pitch)) commonTones += 1; });
    const interval = (pitchTo - pitchFrom + 12) % 12;
    let score = commonTones * 0.42 + commonTones / Math.max(1, Math.min(fromTones.size, toTones.size));
    if (rootFrom === rootTo) score += 1.25;
    if (fromQuality === toQuality && (interval === 5 || interval === 7)) score += 1.2;
    if ((interval === 5 || interval === 7)) score += 1.55;
    const fromDominant = /^(?:7|9|11|13|aug7)/.test(fromQuality) && !/maj/.test(fromQuality);
    if (fromDominant && interval === 5 && !/(?:dim|aug|sus)/.test(toQuality)) score += 5.5;
    const fromMinor = /^m(?!aj)/.test(fromQuality);
    const toMinor = /^m(?!aj)/.test(toQuality);
    const fromMajorTriad = !fromQuality || fromQuality === 'maj' || fromQuality === '5';
    const toMajorTriad = !toQuality || toQuality === 'maj' || toQuality === '5';
    if ((fromMajorTriad && toMinor && interval === 9) || (fromMinor && toMajorTriad && interval === 3)) score += 3.6;
    if (fromMajorTriad && toMinor && interval === 2) score += 2.65;
    if (fromMajorTriad && toMinor && interval === 4) score += 2.1;
    if (fromMinor && /dim/.test(toQuality) && interval === 2) score += 2.35;
    if (fromMinor && toMinor && interval === 5) score += 1.8;
    if (fromDominant && interval === 5 && toMajorTriad) score += 1.4;
    if (commonTones >= 2) score += 0.65;
    if (/sus|add9/.test(toQuality)) score += 0.12;
    return score;
  }

  function diatonicCandidateNamesFor(name, networkNames) {
    const current = baseOf(name);
    const currentPitch = chordPitch(current);
    if (currentPitch == null) return [];
    const quality = qualityOf(current).toLowerCase();
    const isDominant = /^(?:7|9|11|13|aug7)/.test(quality) && !/maj/.test(quality);
    const isDiminished = /dim|m7b5|mb5/.test(quality);
    const isMinor = /^m(?!aj)/.test(quality);
    const keyPitch = (currentPitch + (isDominant ? 5 : isDiminished ? 1 : isMinor ? 3 : 0)) % 12;
    const majorScaleChords = [[0,''],[2,'m'],[4,'m'],[5,''],[7,''],[9,'m'],[11,'dim']];
    const result = [];
    for (const [degree, chordQuality] of majorScaleChords) {
      const root = rootForPitch(keyPitch + degree, prefersFlatSpellingForChord(current));
      const candidate = root + chordQuality;
      if (rootOf(candidate) !== rootOf(current) && networkNames.includes(candidate) && !result.includes(candidate)) result.push(candidate);
    }
    return result;
  }

  function candidateNamesFor(name, networkNames = buildNetworkChordNames(name)) {
    const current = baseOf(name);
    const ranked = networkNames
      .filter((candidate) => candidate !== current && rootOf(candidate) !== rootOf(current))
      .map((candidate) => ({ name:candidate, score:transitionScore(current, candidate) }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    const result = diatonicCandidateNamesFor(current, networkNames);
    const targetRoots = new Set(result.map(rootOf));
    for (const candidate of ranked) {
      if (result.length === 6) break;
      const root = rootOf(candidate.name);
      if (targetRoots.has(root)) continue;
      result.push(candidate.name);
      targetRoots.add(root);
    }
    return result;
  }

  function render() {
    if (!host || host.hidden) return;
    shadow.querySelectorAll('.tab').forEach((button) => button.setAttribute('aria-selected', String(button.dataset.mode === mode)));
    shadow.querySelectorAll('.family').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.family === atlasFamily)));
    const isAtlas = mode === 'atlas';
    shadow.querySelector('.root-select').hidden = !isAtlas;
    shadow.querySelector('.search-wrap').hidden = !isAtlas;
    shadow.querySelector('.families').hidden = !isAtlas;
    const status = shadow.querySelector('.status');
    if (!chordNames.length) {
      status.textContent = 'טוען את מאגר האקורדים…';
      return;
    }
    if (!currentChord) {
      status.innerHTML = 'האקורד המתנגן: <span>אין עדיין אקורדים — הפעילו את כפתור האקורדים בנגן.</span>';
    } else {
      status.innerHTML = `האקורד המתנגן: <b>${escapeHtml(currentChord)}</b> <span>· ${chordNames.length.toLocaleString()} שמות במאגר</span>`;
    }
    if (isAtlas) {
      renderAtlas();
      const visibleCount = baseNames.filter((name) => rootOf(name) === atlasRoot && (atlasFamily === 'all' || familyOf(qualityOf(name)) === atlasFamily)).length;
      status.innerHTML = `${chordNames.length.toLocaleString()} שמות אקורד במאגר · <b>${visibleCount}</b> אקורדים בסיסיים בשורש ${escapeHtml(atlasRoot)}`;
    } else renderTransitions();
    renderDetail();
  }

  function escapeHtml(value) {
    const span = document.createElement('span');
    span.textContent = String(value ?? '');
    return span.innerHTML;
  }

  function renderTransitions() {
    const viewport = shadow.querySelector('.viewport');
    if (viewport.querySelector('.empty')) viewport.innerHTML = '<svg aria-hidden="true"></svg>';
    svg = viewport.querySelector('svg');
    const current = baseOf(currentChord);
    const networkNames = buildNetworkChordNames(current);
    const candidates = new Set(current ? candidateNamesFor(current, networkNames) : []);
    const { size, center, anchorRadius, clusterRadius, nodeRadius } = NETWORK_VIEW;
    prepareSvg(`0 0 ${size} ${size}`);
    svg.classList.add('harmony-network');
    svg.append(svgEl('circle', { cx:center, cy:center, r:anchorRadius, class:'ring' }));
    svg.append(svgEl('circle', { cx:center, cy:center, r:anchorRadius + clusterRadius, class:'ring' }));

    const nodes = [];
    const coords = new Map();
    const byPitchAndQuality = new Map();
    NETWORK_ROOT_PITCHES.forEach((pitch, rootIndex) => {
      const rootAngle = -Math.PI / 2 + rootIndex * Math.PI * 2 / NETWORK_ROOT_PITCHES.length;
      const anchor = { x:center + Math.cos(rootAngle) * anchorRadius, y:center + Math.sin(rootAngle) * anchorRadius };
      NETWORK_QUALITIES.forEach((quality, qualityIndex) => {
        const root = rootForPitch(pitch, prefersFlatSpellingForChord(current));
        const name = root + quality;
        if (!networkNames.includes(name)) return;
        const localAngle = -Math.PI / 2 + Math.max(0, qualityIndex - 1) * Math.PI * 2 / Math.max(1, NETWORK_QUALITIES.length - 1);
        const node = {
          name, pitch, quality, qualityIndex, rootIndex,
          x:qualityIndex === 0 ? anchor.x : anchor.x + Math.cos(localAngle) * clusterRadius,
          y:qualityIndex === 0 ? anchor.y : anchor.y + Math.sin(localAngle) * clusterRadius
        };
        nodes.push(node);
        coords.set(name, node);
        byPitchAndQuality.set(`${pitch}:${quality}`, name);
      });
    });

    const edges = new Map();
    const edgeKey = (from, to) => [from, to].sort((a, b) => a.localeCompare(b)).join('|');
    const addEdge = (from, to, type, suggested = false) => {
      if (!from || !to || from === to) return;
      const a = coords.get(from);
      const b = coords.get(to);
      if (!a || !b) return;
      const key = edgeKey(from, to);
      const existing = edges.get(key);
      if (existing) {
        if (suggested) Object.assign(existing, { from, to, suggested:true });
        else if (!existing.suggested && ['resolution','relative','family','fifths'].indexOf(type) < ['resolution','relative','family','fifths'].indexOf(existing.type)) existing.type = type;
        return;
      }
      edges.set(key, { from, to, type, suggested });
    };

    NETWORK_QUALITIES.forEach((quality) => {
      NETWORK_ROOT_PITCHES.forEach((pitch, rootIndex) => {
        const from = byPitchAndQuality.get(`${pitch}:${quality}`);
        const nextPitch = NETWORK_ROOT_PITCHES[(rootIndex + 1) % NETWORK_ROOT_PITCHES.length];
        addEdge(from, byPitchAndQuality.get(`${nextPitch}:${quality}`), 'fifths');
      });
    });
    NETWORK_ROOT_PITCHES.forEach((pitch) => {
      const major = byPitchAndQuality.get(`${pitch}:`);
      NETWORK_QUALITIES.slice(1).forEach((quality) => {
        addEdge(major, byPitchAndQuality.get(`${pitch}:${quality}`), 'family');
      });
      const relativeMinor = byPitchAndQuality.get(`${(pitch + 9) % 12}:m`);
      addEdge(major, relativeMinor, 'relative');
      const dominant = byPitchAndQuality.get(`${pitch}:7`);
      const tonic = byPitchAndQuality.get(`${(pitch + 5) % 12}:`);
      addEdge(dominant, tonic, 'resolution');
    });

    const currentIsMapped = coords.has(current);
    const centerNode = { name:current, x:center, y:center };
    if (currentIsMapped) {
      candidates.forEach((candidate) => addEdge(current, candidate, 'resolution', true));
    }

    for (const edge of edges.values()) {
      const from = edge.suggested && current && !currentIsMapped ? centerNode : coords.get(edge.from);
      const to = coords.get(edge.to);
      if (!from || !to) continue;
      const chosenPath = selectedChord && ((edge.from === current && edge.to === selectedChord) || (edge.to === current && edge.from === selectedChord));
      const edgeClass = `edge ${edge.type}${edge.suggested ? ' suggested' : ''}${chosenPath ? ' route' : ''}`;
      svg.append(svgEl('line', { x1:from.x, y1:from.y, x2:to.x, y2:to.y, class:edgeClass }));
    }
    if (current && !currentIsMapped) {
      for (const candidate of candidates) {
        const to = coords.get(candidate);
        if (to) svg.append(svgEl('line', { x1:center, y1:center, x2:to.x, y2:to.y, class:`edge suggested${selectedChord === candidate ? ' route' : ''}` }));
      }
    }

    for (const node of nodes) {
      const isCurrent = node.name === current;
      const isCandidate = candidates.has(node.name);
      const group = nodeGroup({ ...node, name:node.name, family:familyOf(qualityOf(node.name)), current:isCurrent, candidate:isCandidate, selected:selectedChord === node.name, compact:true, radius:nodeRadius, onClick:() => {
        selectedChord = isCurrent ? '' : node.name;
        render();
      } });
      if (current && !isCurrent && !isCandidate) group.classList.add('unrelated');
      svg.append(group);
    }

    const hubName = current || '12';
    const hubText = svgEl('text', { x:center, y:center - 5, class:'hub-text', 'font-size':hubName.length > 5 ? 9 : 13 }, hubName);
    hubText.style.fontSize = `${hubName.length > 5 ? 9 : 13}px`;
    svg.append(svgEl('circle', { cx:center, cy:center, r:36, class:'hub' }));
    svg.append(hubText);
    svg.append(svgEl('text', { x:center, y:center + 14, class:'hub-caption' }, current ? (currentIsMapped ? 'האקורד עכשיו' : 'אקורד מחוץ למעגל') : 'שורשים · מעגל חמישיות'));
    const status = shadow.querySelector('.status');
    status.innerHTML = current
      ? `עכשיו: <b>${escapeHtml(currentChord)}</b> <span>· ${nodes.length} אקורדים מקושרים · <span style="color:#a6ef5b">ירוק = מעברים מומלצים</span></span>`
      : `${nodes.length} אקורדים במעגל · <span style="color:#dab866">דומיננטה → פתרון</span> · <span style="color:#a87bc9">מז'ור/מינור יחסי</span>`;
  }

  function renderAtlas() {
    const viewport = shadow.querySelector('.viewport');
    if (viewport.querySelector('.empty')) viewport.innerHTML = '<svg aria-hidden="true"></svg>';
    svg = viewport.querySelector('svg');
    const expanded = expandedBase;
    if (expanded) { renderSlashVariants(expanded); return; }
    const names = baseNames.filter((name) => rootOf(name) === atlasRoot && (atlasFamily === 'all' || familyOf(qualityOf(name)) === atlasFamily));
    const width = Math.max(360, viewport.clientWidth - 4);
    const gapX = 9;
    const cardW = 104;
    const cardH = 38;
    const columns = Math.max(2, Math.floor((width - 20 + gapX) / (cardW + gapX)));
    const rows = Math.ceil(names.length / columns);
    const height = Math.max(330, rows * (cardH + 9) + 30);
    prepareSvg(`0 0 ${width} ${height}`);
    names.forEach((name, index) => {
      const x = 12 + (index % columns) * (cardW + gapX) + cardW / 2;
      const y = 22 + Math.floor(index / columns) * (cardH + 9) + cardH / 2;
      const variants = chordNames.filter((entry) => entry.startsWith(`${name}/`)).length;
      svg.append(nodeGroup({ x, y, name, kind:'atlas', family:familyOf(qualityOf(name)), selected:selectedChord === name, current:baseOf(currentChord) === name, width:cardW, height:cardH, onClick:() => {
        selectedChord = name;
        expandedBase = variants ? name : '';
        render();
      } }));
    });
    shadow.querySelector('.status').dataset.count = String(names.length);
  }

  function renderSlashVariants(base) {
    const variants = chordNames.filter((name) => name.startsWith(`${base}/`));
    const all = [base, ...variants];
    const center = { x:350, y:250 };
    const radius = Math.min(205, 94 + variants.length * 8);
    prepareSvg('0 0 700 500');
    variants.forEach((name, index) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / Math.max(1, variants.length);
      const x = center.x + Math.cos(angle) * radius;
      const y = center.y + Math.sin(angle) * radius;
      svg.append(svgEl('line', { x1:center.x, y1:center.y, x2:x, y2:y, class:'edge' }));
      svg.append(nodeGroup({ x, y, name, kind:'slash', family:familyOf(qualityOf(base)), selected:selectedChord === name, current:baseOf(currentChord) === name, width:92, height:38, onClick:() => { selectedChord = name; renderDetail(); renderSlashVariants(base); } }));
    });
    svg.append(nodeGroup({ ...center, name:base, kind:'slash', family:familyOf(qualityOf(base)), selected:selectedChord === base, current:baseOf(currentChord) === base, width:98, height:42, onClick:() => { selectedChord = base; renderDetail(); renderSlashVariants(base); } }));
    if (!all.length) return;
  }

  function renderSearch(query) {
    const hostResults = shadow.querySelector('.results');
    hostResults.replaceChildren();
    const value = String(query || '').trim().toLowerCase();
    if (!value) return;
    const matches = chordNames.filter((name) => name.toLowerCase().includes(value)).slice(0, 9);
    matches.forEach((name) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'result';
      const chord = document.createElement('span'); chord.textContent = name;
      const info = document.createElement('small'); info.textContent = name.includes('/') ? 'אקורד slash' : `שורש ${rootOf(name)}`;
      button.append(chord, info);
      button.addEventListener('click', () => selectAtlasChord(name));
      hostResults.append(button);
    });
  }

  function selectAtlasChord(name) {
    const base = baseOf(name);
    atlasRoot = rootOf(base) || atlasRoot;
    shadow.querySelector('.root-select').value = atlasRoot;
    selectedChord = name;
    expandedBase = name.includes('/') ? base : (chordNames.some((chord) => chord.startsWith(`${base}/`)) ? base : '');
    shadow.querySelector('.search').value = name;
    shadow.querySelector('.results').replaceChildren();
    render();
  }

  function renderDetail() {
    const route = shadow.querySelector('.route');
    const reason = shadow.querySelector('.reason');
    if (selectedChord) {
      route.textContent = mode === 'transitions' ? `${baseOf(currentChord) || '—'} → ${selectedChord}` : selectedChord;
      reason.textContent = mode === 'transitions'
        ? transitionReason(baseOf(currentChord), selectedChord)
        : chordNames.includes(selectedChord) ? `האקורד קיים במאגר · ${chordNames.filter((name) => name.startsWith(`${baseOf(selectedChord)}/`)).length} וריאציות slash` : '';
      return;
    }
    route.textContent = currentChord ? `מתנגן עכשיו: ${currentChord}` : 'בחר אקורד במפה';
    reason.textContent = currentChord ? 'האקורד הפעיל מודגש; קווים ירוקים מציינים מעברים מומלצים.' : 'המעגל מציג מעברים בין שורשים, איכויות ואקורדים יחסיים.';
  }

  function transitionReason(from, to) {
    from = baseOf(from);
    to = baseOf(to);
    const rootFrom = rootOf(from);
    const rootTo = rootOf(to);
    if (!rootFrom || !rootTo) return 'כיוון הרמוני אפשרי מתוך מאגר האקורדים.';
    const interval = ((NOTE_VALUES[rootTo] - NOTE_VALUES[rootFrom]) + 12) % 12;
    const fromQuality = qualityOf(from).toLowerCase();
    const toQuality = qualityOf(to).toLowerCase();
    if (/^(?:7|9|11|13)/.test(fromQuality) && interval === 5) return `פתרון דומיננטי: ${from} מוביל באופן טבעי ל־${to} (V → I).`;
    if ((!fromQuality || fromQuality === 'maj') && /^m(?!aj)/.test(toQuality) && interval === 9) return 'מז׳ור למינור היחסי: נשארים באותם צלילים ומשנים את נקודת הבית.';
    if (/^m(?!aj)/.test(fromQuality) && (!toQuality || toQuality === 'maj') && interval === 3) return 'מינור למז׳ור היחסי: רוב הצלילים משותפים והצבע נעשה בהיר יותר.';
    if (rootFrom === rootTo) return 'אותו שורש עם איכות אחרת — שינוי צבע הרמוני בלי להזיז את הבס.';
    if (interval === 5 || interval === 7) return 'מעבר קרוב במעגל הקווינטות, נפוץ ונוח להמשך הרמוני.';
    const shared = [...chordPitchClasses(from)].filter((pitch) => chordPitchClasses(to).has(pitch)).length;
    if (shared >= 2) return `מעבר חלק עם ${shared} צלילים משותפים בין האקורדים.`;
    return 'אפשרות צבעונית יותר, שנבחרה לפי הקרבה בין צלילי האקורדים.';
  }

  async function setEnabled(enabled) {
    const requestVersion = ++enableRequestVersion;
    isEnabled = enabled === true;
    if (!enabled) {
      if (host) host.hidden = true;
      clearInterval(pollId);
      pollId = null;
      return;
    }
    createPanel();
    syncPanelVisibility();
    followPlayer();
    void syncActivationState();
    if (!pollId) pollId = setInterval(() => { void syncActivationState(); }, 350);
    if (requestVersion !== enableRequestVersion || !isEnabled) return;
  }

  window.ycHarmonyMap = { setEnabled };
})();
