(function () {
  let __initialized = false;
  function keyFor(reportCode, fightId) {
    return `wcl-order:${reportCode}:${fightId}`;
  }

  function loadArrangement(reportCode, fightId) {
    try {
      const raw = localStorage.getItem(keyFor(reportCode, fightId));
      if (!raw) return { grid: [], pool: [] };
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return { grid: parsed, pool: [] }; // legacy format
      const grid = Array.isArray(parsed.grid) ? parsed.grid : [];
      const pool = Array.isArray(parsed.pool) ? parsed.pool : [];
      return { grid, pool };
    } catch (_) {
      return { grid: [], pool: [] };
    }
  }

  function saveArrangement(reportCode, fightId, gridOrder, poolOrder) {
    try {
      const data = { grid: gridOrder || [], pool: poolOrder || [] };
      localStorage.setItem(keyFor(reportCode, fightId), JSON.stringify(data));
    } catch (_) {}
  }

  function createPlaceholder(slotIdx) {
    const el = document.createElement('div');
    el.className = 'raid-card placeholder';
    el.dataset.slot = String(slotIdx);
    return el;
  }

  function applyArrangement(grid, pool, arrangement, totalSlots) {
    if (!arrangement) return;
    const byId = new Map();
    // Collect all current card nodes (from grid and pool)
    Array.from(document.querySelectorAll('.raid-card[data-id]')).forEach((el) => {
      const id = parseInt(el.dataset.id, 10);
      if (isFinite(id)) byId.set(id, el);
    });
    // Rebuild grid with placeholders
    const used = new Set();
    const frag = document.createDocumentFragment();
    for (let i = 0; i < totalSlots; i++) {
      const id = arrangement.grid && i < arrangement.grid.length ? arrangement.grid[i] : null;
      if (id != null && byId.has(id)) {
        frag.appendChild(byId.get(id));
        used.add(id);
      } else {
        frag.appendChild(createPlaceholder(i));
      }
    }
    grid.innerHTML = '';
    grid.appendChild(frag);

    // Move all remaining cards to pool in the provided order (fallback to any not used)
    const poolIds = (arrangement.pool && arrangement.pool.filter((x) => x != null)) || [];
    const poolFrag = document.createDocumentFragment();
    const pushed = new Set();
    for (const id of poolIds) {
      if (byId.has(id) && !used.has(id)) { poolFrag.appendChild(byId.get(id)); pushed.add(id); }
    }
    byId.forEach((node, id) => { if (!used.has(id) && !pushed.has(id)) poolFrag.appendChild(node); });
    pool.innerHTML = '';
    pool.appendChild(poolFrag);
  }

  // Improved grid-friendly drag-and-drop using nearest-card placement
  function getTotalSlots(grid) {
    // initial roster length equals number of unique player cards rendered server-side
    const ids = new Set(Array.from(document.querySelectorAll('#raid-grid .raid-card[data-id]')).map(el => parseInt(el.dataset.id, 10))); 
    return ids.size || Array.from(grid.children).length;
  }

  function updatePoolVisibility(grid, pool) {
    if (!pool) return;
    const section = pool.closest('.pool-section') || document.getElementById('pool-section');
    if (!section) return;
    const hasPoolCards = !!pool.querySelector('.raid-card[data-id]');
    const hasPlaceholders = !!grid.querySelector('.placeholder');
    const shouldShow = hasPoolCards || hasPlaceholders;
    section.classList.toggle('hidden', !shouldShow);
  }

  function clearArrangement(reportCode, fightId) {
    try { localStorage.removeItem(keyFor(reportCode, fightId)); } catch (_) {}
  }

  function isArrangementCompatible(arr, rosterIds, options) {
    const opts = options || {};
    const requireFull = !!opts.requireFull; // when true, grid must have no nulls and pool must be empty
    try {
      if (!arr || !Array.isArray(arr.grid)) return false;
      const ids = new Set(rosterIds);
      const seen = new Set();
      let gridCount = 0;
      // Only check first ids.size slots for completeness
      for (let i = 0; i < Math.min(arr.grid.length, ids.size); i++) {
        const id = arr.grid[i];
        if (id == null) { if (requireFull) return false; else continue; }
        if (!ids.has(id) || seen.has(id)) return false;
        seen.add(id); gridCount++;
      }
      if (arr.pool && Array.isArray(arr.pool)) {
        if (requireFull && arr.pool.length > 0) return false;
        for (const id of arr.pool) {
          if (!ids.has(id) || seen.has(id)) return false;
          seen.add(id);
        }
      }
      return seen.size === ids.size || (!requireFull && seen.size <= ids.size);
    } catch (_) { return false; }
  }

  function currentArrangement(grid, pool, totalSlots) {
    const gridOrder = [];
    const poolOrder = [];
    Array.from(grid.children).forEach((el) => {
      if (el.classList.contains('placeholder')) gridOrder.push(null);
      else gridOrder.push(parseInt(el.dataset.id, 10));
    });
    // Ensure we store exactly totalSlots entries
    while (gridOrder.length < totalSlots) gridOrder.push(null);
    Array.from(pool.children).forEach((el) => {
      const id = parseInt(el.dataset.id, 10);
      if (isFinite(id)) poolOrder.push(id);
    });
    return { grid: gridOrder.slice(0, totalSlots), pool: poolOrder };
  }

  function normalizeGrid(grid, pool, totalSlots) {
    // Ensure grid has exactly totalSlots children by adding/removing placeholders
    const children = Array.from(grid.children);
    let count = children.length;
    if (count < totalSlots) {
      for (let i = count; i < totalSlots; i++) grid.appendChild(createPlaceholder(i));
    } else if (count > totalSlots) {
      // Move extras to pool
      for (let i = totalSlots; i < count; i++) pool.appendChild(children[i]);
    }
  }

  function setupDnD(grid, pool, reportCode, fightId) {
    // Prefer SortableJS if available for more robust DnD
    if (typeof window !== 'undefined' && window.Sortable && typeof window.Sortable.create === 'function') {
      const totalSlots = getTotalSlots(grid);
      const onAnyChange = () => {
        normalizeGrid(grid, pool, totalSlots);
        const arr = currentArrangement(grid, pool, totalSlots);
        saveArrangement(reportCode, fightId, arr.grid, arr.pool);
      };

      function setDropHighlight(target) {
        try {
          grid.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
          if (target) target.classList.add('drop-target');
        } catch (_) {}
      }

      const gridSortable = window.Sortable.create(grid, {
        animation: 150,
        group: { name: 'raid', pull: true, put: false },
        draggable: '.raid-card:not(.placeholder)',
        sort: false, // disable reflow; we will implement swap semantics
        ghostClass: 'dragging',
        dragClass: 'drag-slot',
        filter: '.placeholder',
        onMove: (evt) => {
          // Track last hovered element to decide swap vs fill
          grid.__lastRelated = evt.related;
          const rel = evt.related && evt.related.parentElement === grid ? evt.related : null;
          setDropHighlight(rel);
          // Suppress temporary ghost slot when dragging from pool into grid
          try {
            if (evt.from === pool && evt.to === grid) {
              grid.setAttribute('data-suppress-ghost', '1');
              grid.setAttribute('data-suppress-insert', '1');
            } else {
              grid.removeAttribute('data-suppress-ghost');
              grid.removeAttribute('data-suppress-insert');
            }
          } catch (_) {}
          return true;
        },
        onAdd: (evt) => {
          // Should not occur (put:false); keep as safety no-op
          setDropHighlight(null);
          try { grid.removeAttribute('data-suppress-ghost'); grid.removeAttribute('data-suppress-insert'); } catch (_) {}
        },
        onRemove: (evt) => {
          // Leaving the grid creates a blank at the old index
          const idx = (typeof evt.oldIndex === 'number') ? evt.oldIndex : grid.children.length;
          const ph = createPlaceholder(idx);
          if (idx >= 0 && idx <= grid.children.length) grid.insertBefore(ph, grid.children[idx] || null);
          else grid.appendChild(ph);
          onAnyChange();
          updatePoolVisibility(grid, pool);
          try { grid.removeAttribute('data-suppress-ghost'); grid.removeAttribute('data-suppress-insert'); } catch (_) {}
        },
        onEnd: (evt) => {
          // Handle swap within the same grid (sort disabled)
          if (evt.from === grid && evt.to === grid) {
            const dragged = evt.item;
            let related = (grid.__lastRelated && grid.__lastRelated.parentElement === grid) ? grid.__lastRelated : null;
            try {
              const oe = evt.originalEvent;
              if ((!related || related === dragged) && oe && typeof oe.clientX === 'number' && typeof oe.clientY === 'number') {
                const el = document.elementFromPoint(oe.clientX, oe.clientY);
                const r = el && el.closest('.raid-card, .placeholder');
                if (r && r.parentElement === grid) related = r;
              }
            } catch (_) {}
            if (!related || related === dragged) { setDropHighlight(null); return; }
            const isPlaceholder = (el) => el && el.classList && el.classList.contains('placeholder');
            if (isPlaceholder(related)) {
              // Swap with empty slot
              const idx = typeof evt.oldIndex === 'number' ? evt.oldIndex : Array.from(grid.children).indexOf(dragged);
              grid.replaceChild(dragged, related);
              // Move placeholder back to old index
              const before = grid.children[idx];
              if (before) grid.insertBefore(related, before); else grid.appendChild(related);
            } else {
              // Swap two filled cards without reflow
              const i = Array.from(grid.children).indexOf(dragged);
              const j = Array.from(grid.children).indexOf(related);
              if (i < 0 || j < 0) return;
              const m1 = document.createComment('m1');
              const m2 = document.createComment('m2');
              grid.replaceChild(m1, dragged);
              grid.replaceChild(m2, related);
              grid.insertBefore(related, m1);
              grid.insertBefore(dragged, m2);
              m1.remove(); m2.remove();
            }
            onAnyChange();
            updatePoolVisibility(grid, pool);
            setDropHighlight(null);
            try { grid.removeAttribute('data-suppress-ghost'); grid.removeAttribute('data-suppress-insert'); } catch (_) {}
          }
        },
      });
      const poolEl = pool;
      window.Sortable.create(poolEl, {
        animation: 150,
        group: { name: 'raid', pull: true, put: true },
        draggable: '.raid-card',
        sort: true,
        ghostClass: 'dragging',
        onMove: (evt) => {
          // Highlight potential target in grid under pointer
          try {
            const oe = evt.originalEvent;
            const el = (oe && typeof oe.clientX === 'number') ? document.elementFromPoint(oe.clientX, oe.clientY) : null;
            const target = el && el.closest && el.closest('#raid-grid .raid-card, #raid-grid .placeholder');
            const t = (target && target.parentElement === grid) ? target : null;
            grid.querySelectorAll('.drop-target').forEach(n => n.classList.remove('drop-target'));
            if (t) t.classList.add('drop-target');
          } catch (_) {}
          return true;
        },
        onEnd: (evt) => {
          // Manual pool->grid swap/fill so grid never shows an extra slot during hover
          try {
            const oe = evt.originalEvent;
            const el = (oe && typeof oe.clientX === 'number') ? document.elementFromPoint(oe.clientX, oe.clientY) : null;
            const target = el && el.closest && el.closest('#raid-grid .raid-card, #raid-grid .placeholder');
            const t = (target && target.parentElement === grid) ? target : null;
            grid.querySelectorAll('.drop-target').forEach(n => n.classList.remove('drop-target'));
            if (!t) { onAnyChange(); updatePoolVisibility(grid, pool); return; }
            const isPlaceholder = (node) => node && node.classList && node.classList.contains('placeholder');
            const dragged = evt.item; // currently back in pool; move it manually
            if (isPlaceholder(t)) {
              grid.replaceChild(dragged, t);
            } else {
              const before = (typeof evt.oldIndex === 'number' && evt.oldIndex <= pool.children.length) ? pool.children[evt.oldIndex] : null;
              if (t.parentElement === grid) grid.replaceChild(dragged, t);
              pool.insertBefore(t, before);
            }
            onAnyChange(); updatePoolVisibility(grid, pool);
          } catch (e) {
            console.warn('manual pool->grid drop failed', e);
          }
        },
      });
      return;
    }

    // Pointer-based fallback (no HTML5 DnD)
    let active = null;
    let startX = 0, startY = 0;
    let moved = false;

    grid.addEventListener('pointerdown', (e) => {
      const card = e.target.closest('.raid-card');
      if (!card) return;
      active = card;
      moved = false;
      startX = e.clientX; startY = e.clientY;
      card.classList.add('manual-drag');
      e.preventDefault();
    });

    grid.addEventListener('pointermove', (e) => {
      if (!active) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      const target = nearestCard(grid, e.clientX, e.clientY, active);
      if (!target || target === active) return;
      const rect = target.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const before = Math.abs(e.clientY - cy) > rect.height * 0.25 ? (e.clientY < cy) : (e.clientX < cx);
      if (before) grid.insertBefore(active, target);
      else grid.insertBefore(active, target.nextSibling);
    });

    const finish = () => {
      if (!active) return;
      active.classList.remove('manual-drag');
      active = null;
      const totalSlots = getTotalSlots(grid);
      const arr = currentArrangement(grid, document.getElementById('undetected-pool'), totalSlots);
      saveArrangement(reportCode, fightId, arr.grid, arr.pool);
    };
    grid.addEventListener('pointerup', finish);
    grid.addEventListener('pointercancel', finish);
    grid.addEventListener('mouseleave', () => { if (active) finish(); });
  }

  function nearestCard(container, x, y, dragging) {
    const cards = [...container.querySelectorAll('.raid-card:not(.dragging):not(.manual-drag)')];
    if (cards.length === 0) return null;
    let best = null;
    let bestD2 = Infinity;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = c; }
    }
    return best;
  }

  function cpmToColor(value, min, max) {
    if (!isFinite(value) || max <= 0 || max === min) return "#9aa9ff";
    const raw = Math.max(0, Math.min(1, (value - min) / (max - min)));
    // Gamma to boost contrast between close values while keeping bright highs
    const gamma = 0.6; // < 1 expands lower range differences
    const t = Math.pow(raw, gamma);
    // Multi-stop gradient: blue -> teal -> light green -> orange -> red
    const stops = [
      [44, 123, 182],  // blue
      [0, 204, 188],    // teal
      [144, 235, 157],  // light green
      [249, 166, 2],    // orange
      [215, 25, 28],    // red
    ];
    const seg = (stops.length - 1) * t;
    const i = Math.max(0, Math.min(stops.length - 2, Math.floor(seg)));
    const f = seg - i;
    const c1 = stops[i], c2 = stops[i + 1];
    const r = Math.round(c1[0] + (c2[0] - c1[0]) * f);
    const g = Math.round(c1[1] + (c2[1] - c1[1]) * f);
    const b = Math.round(c1[2] + (c2[2] - c1[2]) * f);
    return `rgb(${r},${g},${b})`;
  }

  function selectCard(card) {
    document.querySelectorAll('.raid-card.selected').forEach((el) => el.classList.remove('selected'));
    card.classList.add('selected');
    const name = card.dataset.name || 'unknown';
    const sel = document.getElementById('selected-healer');
    if (sel) sel.textContent = `Selected player: ${name}`;
  }

  async function fetchCPM(reportCode, fightId, sourceId) {
    const params = new URLSearchParams({code: reportCode, fight_id: String(fightId), source_id: String(sourceId)});
    const r = await fetch(`/api/cpm?${params.toString()}`);
    if (!r.ok) {
      const text = await r.text();
      throw new Error(text || `Erreur API ${r.status}`);
    }
    return r.json();
  }

  function updateHeatmap(data) {
    const { min, max, cpm_by_target } = data;
    cpm_by_target.forEach((item) => {
      const sel = document.querySelector(`.cpm-value[data-id="${item.id}"]`);
      if (!sel) return;
      sel.textContent = (item.value || 0).toFixed(3);
      const card = sel.closest('.raid-card');
      if (card) {
        card.style.backgroundColor = cpmToColor(item.value || 0, min, max);
      }
    });
  }

  function init() {
    if (__initialized) return;
    __initialized = true;
    const grid = document.getElementById('raid-grid');
    if (!grid) return;
    const pool = document.getElementById('undetected-pool');
    const reportCode = grid.dataset.reportCode;
    const fightId = parseInt(grid.dataset.fightId, 10);
    const preselect = grid.dataset.preselectSource ? parseInt(grid.dataset.preselectSource, 10) : null;
    const healerSelect = document.getElementById('healer-select');

    // Restore arrangement (grid + pool) if present
    const rosterIds = Array.from(document.querySelectorAll('#raid-grid .raid-card[data-id]')).map(el => parseInt(el.dataset.id, 10)).filter(Number.isFinite);
    const totalSlots = rosterIds.length || Array.from(grid.children).length;
    const arr0 = loadArrangement(reportCode, fightId);
    if ((arr0.grid && arr0.grid.length) || (arr0.pool && arr0.pool.length)) {
      // On first load, only auto-apply if layout is complete (no nulls, empty pool)
      if (isArrangementCompatible(arr0, new Set(rosterIds), { requireFull: true })) {
        applyArrangement(grid, pool, arr0, totalSlots);
        updatePoolVisibility(grid, pool);
      } else {
        clearArrangement(reportCode, fightId);
        updatePoolVisibility(grid, pool); // will hide
      }
    } else {
      updatePoolVisibility(grid, pool); // start hidden
    }

    // Local DnD on whole cards
    setupDnD(grid, pool, reportCode, fightId);

    // Keep pool layout (columns + width) in sync with grid
    const syncPool = () => {
      if (!pool) return;
      try {
        const cs = getComputedStyle(grid);
        if (cs.gridTemplateColumns) pool.style.gridTemplateColumns = cs.gridTemplateColumns;
        const w = grid.clientWidth;
        if (w > 0) pool.style.width = w + 'px';
      } catch (_) {}
    };
    syncPool();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => syncPool());
      ro.observe(grid);
    } else {
      window.addEventListener('resize', syncPool);
    }

    // Dropdown change to select healer
    if (healerSelect) {
      const runFor = async (sourceId) => {
        const status = document.getElementById('status');
        try {
          status.textContent = 'Calculating CPM…';
          const data = await fetchCPM(reportCode, fightId, sourceId);
          updateHeatmap(data);
          status.textContent = '';
          const sel = document.getElementById('selected-healer');
          const opt = healerSelect.options[healerSelect.selectedIndex];
          if (sel && opt) sel.textContent = `Selected player: ${opt.textContent}`;
        } catch (err) {
          console.error(err);
          status.textContent = 'Erreur: ' + (err.message || String(err));
        }
      };

      healerSelect.addEventListener('change', (e) => {
        const id = parseInt(healerSelect.value, 10);
        if (isFinite(id)) runFor(id);
      });

      // Preselect based on URL ?source= or default first healer
      let selected = null;
      if (preselect && [...healerSelect.options].some(o => parseInt(o.value, 10) === preselect)) {
        healerSelect.value = String(preselect);
        selected = preselect;
      } else if (healerSelect.options.length > 0) {
        healerSelect.selectedIndex = 0;
        selected = parseInt(healerSelect.value, 10);
      }
      if (selected) runFor(selected);
    }

    // No auto-click; dropdown handles preselection

    // OCR-based auto layout (defined in separate IIFE; access via global)
    if (typeof window !== 'undefined' && typeof window.__wcl_setupOCR === 'function') {
      window.__wcl_setupOCR(grid, reportCode, fightId, pool);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    init();
  }
})();

