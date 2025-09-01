(function () {
  let __initialized = false;
  function keyFor(reportCode, fightId) {
    return `wcl-order:${reportCode}:${fightId}`;
  }

  function loadOrder(reportCode, fightId) {
    try {
      const raw = localStorage.getItem(keyFor(reportCode, fightId));
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (_) {
      return [];
    }
  }

  function saveOrder(reportCode, fightId, order) {
    try {
      localStorage.setItem(keyFor(reportCode, fightId), JSON.stringify(order));
    } catch (_) {}
  }

  function applyOrder(grid, order) {
    if (!order || order.length === 0) return;
    const byId = new Map(Array.from(grid.children).map((el) => [el.dataset.id, el]));
    order.forEach((id) => {
      const el = byId.get(String(id));
      if (el) grid.appendChild(el);
    });
  }

  // Improved grid-friendly drag-and-drop using nearest-card placement
  function setupDnD(grid, reportCode, fightId) {
    // Prefer SortableJS if available for more robust DnD
    if (typeof window !== 'undefined' && window.Sortable && typeof window.Sortable.create === 'function') {
      window.Sortable.create(grid, {
        animation: 150,
        draggable: '.raid-card',
        ghostClass: 'dragging',
        onSort: () => {
          const order = Array.from(grid.children).map((el) => parseInt(el.dataset.id, 10));
          saveOrder(reportCode, fightId, order);
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
      const order = Array.from(grid.children).map((el) => parseInt(el.dataset.id, 10));
      saveOrder(reportCode, fightId, order);
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
    const name = card.dataset.name || 'inconnu';
    const sel = document.getElementById('selected-healer');
    if (sel) sel.textContent = `Healer sélectionné: ${name}`;
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
    const reportCode = grid.dataset.reportCode;
    const fightId = parseInt(grid.dataset.fightId, 10);
    const preselect = grid.dataset.preselectSource ? parseInt(grid.dataset.preselectSource, 10) : null;
    const healerSelect = document.getElementById('healer-select');

    // Restore order
    applyOrder(grid, loadOrder(reportCode, fightId));

    // Local DnD on whole cards
    setupDnD(grid, reportCode, fightId);

    // Dropdown change to select healer
    if (healerSelect) {
      const runFor = async (sourceId) => {
        const status = document.getElementById('status');
        try {
          status.textContent = 'Calcul CPM en cours…';
          const data = await fetchCPM(reportCode, fightId, sourceId);
          updateHeatmap(data);
          status.textContent = 'CPM mis à jour.';
          const sel = document.getElementById('selected-healer');
          const opt = healerSelect.options[healerSelect.selectedIndex];
          if (sel && opt) sel.textContent = `Healer sélectionné: ${opt.textContent}`;
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
  }

  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    init();
  }
})();
