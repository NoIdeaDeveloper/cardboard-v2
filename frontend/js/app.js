/**
 * Cardboard – main application logic
 */

(function () {
  'use strict';

  // ===== State =====
  let state = {
    games: [],
    viewMode: 'grid',   // 'grid' | 'list'
    sortBy: 'name',
    sortDir: 'asc',
    search: '',
  };

  // ===== Init =====
  document.addEventListener('DOMContentLoaded', () => {
    bindNav();
    bindCollectionControls();
    bindAddGame();
    bindModalBackdrop();
    loadCollection();
  });

  // ===== Navigation =====
  function bindNav() {
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
  }

  function switchView(view) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('[data-view]').forEach(btn => btn.classList.remove('active'));
    const viewEl = document.getElementById(`view-${view}`);
    if (viewEl) viewEl.classList.add('active');
    document.querySelectorAll(`[data-view="${view}"]`).forEach(btn => btn.classList.add('active'));
    if (view === 'collection') loadCollection();
  }

  // ===== Collection Controls =====
  function bindCollectionControls() {
    const searchInput = document.getElementById('collection-search');
    const clearBtn    = document.getElementById('clear-search');
    const sortBy      = document.getElementById('sort-by');
    const sortDirBtn  = document.getElementById('sort-dir');
    const gridBtn     = document.getElementById('view-grid');
    const listBtn     = document.getElementById('view-list');

    let searchDebounce;
    searchInput.addEventListener('input', () => {
      state.search = searchInput.value;
      clearBtn.style.display = state.search ? 'flex' : 'none';
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(renderCollection, 300);
    });

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      state.search = '';
      clearBtn.style.display = 'none';
      renderCollection();
    });

    sortBy.addEventListener('change', () => {
      state.sortBy = sortBy.value;
      loadCollection();
    });

    sortDirBtn.addEventListener('click', () => {
      state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      sortDirBtn.dataset.dir = state.sortDir;
      sortDirBtn.setAttribute('title', state.sortDir === 'asc' ? 'Sort ascending' : 'Sort descending');
      // Flip icon
      sortDirBtn.querySelector('svg').style.transform = state.sortDir === 'desc' ? 'scaleY(-1)' : '';
      loadCollection();
    });

    gridBtn.addEventListener('click', () => {
      state.viewMode = 'grid';
      gridBtn.classList.add('active');
      listBtn.classList.remove('active');
      renderCollection();
    });

    listBtn.addEventListener('click', () => {
      state.viewMode = 'list';
      listBtn.classList.add('active');
      gridBtn.classList.remove('active');
      renderCollection();
    });
  }

  // ===== Load Collection =====
  async function loadCollection() {
    const container = document.getElementById('games-container');
    container.innerHTML = `<div class="loading-spinner"><div class="spinner"></div><p>Loading your collection…</p></div>`;
    document.getElementById('empty-state').style.display = 'none';

    try {
      state.games = await API.getGames({ sort_by: state.sortBy, sort_dir: state.sortDir });
      renderCollection();
    } catch (err) {
      container.innerHTML = `<div class="loading-spinner"><p style="color:var(--danger)">Failed to load collection: ${escapeHtml(err.message)}</p></div>`;
    }
  }

  function renderCollection() {
    const container   = document.getElementById('games-container');
    const emptyState  = document.getElementById('empty-state');
    const statsEl     = document.getElementById('collection-stats');

    const search = (state.search || '').toLowerCase();
    const filtered = state.games.filter(g => !search || g.name.toLowerCase().includes(search));

    // Stats
    if (state.games.length > 0) {
      const shown = filtered.length !== state.games.length ? `${filtered.length} of ${state.games.length}` : state.games.length;
      const rated = state.games.filter(g => g.user_rating).length;
      statsEl.textContent = `${shown} game${state.games.length !== 1 ? 's' : ''} in collection${rated ? ` · ${rated} rated` : ''}`;
    } else {
      statsEl.textContent = '';
    }

    container.innerHTML = '';

    if (state.games.length === 0) {
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';

    if (filtered.length === 0) {
      container.innerHTML = `<div class="loading-spinner"><p style="color:var(--text-3)">No games match your search.</p></div>`;
      return;
    }

    container.className = state.viewMode === 'grid' ? 'games-grid' : 'games-list';

    filtered.forEach(game => {
      const el = state.viewMode === 'grid' ? buildGameCard(game) : buildGameListItem(game);
      el.addEventListener('click', () => openGameModal(game));
      container.appendChild(el);
    });
  }

  // ===== Game Modal =====
  async function openGameModal(game) {
    const contentEl = buildModalContent(game, handleSaveGame, handleDeleteGame);
    openModal(contentEl);
  }

  async function handleSaveGame(gameId, payload) {
    try {
      const updated = await API.updateGame(gameId, payload);
      showToast('Changes saved!', 'success');
      closeModal();
      // Update in state
      const idx = state.games.findIndex(g => g.id === gameId);
      if (idx !== -1) state.games[idx] = updated;
      renderCollection();
    } catch (err) {
      showToast(`Save failed: ${err.message}`, 'error');
    }
  }

  async function handleDeleteGame(gameId, gameName) {
    const confirmed = await showConfirm(
      'Remove Game',
      `Are you sure you want to remove "${gameName}" from your collection? This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await API.deleteGame(gameId);
      showToast(`"${gameName}" removed from collection.`, 'success');
      closeModal();
      state.games = state.games.filter(g => g.id !== gameId);
      renderCollection();
    } catch (err) {
      showToast(`Failed to remove: ${err.message}`, 'error');
    }
  }

  // ===== Modal Backdrop =====
  function bindModalBackdrop() {
    document.getElementById('modal-backdrop').addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });
  }

  // ===== Add Game =====
  function bindAddGame() {
    // Mode tabs
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.mode-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`mode-${btn.dataset.mode}`).classList.add('active');
      });
    });

    // BGG Search
    const bggInput = document.getElementById('bgg-search');
    const bggBtn   = document.getElementById('bgg-search-btn');

    async function doBGGSearch() {
      const q = bggInput.value.trim();
      if (!q) return;

      const results = document.getElementById('bgg-results');
      const loading  = document.getElementById('bgg-loading');
      const errEl    = document.getElementById('bgg-error');

      results.style.display = 'none';
      errEl.style.display   = 'none';
      loading.style.display = 'flex';

      try {
        const data = await API.searchBGG(q);
        loading.style.display = 'none';
        results.innerHTML = '';

        if (!data.length) {
          results.innerHTML = '<p style="color:var(--text-3);padding:20px">No results found. Try a different search term.</p>';
          results.style.display = 'block';
          return;
        }

        data.forEach(item => {
          const card = document.createElement('div');
          card.className = 'bgg-result-card';
          card.innerHTML = `
            <div class="bgg-result-info">
              <div class="bgg-result-name">${escapeHtml(item.name)}</div>
              <div class="bgg-result-year">${item.year_published ? item.year_published : 'Unknown year'} · BGG #${item.bgg_id}</div>
            </div>
            <div class="bgg-result-add">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </div>`;
          card.addEventListener('click', () => addBGGGame(item.bgg_id, item.name, card));
          results.appendChild(card);
        });

        results.style.display = 'grid';
      } catch (err) {
        loading.style.display = 'none';
        errEl.textContent = `Search failed: ${err.message}`;
        errEl.style.display = 'block';
      }
    }

    bggBtn.addEventListener('click', doBGGSearch);
    bggInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doBGGSearch(); });

    // Manual form
    document.getElementById('manual-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const fd = new FormData(form);

      function csvToJson(key) {
        const val = fd.get(key) || '';
        const items = val.split(',').map(s => s.trim()).filter(Boolean);
        return items.length ? JSON.stringify(items) : null;
      }

      const payload = {
        name:          fd.get('name'),
        year_published: parseInt(fd.get('year_published')) || null,
        min_players:   parseInt(fd.get('min_players')) || null,
        max_players:   parseInt(fd.get('max_players')) || null,
        min_playtime:  parseInt(fd.get('min_playtime')) || null,
        max_playtime:  parseInt(fd.get('max_playtime')) || null,
        difficulty:    parseFloat(fd.get('difficulty')) || null,
        image_url:     fd.get('image_url') || null,
        description:   fd.get('description') || null,
        categories:    csvToJson('categories_raw'),
        designers:     csvToJson('designers_raw'),
      };

      try {
        await API.createGame(payload);
        showToast(`"${payload.name}" added to collection!`, 'success');
        form.reset();
        switchView('collection');
      } catch (err) {
        showToast(`Failed to add game: ${err.message}`, 'error');
      }
    });
  }

  async function addBGGGame(bggId, name, cardEl) {
    // Prevent double-clicks: disable the card and show a spinner while fetching
    if (cardEl) {
      cardEl.style.pointerEvents = 'none';
      cardEl.style.opacity = '0.6';
      const addIcon = cardEl.querySelector('.bgg-result-add');
      if (addIcon) addIcon.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px"></div>';
    }

    try {
      const gameData = await API.getBGGGame(bggId);
      const created  = await API.createGame(gameData);
      showToast(`"${created.name}" added to collection!`, 'success');
      switchView('collection');
    } catch (err) {
      // Re-enable the card on failure so the user can try again
      if (cardEl) {
        cardEl.style.pointerEvents = '';
        cardEl.style.opacity = '';
        const addIcon = cardEl.querySelector('.bgg-result-add');
        if (addIcon) addIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
      }
      if (err.message.toLowerCase().includes('already')) {
        showToast(`"${name}" is already in your collection.`, 'error');
      } else {
        showToast(`Failed to add "${name}": ${err.message}`, 'error');
      }
    }
  }

})();
