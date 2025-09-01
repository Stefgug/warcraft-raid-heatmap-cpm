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

    grid.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.drag-handle')) e.stopPropagation();
    }, { capture: true });

    grid.addEventListener('dragstart', (e) => {
      const handle = e.target.closest('.drag-handle');
      if (!handle) return;
      const card = handle.closest('.raid-card');
      if (!card) return;
      draggingCard = card;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', card.dataset.id || '');
    });

    grid.addEventListener('dragover', (e) => {
      if (!draggingCard) return;
      e.preventDefault();
      const target = cardFromPoint(e.clientX, e.clientY, draggingCard);
      if (!target) {
        grid.appendChild(draggingCard);
        return;
      }
      if (target === draggingCard) return;
      const rect = target.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const before = (e.clientY < cy) || (Math.abs(e.clientY - cy) < rect.height * 0.4 && e.clientX < cx);
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

  function cardFromPoint(x, y, dragging) {
    const els = document.elementsFromPoint(x, y);
    for (const el of els) {
      const card = el.closest && el.closest('.raid-card');
      if (card && card !== dragging) return card;
    }
    return null;
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

    // Restore order
    applyOrder(grid, loadOrder(reportCode, fightId));

    // Local DnD with handle
    setupDnD(grid, reportCode, fightId);

    // Click to select healer (ignore handle)
    grid.addEventListener('click', async (e) => {
      if (e.target.closest('.drag-handle')) return;
      const card = e.target.closest('.raid-card');
      if (!card) return;
      selectCard(card);
      const sourceId = parseInt(card.dataset.id, 10);
      const status = document.getElementById('status');
      try {
        status.textContent = 'Calcul CPM en cours…';
        const data = await fetchCPM(reportCode, fightId, sourceId);
        updateHeatmap(data);
        status.textContent = 'CPM mis à jour.';
      } catch (err) {
        console.error(err);
        status.textContent = 'Erreur: ' + (err.message || String(err));
      }
    });

    // If a preselected source id exists, auto-select and fetch
    if (preselect) {
      const card = grid.querySelector(`.raid-card[data-id="${preselect}"]`);
      if (card) {
        // Simulate a click flow
        selectCard(card);
        const status = document.getElementById('status');
        (async () => {
          try {
            status.textContent = 'Calcul CPM en cours…';
            const data = await fetchCPM(reportCode, fightId, preselect);
            updateHeatmap(data);
            status.textContent = 'CPM mis à jour.';
          } catch (err) {
            console.error(err);
            status.textContent = 'Erreur: ' + (err.message || String(err));
          }
        })();
      }
    }
  }

  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    init();
  }
})();