// ------------------
// OCR + Matching
// ------------------
(function () {
  // Basic text normalization for fuzzy compare
  function norm(s) {
    return String(s || '')
      .normalize('NFKD')
      .replace(/[^A-Za-z0-9'\-]/g, '')
      .toLowerCase();
  }

  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    const dp = new Array(n + 1);
    for (let j = 0; j <= n; j++) dp[j] = j;
    for (let i = 1; i <= m; i++) {
      let prev = i - 1; // dp[i-1][j-1]
      dp[0] = i;
      for (let j = 1; j <= n; j++) {
        const tmp = dp[j];
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[j] = Math.min(
          dp[j] + 1,
          dp[j - 1] + 1,
          prev + cost,
        );
        prev = tmp;
      }
    }
    return dp[n];
  }

  function similarity(a, b) {
    if (!a || !b) return 0;
    const na = norm(a), nb = norm(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    // Prefix boost for cropped OCR (start of name)
    const minLen = Math.min(na.length, nb.length);
    const prefix = na.slice(0, minLen) === nb.slice(0, minLen) ? 0.15 : 0;
    const dist = levenshtein(na, nb);
    // Combine Levenshtein with length ratio to be more tolerant to truncation
    const lenRatio = Math.min(na.length, nb.length) / Math.max(na.length, nb.length);
    const base = (1 - dist / Math.max(na.length, nb.length)) * 0.85 + lenRatio * 0.15;
    return Math.max(0, Math.min(1, base + prefix));
  }

  // Row clustering: group OCR items into rows based on Y distance
  function clusterRows(items) {
    if (!items || items.length === 0) return [];
    const sorted = [...items].sort((a, b) => a.cy - b.cy);
    const medH = (() => {
      const hs = sorted.map(i => i.h || 0).sort((a,b)=>a-b);
      return hs.length ? hs[Math.floor(hs.length/2)] : 18;
    })();
    const yEps = Math.max(6, medH * 0.6);
    const rows = [];
    for (const it of sorted) {
      const last = rows[rows.length - 1];
      if (!last) { rows.push([it]); continue; }
      const lastCy = last.reduce((s, x) => s + x.cy, 0) / last.length;
      if (Math.abs(it.cy - lastCy) <= yEps) last.push(it);
      else rows.push([it]);
    }
    for (const r of rows) r.sort((a,b)=>a.cx - b.cx);
    return rows;
  }

  // Classic Hungarian algorithm (min-cost), square matrix required
  function hungarian(cost) {
    const n = cost.length;
    const u = new Array(n + 1).fill(0);
    const v = new Array(n + 1).fill(0);
    const p = new Array(n + 1).fill(0);
    const way = new Array(n + 1).fill(0);
    for (let i = 1; i <= n; i++) {
      p[0] = i;
      let j0 = 0;
      const minv = new Array(n + 1).fill(Infinity);
      const used = new Array(n + 1).fill(false);
      do {
        used[j0] = true;
        const i0 = p[j0];
        let delta = Infinity, j1 = 0;
        for (let j = 1; j <= n; j++) if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        for (let j = 0; j <= n; j++) {
          if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
          else { minv[j] -= delta; }
        }
        j0 = j1;
      } while (p[j0] !== 0);
      do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0 !== 0);
    }
    const assignment = new Array(n).fill(-1);
    for (let j = 1; j <= n; j++) if (p[j] > 0) assignment[p[j] - 1] = j - 1;
    return assignment; // row i -> column assignment[i]
  }

  function rosterFromGrid(grid) {
    return Array.from(grid.querySelectorAll('.raid-card')).map((el) => ({
      id: parseInt(el.dataset.id, 10),
      name: el.dataset.name || el.querySelector('.name')?.textContent || '',
    }));
  }

  function bestMatchName(name, roster, used) {
    let best = null; let bestScore = -1;
    for (const p of roster) {
      if (used.has(p.id)) continue;
      const s = similarity(name, p.name);
      // Give a small bonus if exact prefix matches (cropped edges)
      const n = norm(name), rn = norm(p.name);
      const bonus = rn.startsWith(n) || n.startsWith(rn) ? 0.05 : 0;
      const score = s + bonus;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best && bestScore >= 0.45 ? { player: best, score: bestScore } : null;
  }

  // Persistent worker with roster-guided dictionary
  let __ocrWorker = null;
  let __ocrDictKey = null;
  async function ensureWorker(roster, statusEl, useUserWords) {
    if (typeof Tesseract === 'undefined') throw new Error('Tesseract.js non chargé');
    const dictKey = (roster || []).map(p => (p.name || '').trim()).sort().join('\n');
    if (__ocrWorker && __ocrDictKey === dictKey) return __ocrWorker;
    statusEl && (statusEl.textContent = 'Loading recognizer…');

    // Create or reuse worker
    if (!__ocrWorker) {
      __ocrWorker = await Tesseract.createWorker('eng+fra', 1, {
        gzip: true,
        cacheMethod: 'none',
        logger: (m) => { if (statusEl) statusEl.textContent = `OCR: ${m.status || m.progress || ''}`; },
        config: {
          // Init-only: use block-of-text segmentation (works better on grids)
          // 6 = Assume a uniform block of text, 11 = sparse text.
          // Empirically 6 reduces over-merged lines in raid-frame screenshots.
          tessedit_pageseg_mode: '6',
          load_system_dawg: '0',
          load_freq_dawg: '0',
          load_number_dawg: '0',
          load_punc_dawg: '0',
          tessedit_load_user_patterns: '0',
          // Default OFF; we only enable if we successfully mount user-words to avoid FS errors
          tessedit_load_user_words: '0',
          user_words_suffix: 'user-words',
        },
      });
      // Non init-only parameters
      await __ocrWorker.setParameters({
        preserve_interword_spaces: '1',
        user_defined_dpi: '180',
        // Reduce false positives from numbers/punctuation; keep dash and apostrophe
        tessedit_char_blacklist: '0123456789`~!@#$%^&*()_+={}[]|\\:;"<>?,./',
      });
    }

    // Build and mount user-words for both languages (we load eng+fra)
    const words = [];
    for (const p of roster || []) {
      const n = String(p.name || '').trim();
      if (!n) continue;
      // Include original and accent-folded forms
      const folded = norm(n).replace(/[^A-Za-z0-9'\-]/g, '');
      words.push(n);
      if (folded && folded !== n) words.push(folded);
    }
    if (useUserWords && words.length) {
      const content = words.filter(Boolean).join('\n') + '\n';
      try {
        try { await __ocrWorker.FS('mkdir', '/tesseract'); } catch (_) {}
        try { await __ocrWorker.FS('mkdir', '/tesseract/tessdata'); } catch (_) {}
        await __ocrWorker.FS('writeFile', '/tesseract/tessdata/eng.user-words', content);
        await __ocrWorker.FS('writeFile', '/tesseract/tessdata/fra.user-words', content);
        // Turn on user-words and reload worker. If this fails, we continue gracefully.
        try { await __ocrWorker.setParameters({ tessedit_load_user_words: '1' }); } catch (_) {}
        await __ocrWorker.reinitialize('eng+fra', 1);
      } catch (e) {
        console.warn('User-words injection failed; continuing without hard lexicon', e);
        try { await __ocrWorker.setParameters({ tessedit_load_user_words: '0' }); } catch (_) {}
      }
    }

    __ocrDictKey = dictKey;
    return __ocrWorker;
  }

  async function runTesseractOnCanvas(canvas, statusEl, roster, useUserWords) {
    const worker = await ensureWorker(roster, statusEl, useUserWords);
    statusEl && (statusEl.textContent = 'Scanning…');
    const r = await worker.recognize(canvas);
    statusEl && (statusEl.textContent = '');
    return r;
  }

  function seededShuffle(arr, seed) {
    function xorshift32(x) {
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return x >>> 0;
    }
    let state = 0;
    for (let i = 0; i < seed.length; i++) state = xorshift32(state + seed.charCodeAt(i));
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      state = xorshift32(state);
      const j = state % (i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function preprocessToCanvas(img, upscale = true, bw = false, previewCanvas = null) {
    const scale = upscale ? 2 : 1;
    const w = Math.max(1, Math.floor(img.naturalWidth * scale));
    const h = Math.max(1, Math.floor(img.naturalHeight * scale));
    const cvs = previewCanvas || document.createElement('canvas');
    cvs.width = w; cvs.height = h;
    const ctx = cvs.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    // Light adaptive enhancement to make white text pop regardless of UI color
    const imgd = ctx.getImageData(0, 0, w, h);
    const d = imgd.data; // RGBA
    // Compute simple local contrast boost by per-pixel gamma + optional hard threshold
    const gamma = 0.8; // <1 brightens mid-tones slightly
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], g = d[i + 1], b = d[i + 2];
      // Perceived luminance
      let yv = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      // Boost whites and suppress dark backgrounds just a bit
      yv = Math.pow(Math.min(255, Math.max(0, yv)) / 255, gamma) * 255;
      if (bw) {
        // Slightly adaptive threshold around 62% with small margin
        const v = yv > 158 ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = v;
      } else {
        // Blend toward grayscale with higher luminance to reduce color noise around glyphs
        d[i] = d[i + 1] = d[i + 2] = yv;
      }
    }
    ctx.putImageData(imgd, 0, 0);
    return cvs;
  }

  function pickLines(result) {
    const items = [];
    const accept = (text) => {
      const t = String(text || '').trim();
      if (!t) return false;
      // Convert to ASCII-ish for matching; allow Unicode in input
      const n = norm(t);
      if (!n) return false;
      // Basic filters: token length 2–16 and no spaces (support accents via normalization)
      if (n.length < 2 || n.length > 16) return false;
      // Avoid obvious non-names
      if (/^[0-9\-']+$/.test(n)) return false;
      return true;
    };

    const pushItem = (text, box) => {
      const b = box || {};
      const x = b.x0 ?? b.x ?? 0, y = b.y0 ?? b.y ?? 0;
      const w = Math.max(0, (b.x1 ?? x) - x), h = Math.max(0, (b.y1 ?? y) - y);
      const cx = x + w / 2, cy = y + h / 2;
      items.push({ text: String(text || '').trim(), x, y, w, h, cx, cy });
    };

    const lines = (result?.data?.lines) || [];
    if (lines.length) {
      for (const ln of lines) {
        const text = String(ln.text || '').trim();
        if (!accept(text)) continue;
        const b = ln.bbox || ln.box || {};
        const conf = typeof ln.confidence === 'number' ? ln.confidence : undefined;
        const b2 = { ...b };
        const it = { text, x: b2.x0 ?? b2.x ?? 0, y: b2.y0 ?? b2.y ?? 0, w: Math.max(0, (b2.x1 ?? (b2.x ?? 0)) - (b2.x0 ?? b2.x ?? 0)), h: Math.max(0, (b2.y1 ?? (b2.y ?? 0)) - (b2.y0 ?? b2.y ?? 0)) };
        pushItem(text, b2);
      }
    }

    // Always also consider individual words (often more reliable)
    const words = (result?.data?.words) || [];
    if (words.length) {
      for (const w of words) {
        const text = String(w.text || '').trim();
        if (!accept(text)) continue;
        const box = w.bbox || w.box || {};
        // Discard obviously too tiny fragments (e.g., "en", punctuation shards)
        const w2 = Math.max(0, (box.x1 ?? box.x ?? 0) - (box.x0 ?? box.x ?? 0));
        const h2 = Math.max(0, (box.y1 ?? box.y ?? 0) - (box.y0 ?? box.y ?? 0));
        if (w2 < 8 || h2 < 8) continue;
        pushItem(text, box);
      }
    }

    // Deduplicate same label near same position
    const deduped = [];
    for (const it of items) {
      if (!deduped.some(o => o.text === it.text && Math.hypot(o.cx - it.cx, o.cy - it.cy) < 8)) {
        deduped.push(it);
      }
    }

    // Sort reading order: row by row
    deduped.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
    return deduped;
  }

  // Keep only OCR tokens that plausibly match our roster.
  function filterByRoster(items, roster, minScore = 0.58) {
    const names = roster.map(r => r.name || '');
    const keep = [];
    for (const it of items) {
      let best = -1;
      for (const n of names) {
        const s = similarity(it.text, n);
        if (s > best) best = s;
      }
      if (best >= minScore) keep.push(it);
    }
    return keep;
  }

  function drawOverlay(canvas, items, matches) {
    try {
      const ctx = canvas.getContext('2d');
      ctx.save();
      ctx.strokeStyle = 'rgba(0,255,0,0.85)';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 2;
      ctx.font = '16px sans-serif';
      for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx];
        ctx.beginPath();
        ctx.rect(it.x, it.y, it.w, it.h);
        ctx.stroke();
        const mapped = matches && matches[idx] ? ` → ${matches[idx].name}` : '';
        const label = it.text + mapped;
        const tw = Math.min(canvas.width - it.x, ctx.measureText(label).width + 8);
        const th = 18;
        ctx.fillRect(it.x, Math.max(0, it.y - th), tw, th);
        ctx.fillStyle = '#0f0';
        ctx.fillText(label, it.x + 4, Math.max(12, it.y - 4));
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
      }
      ctx.restore();
    } catch (_) {}
  }

  // Compute a tight bounding rectangle around accepted OCR items
  function boundFromItems(items, canvas) {
    if (!items || !items.length) return { x: 0, y: 0, w: canvas.width, h: canvas.height };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const it of items) {
      x0 = Math.min(x0, it.x);
      y0 = Math.min(y0, it.y);
      x1 = Math.max(x1, it.x + it.w);
      y1 = Math.max(y1, it.y + it.h);
    }
    // Add margin to include backgrounds/borders
    const m = Math.floor(Math.min(canvas.width, canvas.height) * 0.03) + 8;
    x0 = Math.max(0, x0 - m);
    y0 = Math.max(0, y0 - m);
    x1 = Math.min(canvas.width, x1 + m);
    y1 = Math.min(canvas.height, y1 + m);
    return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  }

  // 1D k-means for centers estimation (small fixed k)
  function kmeans1d(values, k, iters = 8) {
    const xs = values.slice().sort((a, b) => a - b);
    if (xs.length === 0) return Array.from({ length: k }, (_, i) => i + 0.5);
    const centers = new Array(k);
    for (let i = 0; i < k; i++) {
      const idx = Math.min(xs.length - 1, Math.floor((i + 0.5) * xs.length / k));
      centers[i] = xs[idx];
    }
    for (let t = 0; t < iters; t++) {
      const buckets = Array.from({ length: k }, () => []);
      for (const x of xs) {
        let best = 0, bd = Math.abs(x - centers[0]);
        for (let i = 1; i < k; i++) {
          const d = Math.abs(x - centers[i]);
          if (d < bd) { bd = d; best = i; }
        }
        buckets[best].push(x);
      }
      for (let i = 0; i < k; i++) {
        if (buckets[i].length) {
          centers[i] = buckets[i].reduce((s, v) => s + v, 0) / buckets[i].length;
        }
      }
    }
    return centers;
  }

  function edgesFromCenters(centers, minEdge, maxEdge) {
    const k = centers.length;
    const edges = new Array(k + 1);
    for (let i = 0; i <= k; i++) {
      if (i === 0) {
        const left = centers[0] - (centers[1] - centers[0]) / 2;
        edges[i] = Math.max(minEdge, left);
      } else if (i === k) {
        const right = centers[k - 1] + (centers[k - 1] - centers[k - 2]) / 2;
        edges[i] = Math.min(maxEdge, right);
      } else {
        edges[i] = (centers[i - 1] + centers[i]) / 2;
      }
    }
    return edges;
  }

  function getGridCols(grid) {
    const cs = getComputedStyle(grid).gridTemplateColumns || '';
    const parts = cs.split(' ').filter(Boolean);
    return Math.max(1, parts.length);
  }

  function assignSlotsByGeometry(items, grid, canvas, expected) {
    if (!items || !items.length) return items;
    const cols = getGridCols(grid);
    const rows = Math.ceil(expected / cols);
    const bounds = boundFromItems(items, canvas);
    // If the sample is too small, fallback to uniform centers
    const colCenters = items.length >= Math.min(cols, 3)
      ? kmeans1d(items.map(i => i.cx), cols)
      : Array.from({ length: cols }, (_, c) => bounds.x + (c + 0.5) * (bounds.w / cols));
    const rowCenters = items.length >= Math.min(rows, 2)
      ? kmeans1d(items.map(i => i.cy), rows)
      : Array.from({ length: rows }, (_, r) => bounds.y + (r + 0.5) * (bounds.h / rows));
    colCenters.sort((a,b)=>a-b); rowCenters.sort((a,b)=>a-b);
    // For each item, pick nearest center on both axes
    const nearestIdx = (val, centers) => {
      let bi = 0, bd = Math.abs(val - centers[0]);
      for (let i = 1; i < centers.length; i++) { const d = Math.abs(val - centers[i]); if (d < bd) { bd = d; bi = i; } }
      return bi;
    };
    for (const it of items) {
      if (typeof it.slot === 'number') continue; // keep precomputed slot
      const c = nearestIdx(it.cx, colCenters);
      const r = nearestIdx(it.cy, rowCenters);
      it.slot = r * cols + c;
    }
    return items;
  }

  async function perCellRecognize(canvas, grid, roster, statusEl, useUserWords) {
    // Quick pass to estimate row/col centers
    const first = await runTesseractOnCanvas(canvas, statusEl, roster, useUserWords);
    let items = pickLines(first);
    // If first pass is too weak, try sparse text PSM to collect more anchors
    if (!items || items.length < Math.max(4, Math.ceil(roster.length * 0.25))) {
      try {
        const worker = await ensureWorker(roster, statusEl, useUserWords);
        await worker.setParameters({ tessedit_pageseg_mode: '11' }); // Sparse text
        const alt = await worker.recognize(canvas);
        await worker.setParameters({ tessedit_pageseg_mode: '6' });
        const extra = pickLines(alt);
        items = items.concat(extra);
      } catch (_) {}
    }
    items = filterByRoster(items, roster, 0.52);
    const cols = getGridCols(grid);
    const rows = Math.ceil(roster.length / cols);

    // Use robust bounding box for grid then divide uniformly as fallback
    const bounds = boundFromItems(items, canvas);
    const colCenters = items.length >= cols ? kmeans1d(items.map(i => i.cx), cols) :
      Array.from({ length: cols }, (_, c) => bounds.x + (c + 0.5) * (bounds.w / cols));
    const rowCenters = items.length >= rows ? kmeans1d(items.map(i => i.cy), rows) :
      Array.from({ length: rows }, (_, r) => bounds.y + (r + 0.5) * (bounds.h / rows));
    colCenters.sort((a, b) => a - b);
    rowCenters.sort((a, b) => a - b);
    const colEdges = edgesFromCenters(colCenters, bounds.x, bounds.x + bounds.w);
    const rowEdges = edgesFromCenters(rowCenters, bounds.y, bounds.y + bounds.h);

    // Single-line PSM for tight crops
    const worker = await ensureWorker(roster, statusEl, useUserWords);
    await worker.setParameters({ tessedit_pageseg_mode: '7' });

    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x0 = Math.max(0, Math.floor(colEdges[c]));
        const x1 = Math.min(canvas.width, Math.ceil(colEdges[c + 1]));
        const y0 = Math.max(0, Math.floor(rowEdges[r]));
        const y1 = Math.min(canvas.height, Math.ceil(rowEdges[r + 1]));
        const rect = { left: x0, top: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
        try {
          const res = await worker.recognize(canvas, { rectangle: rect });
          const text = String(res?.data?.text || '').trim().split(/\s+/)[0] || '';
          const it = { text, x: x0, y: y0, w: rect.width, h: rect.height, cx: x0 + rect.width / 2, cy: y0 + rect.height / 2, slot: r * cols + c };
          cells.push(it);
        } catch (e) {
          cells.push({ text: '', x: x0, y: y0, w: rect.width, h: rect.height, cx: x0 + rect.width / 2, cy: y0 + rect.height / 2, slot: r * cols + c });
        }
      }
    }

    // Restore default PSM 6 for general runs
    await worker.setParameters({ tessedit_pageseg_mode: '6' });
    // Filter again by roster likeness
    return filterByRoster(cells, roster, 0.5);
  }

  async function performOcrAndReorder(file, opts, grid, reportCode, fightId, statusEl, previewCanvas, pool) {
    // Load image
    const img = new Image();
    const url = URL.createObjectURL(file);
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = url;
    });

    // Preprocess and preview
    previewCanvas.style.display = 'block';
    const canvas = preprocessToCanvas(img, opts.upscale, opts.threshold, previewCanvas);

    // OCR
    const roster = rosterFromGrid(grid);
    let items;
    if (opts.percell) {
      items = await perCellRecognize(canvas, grid, roster, statusEl, !!opts.lexicon);
    } else {
      const result = await runTesseractOnCanvas(canvas, statusEl, roster, !!opts.lexicon);
      items = pickLines(result);
      // Auto fallback to per-cell if too few tokens recognized
      if (!items || items.length < Math.max(6, Math.ceil(roster.length * 0.35))) {
        statusEl.textContent = 'Few names detected — trying per‑cell…';
        items = await perCellRecognize(canvas, grid, roster, statusEl, !!opts.lexicon);
      }
    }
    // Drop tokens that do not resemble any roster name.
    items = filterByRoster(items, roster, 0.60);
    if (!items.length) {
      statusEl.textContent = 'No names detected.';
      return;
    }
    statusEl.textContent = `${items.length} name candidates detected.`;

    // Hungarian-based matching preview labels
    const rows = clusterRows(items);
    const ordered = rows.flat();
    // Define expected early; used by geometry assignment below
    const expected = roster.length;
    // Ensure each token has a target grid slot even for the global OCR path
    assignSlotsByGeometry(ordered, grid, canvas, expected);
    {
      const T = ordered.length;
      const names = roster.map(r => r.name || '');
      const n = Math.max(T, names.length);
      const cost = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => 1));
      for (let i = 0; i < T; i++) {
        for (let j = 0; j < names.length; j++) {
          const s = similarity(ordered[i].text, names[j]);
          const lenDiff = Math.abs((ordered[i].text || '').length - (names[j] || '').length);
          const penalty = Math.min(0.15, lenDiff * 0.01);
          cost[i][j] = Math.max(0, 1 - s + penalty);
        }
      }
      const assignPreview = hungarian(cost);
      const matches = [];
      for (let i = 0; i < T; i++) {
        const j = assignPreview[i];
        matches[i] = (j != null && j >= 0 && j < roster.length) ? roster[j] : null;
      }
      drawOverlay(canvas, ordered, matches);
    }
    // Hint in status: how many unique matches we used
    const uniqCount = new Set(items.map(i => i.text)).size;
    statusEl.textContent = `${statusEl.textContent} (${uniqCount} unique labels, ${roster.length} expected)`;

    // Map to roster and reorder grid
    const used = new Set();
    const matchedIds = [];

    // Row/column clustering and Hungarian assignment (minimize cost = 1-sim)
    // rows/ordered already computed above
    const T = Math.min(ordered.length, expected);
    const names = roster.map(r => r.name || '');
    // Build square cost matrix
    const n = Math.max(T, names.length);
    const cost = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => 1));
    for (let i = 0; i < T; i++) {
      for (let j = 0; j < names.length; j++) {
        const s = similarity(ordered[i].text, names[j]);
        const lenDiff = Math.abs((ordered[i].text || '').length - (names[j] || '').length);
        const penalty = Math.min(0.15, lenDiff * 0.01);
        cost[i][j] = Math.max(0, 1 - s + penalty);
      }
    }
    const assign = hungarian(cost);
    // Build slot-preserving order with blanks (nulls) for undetected names
    const existingIds = Array.from(document.querySelectorAll('.raid-card[data-id]')).map(el => parseInt(el.dataset.id, 10));
    const allIdsSet = new Set(existingIds);
    const slots = new Array(expected).fill(null);
    for (let i = 0; i < T; i++) {
      const j = assign[i];
      if (j != null && j >= 0 && j < roster.length) {
        const id = roster[j].id;
        // If we captured a slot index (per-cell), respect it; otherwise place by reading order
        const pos = (ordered[i] && typeof ordered[i].slot === 'number') ? Math.min(expected - 1, Math.max(0, ordered[i].slot)) : i;
        if (!used.has(id)) { slots[pos] = id; used.add(id); }
      }
    }
    // Collect unmatched ids for pool
    const matchedSet = used;
    const rest = Array.from(allIdsSet).filter(id => !matchedSet.has(id));

    // Apply to DOM: rebuild grid with placeholders and move rest to pool
    const byId = new Map(Array.from(document.querySelectorAll('.raid-card[data-id]')).map(el => [parseInt(el.dataset.id, 10), el]));
    const frag = document.createDocumentFragment();
    for (let pos = 0; pos < slots.length; pos++) {
      const id = slots[pos];
      if (id != null && byId.has(id)) { frag.appendChild(byId.get(id)); }
      else {
        const ph = document.createElement('div');
        ph.className = 'raid-card placeholder';
        ph.dataset.slot = String(pos);
        frag.appendChild(ph);
      }
    }
    grid.innerHTML = '';
    grid.appendChild(frag);
    if (pool) {
      const pfrag = document.createDocumentFragment();
      for (const id of rest) { const el = byId.get(id); if (el) pfrag.appendChild(el); }
      pool.innerHTML = '';
      pool.appendChild(pfrag);
    }
    // Persist combined arrangement
    try {
      const data = { grid: slots, pool: rest };
      localStorage.setItem(`wcl-order:${reportCode}:${fightId}`, JSON.stringify(data));
    } catch (_) {}
    // Show/hide pool based on result (make sure to reveal when gaps exist)
    try {
      const section = (pool && (pool.closest('.pool-section') || document.getElementById('pool-section')));
      if (section) {
        const hasPoolCards = !!(pool && pool.querySelector('.raid-card[data-id]'));
        const hasPlaceholders = !!grid.querySelector('.placeholder');
        const show = hasPoolCards || hasPlaceholders;
        section.classList.toggle('hidden', !show);
      }
    } catch (_) {}
    statusEl.textContent = `Layout updated. ${used.size}/${expected} matched; ${rest.length} in pool.`;
  }

  function setupOCR(grid, reportCode, fightId, pool) {
    const fileInput = document.getElementById('ocr-upload');
    const statusEl = document.getElementById('ocr-status');
    const previewCanvas = document.getElementById('ocr-preview');
    if (!fileInput || !previewCanvas) return;
    // Ensure pool mirrors grid column layout for identical card sizing
    try {
      if (pool) {
        const cs = getComputedStyle(grid).gridTemplateColumns;
        if (cs) pool.style.gridTemplateColumns = cs;
      }
    } catch (_) {}
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      statusEl.textContent = 'Loading image…';
      const opts = { upscale: true, threshold: false, lexicon: true, percell: false };
      try {
        await performOcrAndReorder(f, opts, grid, reportCode, fightId, statusEl, previewCanvas, pool);
      } catch (err) {
        console.error(err);
        statusEl.textContent = 'Recognition failed: ' + (err.message || String(err));
      }
    });
  }

  // Expose for debugging
  if (typeof window !== 'undefined') {
    window.__wcl_setupOCR = setupOCR;
  }
})();
