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
    let draggingCard = null;

    grid.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.raid-card');
      if (!card) return;
      draggingCard = card;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', card.dataset.id || '');
    });

    grid.addEventListener('dragover', (e) => {
      if (!draggingCard) return;
      e.preventDefault();
      const target = nearestCard(grid, e.clientX, e.clientY, draggingCard);
      if (!target) return; // nothing to do
      const rect = target.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      // Decide insertion side: primarily vertical, fallback horizontal when near middle
      let before;
      const dy = e.clientY - cy;
      const dx = e.clientX - cx;
      if (Math.abs(dy) > rect.height * 0.25) {
        before = dy < 0;
      } else {
        before = dx < 0;
      }
      if (before) grid.insertBefore(draggingCard, target);
      else grid.insertBefore(draggingCard, target.nextSibling);
    });

    grid.addEventListener('drop', (e) => { if (draggingCard) e.preventDefault(); });

    grid.addEventListener('dragend', () => {
      if (!draggingCard) return;
      draggingCard.classList.remove('dragging');
      draggingCard = null;
      const order = Array.from(grid.children).map((el) => parseInt(el.dataset.id, 10));
      saveOrder(reportCode, fightId, order);
    });
  }

  function nearestCard(container, x, y, dragging) {
    const cards = [...container.querySelectorAll('.raid-card:not(.dragging)')];
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
    if (!isFinite(value) || value <= 0 || max <= 0 || max === min) {
      return "#9aa9ff"; // neutral-ish
    }
    const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
    const r = Math.round(255 * t);
    const b = Math.round(255 * (1 - t));
    return `rgb(${r},0,${b})`;
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
