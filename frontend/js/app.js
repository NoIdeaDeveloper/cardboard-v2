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
    statusFilter: 'all',
  };

  // ===== Init =====
  document.addEventListener('DOMContentLoaded', () => {
    bindNav();
    bindCollectionControls();
    bindStatusPills();
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
    if (view === 'stats') loadStats();
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
    const filtered = state.games.filter(g => {
      if (state.statusFilter !== 'all' && g.status !== state.statusFilter) return false;
      if (search && !g.name.toLowerCase().includes(search)) return false;
      return true;
    });

    if (state.games.length > 0) {
      const shown = filtered.length !== state.games.length ? `${filtered.length} of ${state.games.length}` : state.games.length;
      const rated = state.games.filter(g => g.user_rating).length;
      const played = state.games.filter(g => g.last_played).length;
      statsEl.textContent = `${shown} game${state.games.length !== 1 ? 's' : ''} in collection${rated ? ` · ${rated} rated` : ''}${played ? ` · ${played} played` : ''}`;
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
      const reason = state.search ? 'search' : 'filter';
      container.innerHTML = `<div class="loading-spinner"><p style="color:var(--text-3)">No games match your ${reason}.</p></div>`;
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
    // Fetch sessions alongside opening
    let sessions = [];
    try {
      sessions = await API.getSessions(game.id);
    } catch (_) { /* non-fatal */ }

    const contentEl = buildModalContent(game, sessions, handleSaveGame, handleDeleteGame, handleAddSession, handleDeleteSession, handleUploadInstructions, handleDeleteInstructions, handleUploadImage, handleDeleteImage);
    openModal(contentEl);
  }

  async function handleSaveGame(gameId, payload) {
    try {
      const updated = await API.updateGame(gameId, payload);
      showToast('Changes saved!', 'success');
      closeModal();
      const idx = state.games.findIndex(g => g.id === gameId);
      if (idx !== -1) state.games[idx] = updated;
      renderCollection();
      refreshStatsBackground();
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
      refreshStatsBackground();
    } catch (err) {
      showToast(`Failed to remove: ${err.message}`, 'error');
    }
  }

  async function handleAddSession(gameId, sessionData, onSuccess) {
    try {
      const created = await API.addSession(gameId, sessionData);
      showToast('Session logged!', 'success');
      // Update last_played in local state
      const idx = state.games.findIndex(g => g.id === gameId);
      if (idx !== -1 && created.played_at) {
        const current = state.games[idx].last_played;
        if (!current || created.played_at > current) {
          state.games[idx].last_played = created.played_at;
        }
      }
      if (onSuccess) onSuccess(created);
    } catch (err) {
      showToast(`Failed to log session: ${err.message}`, 'error');
    }
  }

  async function handleDeleteSession(sessionId, onSuccess) {
    try {
      await API.deleteSession(sessionId);
      if (onSuccess) onSuccess(sessionId);
    } catch (err) {
      showToast(`Failed to delete session: ${err.message}`, 'error');
    }
  }

  async function handleUploadInstructions(gameId, file, onSuccess) {
    try {
      await API.uploadInstructions(gameId, file);
      showToast('Instructions uploaded!', 'success');
      const idx = state.games.findIndex(g => g.id === gameId);
      if (idx !== -1) state.games[idx].instructions_filename = file.name;
      if (onSuccess) onSuccess(file.name);
    } catch (err) {
      showToast(`Upload failed: ${err.message}`, 'error');
    }
  }

  async function handleDeleteInstructions(gameId, onSuccess) {
    try {
      await API.deleteInstructions(gameId);
      showToast('Instructions removed.', 'success');
      const idx = state.games.findIndex(g => g.id === gameId);
      if (idx !== -1) state.games[idx].instructions_filename = null;
      if (onSuccess) onSuccess();
    } catch (err) {
      showToast(`Failed to remove instructions: ${err.message}`, 'error');
    }
  }

  async function handleUploadImage(gameId, file, onSuccess) {
    try {
      await API.uploadImage(gameId, file);
      showToast('Image updated!', 'success');
      const idx = state.games.findIndex(g => g.id === gameId);
      if (idx !== -1) state.games[idx].image_url = `/api/games/${gameId}/image`;
      if (onSuccess) onSuccess();
    } catch (err) {
      showToast(`Image upload failed: ${err.message}`, 'error');
    }
  }

  async function handleDeleteImage(gameId, onSuccess) {
    try {
      await API.deleteImage(gameId);
      showToast('Image removed.', 'success');
      const idx = state.games.findIndex(g => g.id === gameId);
      if (idx !== -1) state.games[idx].image_url = null;
      if (onSuccess) onSuccess();
    } catch (err) {
      showToast(`Failed to remove image: ${err.message}`, 'error');
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
    const form         = document.getElementById('manual-form');
    const fileInput    = document.getElementById('add-image-file');
    const urlInput     = document.getElementById('m-image-url');
    const preview      = document.getElementById('add-image-preview');
    const removeBtn    = document.getElementById('add-image-remove');

    function setPreview(src) {
      const safe = src && (isSafeUrl(src) || src.startsWith('blob:'));
      if (safe) {
        preview.innerHTML = `<img src="${escapeHtml(src)}" alt="Preview">`;
        removeBtn.style.display = '';
      } else {
        preview.innerHTML = '<span class="image-edit-empty">No image</span>';
        removeBtn.style.display = 'none';
      }
    }

    fileInput.addEventListener('change', () => {
      if (!fileInput.files[0]) return;
      urlInput.value = '';
      setPreview(URL.createObjectURL(fileInput.files[0]));
    });

    urlInput.addEventListener('input', () => {
      const url = urlInput.value.trim();
      if (url) {
        fileInput.value = '';
        setPreview(url);
      } else {
        setPreview(null);
      }
    });

    removeBtn.addEventListener('click', () => {
      fileInput.value = '';
      urlInput.value  = '';
      setPreview(null);
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd   = new FormData(form);
      const file = fileInput.files[0];

      function csvToJson(key) {
        const val = fd.get(key) || '';
        const items = val.split(',').map(s => s.trim()).filter(Boolean);
        return items.length ? JSON.stringify(items) : null;
      }

      const purchasePriceRaw = fd.get('purchase_price');
      const payload = {
        name:              fd.get('name'),
        status:            fd.get('status') || 'owned',
        year_published:    parseInt(fd.get('year_published')) || null,
        min_players:       parseInt(fd.get('min_players')) || null,
        max_players:       parseInt(fd.get('max_players')) || null,
        min_playtime:      parseInt(fd.get('min_playtime')) || null,
        max_playtime:      parseInt(fd.get('max_playtime')) || null,
        difficulty:        parseFloat(fd.get('difficulty')) || null,
        // If a file is selected, skip the URL — image will be uploaded after creation
        image_url:         file ? null : (fd.get('image_url') || null),
        description:       fd.get('description') || null,
        categories:        csvToJson('categories_raw'),
        mechanics:         csvToJson('mechanics_raw'),
        designers:         csvToJson('designers_raw'),
        publishers:        csvToJson('publishers_raw'),
        labels:            csvToJson('labels_raw'),
        purchase_date:     fd.get('purchase_date') || null,
        purchase_price:    purchasePriceRaw !== '' ? (parseFloat(purchasePriceRaw) || null) : null,
        purchase_location: fd.get('purchase_location') || null,
      };

      try {
        const created = await API.createGame(payload);
        if (file) {
          try {
            await API.uploadImage(created.id, file);
          } catch (imgErr) {
            showToast(`Game added but image upload failed: ${imgErr.message}`, 'error');
          }
        }
        showToast(`"${payload.name}" added to collection!`, 'success');
        form.reset();
        setPreview(null);
        switchView('collection');
        refreshStatsBackground();
      } catch (err) {
        showToast(`Failed to add game: ${err.message}`, 'error');
      }
    });
  }

  // ===== Status Pills =====
  function bindStatusPills() {
    document.querySelectorAll('#status-pills .pill').forEach(btn => {
      btn.addEventListener('click', () => {
        state.statusFilter = btn.dataset.status;
        document.querySelectorAll('#status-pills .pill').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        renderCollection();
      });
    });
  }

  // ===== Stats =====
  async function loadStats() {
    const el = document.getElementById('stats-content');
    el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading statistics…</p></div>';
    try {
      const stats = await API.getStats();
      el.innerHTML = '';
      el.appendChild(buildStatsView(stats, state.games));
    } catch (err) {
      el.innerHTML = `<div class="loading-spinner"><p style="color:var(--danger)">Failed to load stats: ${escapeHtml(err.message)}</p></div>`;
    }
  }

  async function refreshStatsBackground() {
    try {
      const stats = await API.getStats();
      const el = document.getElementById('stats-content');
      el.innerHTML = '';
      el.appendChild(buildStatsView(stats, state.games));
    } catch (_) { /* non-fatal */ }
  }

})();
