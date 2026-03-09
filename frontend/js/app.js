/**
 * Cardboard – main application logic
 */

(function () {
  'use strict';

  // ===== Theme =====
  const THEME_KEY = 'cardboard_theme';

  function bindThemeToggle() {
    const btn = document.getElementById('theme-toggle-btn');
    if (!btn) return;
    const update = () => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      btn.title = isLight ? 'Switch to dark mode' : 'Switch to light mode';
    };
    update();
    btn.addEventListener('click', () => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      if (isLight) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem(THEME_KEY, 'dark');
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem(THEME_KEY, 'light');
      }
      update();
    });
  }

  // ===== Collection Prefs =====
  const COLLECTION_PREFS_KEY = 'cardboard_collection_prefs';
  const COLLECTION_PREFS_DEFAULTS = { sortBy: 'name', sortDir: 'asc', viewMode: 'grid', statusFilter: 'owned' };

  function loadCollectionPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(COLLECTION_PREFS_KEY) || '{}');
      return { ...COLLECTION_PREFS_DEFAULTS, ...saved };
    } catch { return { ...COLLECTION_PREFS_DEFAULTS }; }
  }

  function saveCollectionPrefs() {
    localStorage.setItem(COLLECTION_PREFS_KEY, JSON.stringify({
      sortBy: state.sortBy, sortDir: state.sortDir,
      viewMode: state.viewMode, statusFilter: state.statusFilter,
    }));
  }

  // ===== Transient UI state (not persisted) =====
  let hoveredGame  = null;  // game card the mouse is currently over
  let activeModal  = null;  // { game, mode } when the game modal is open

  // ===== Milestones =====
  const MILESTONE_STORAGE_KEY    = 'cardboard_milestones';
  const COUNT_MILESTONES         = [5, 10, 25, 50, 100, 200];
  const HOURS_MILESTONES         = [5, 10, 25, 50, 100];
  const CONFETTI_COUNT_THRESHOLD = 25;  // play count milestones ≥ this value launch confetti
  const CONFETTI_HOURS_THRESHOLD = 10;  // hours milestones ≥ this value launch confetti

  function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function loadMilestones() {
    try { return JSON.parse(localStorage.getItem(MILESTONE_STORAGE_KEY) || '[]'); }
    catch { return []; }
  }
  function saveMilestones(list) {
    localStorage.setItem(MILESTONE_STORAGE_KEY, JSON.stringify(list));
  }

  // ===== State =====
  const _cp = loadCollectionPrefs();
  let state = {
    games: [],
    viewMode: _cp.viewMode,
    sortBy: _cp.sortBy,
    sortDir: _cp.sortDir,
    search: '',
    statusFilter: _cp.statusFilter,
    filterNeverPlayed: false,
    filterPlayers: null,
    filterTime: null,
    filterMechanics: [],
    filterCategories: [],
    showExpansions: false,
  };

  // ===== Init =====
  function syncCollectionUI() {
    const sortByEl   = document.getElementById('sort-by');
    const sortDirBtn = document.getElementById('sort-dir');
    const gridBtn    = document.getElementById('view-grid');
    const listBtn    = document.getElementById('view-list');

    if (sortByEl) sortByEl.value = state.sortBy;

    if (sortDirBtn) {
      sortDirBtn.dataset.dir = state.sortDir;
      sortDirBtn.setAttribute('title', state.sortDir === 'asc' ? 'Sort ascending' : 'Sort descending');
      sortDirBtn.querySelector('svg').style.transform = state.sortDir === 'desc' ? 'scaleY(-1)' : '';
    }

    if (gridBtn) gridBtn.classList.toggle('active', state.viewMode === 'grid');
    if (listBtn) listBtn.classList.toggle('active', state.viewMode === 'list');

    document.querySelectorAll('#status-pills .pill').forEach(pill => {
      pill.classList.toggle('active', pill.dataset.status === state.statusFilter);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindNav();
    bindCollectionControls();
    bindStatusPills();
    bindFilters();
    bindAddGame();
    bindModalBackdrop();
    bindKeyboardShortcuts();
    bindShortcutsOverlay();
    bindThemeToggle();
    syncCollectionUI();
    const initialView = location.hash.replace('#', '') || 'collection';
    const validViews = ['collection', 'add', 'stats'];
    switchView(validViews.includes(initialView) ? initialView : 'collection');
  });

  // ===== Navigation =====
  function bindNav() {
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetView = btn.dataset.view;
        const targetViewEl = document.getElementById(`view-${targetView}`);
        
        // If already on the target view, smooth scroll to top
        if (targetViewEl && targetViewEl.classList.contains('active')) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          switchView(targetView);
        }
      });
    });

    // Add click handlers for logo to return to home
    const logoIcon = document.querySelector('.logo-icon');
    const logoText = document.querySelector('.logo-text');
    
    function handleLogoClick() {
      const collectionView = document.getElementById('view-collection');
      if (collectionView && collectionView.classList.contains('active')) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        switchView('collection');
      }
    }

    if (logoIcon) logoIcon.addEventListener('click', handleLogoClick);
    if (logoText) logoText.addEventListener('click', handleLogoClick);
  }

  function switchView(view) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('[data-view]').forEach(btn => btn.classList.remove('active'));
    const viewEl = document.getElementById(`view-${view}`);
    if (viewEl) viewEl.classList.add('active');
    document.querySelectorAll(`[data-view="${view}"]`).forEach(btn => btn.classList.add('active'));
    location.hash = view === 'collection' ? '' : view;
    if (view === 'collection') loadCollection();
    if (view === 'stats') {
      const statsContent = document.getElementById('stats-content');
      if (statsContent && statsContent.children.length > 0) {
        refreshStatsBackground(); // return visit — show existing data instantly, refresh silently
      } else {
        loadStats();              // first visit — show spinner, fetch, render
      }
    }
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
      saveCollectionPrefs();
      loadCollection();
    });

    sortDirBtn.addEventListener('click', () => {
      state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      sortDirBtn.dataset.dir = state.sortDir;
      sortDirBtn.setAttribute('title', state.sortDir === 'asc' ? 'Sort ascending' : 'Sort descending');
      sortDirBtn.querySelector('svg').style.transform = state.sortDir === 'desc' ? 'scaleY(-1)' : '';
      saveCollectionPrefs();
      loadCollection();
    });

    gridBtn.addEventListener('click', () => {
      state.viewMode = 'grid';
      gridBtn.classList.add('active');
      listBtn.classList.remove('active');
      saveCollectionPrefs();
      renderCollection();
    });

    listBtn.addEventListener('click', () => {
      state.viewMode = 'list';
      listBtn.classList.add('active');
      gridBtn.classList.remove('active');
      saveCollectionPrefs();
      renderCollection();
    });

    const expansionsBtn = document.getElementById('show-expansions-btn');
    if (expansionsBtn) {
      expansionsBtn.addEventListener('click', () => {
        state.showExpansions = !state.showExpansions;
        expansionsBtn.classList.toggle('active', state.showExpansions);
        expansionsBtn.setAttribute('aria-pressed', state.showExpansions);
        expansionsBtn.title = state.showExpansions ? 'Hide expansions' : 'Show expansions';
        renderCollection();
      });
    }
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
      // Hide expansions by default; search always overrides so matching expansions appear
      if (g.parent_game_id && !state.showExpansions && !search) return false;
      if (search && !g.name.toLowerCase().includes(search)) return false;
      if (state.filterNeverPlayed && g.last_played) return false;
      if (state.filterPlayers !== null) {
        const p = state.filterPlayers;
        const lo = g.min_players ?? 1;
        const hi = g.max_players ?? Infinity;
        if (p < lo || p > hi) return false;
      }
      if (state.filterTime !== null) {
        const t = state.filterTime;
        const lo = g.min_playtime ?? 0;
        const hi = g.max_playtime ?? Infinity;
        if (t < lo || t > hi) return false;
      }
      if (state.filterMechanics.length > 0) {
        const gm = parseList(g.mechanics);
        if (!state.filterMechanics.some(m => gm.includes(m))) return false;
      }
      if (state.filterCategories.length > 0) {
        const gc = parseList(g.categories);
        if (!state.filterCategories.some(c => gc.includes(c))) return false;
      }
      return true;
    });

    if (state.games.length > 0) {
      const baseGames = state.games.filter(g => !g.parent_game_id);
      const expansionCount = state.games.length - baseGames.length;
      const totalLabel = expansionCount > 0
        ? `${baseGames.length} game${baseGames.length !== 1 ? 's' : ''} (+${expansionCount} expansion${expansionCount !== 1 ? 's' : ''})`
        : `${state.games.length} game${state.games.length !== 1 ? 's' : ''}`;
      const shown = filtered.length !== state.games.length ? `${filtered.length} shown of ${totalLabel}` : totalLabel;
      const rated  = state.games.filter(g => g.user_rating).length;
      const played = state.games.filter(g => g.last_played).length;
      statsEl.textContent = `${shown} in collection${rated ? ` · ${rated} rated` : ''}${played ? ` · ${played} played` : ''}`;
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
      const reason = state.search ? 'search' : 'filters';
      container.innerHTML = `<div class="loading-spinner"><p style="color:var(--text-3)">No games match your ${reason}.</p></div>`;
      return;
    }

    container.className = state.viewMode === 'grid' ? 'games-grid' : 'games-list';

    // Pre-compute expansion counts for base games
    const expansionCounts = {};
    state.games.forEach(g => {
      if (g.parent_game_id) expansionCounts[g.parent_game_id] = (expansionCounts[g.parent_game_id] || 0) + 1;
    });

    filtered.forEach(game => {
      const gameWithMeta = Object.assign({}, game, {
        _expansionCount: expansionCounts[game.id] || 0,
      });
      const el = state.viewMode === 'grid' ? buildGameCard(gameWithMeta) : buildGameListItem(gameWithMeta);
      el.addEventListener('mouseenter', () => { hoveredGame = game; });
      el.addEventListener('mouseleave', () => { hoveredGame = null; });
      el.addEventListener('click', (e) => {
        if (e.target.closest('model-viewer, .scan-ar-placeholder, .quick-owned-btn, .quick-log-btn')) return;
        openGameModal(game);
      });

      el.querySelector('.quick-owned-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        handleQuickStatusChange(game.id, 'owned');
      });

      el.querySelector('.quick-log-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openQuickLogSession(game);
      });

      // Card image area → gallery lightbox (only when gallery images exist)
      if (state.viewMode === 'grid') {
        const cardMedia = el.querySelector('.game-card-image');
        if (cardMedia && game.image_url && game.image_url.includes('/images/') && !game.scan_featured) {
          cardMedia.classList.add('gallery-clickable');
          cardMedia.addEventListener('click', async (e) => {
            e.stopPropagation();
            const imgs = await API.getImages(game.id).catch(() => []);
            if (imgs.length) openGalleryLightbox(imgs, 0);
          });
        }
      }

      container.appendChild(el);
    });
  }

  // ===== Game Modal =====
  async function openGameModal(game, mode = 'view', onBack = null) {
    const [sessResult, imgResult] = await Promise.allSettled([
      API.getSessions(game.id),
      API.getImages(game.id),
    ]);
    const sessions = sessResult.status === 'fulfilled' ? sessResult.value : [];
    const images   = imgResult.status  === 'fulfilled' ? imgResult.value  : [];

    const onSwitchToEdit = () => openGameModal(game, 'edit', onBack);
    const onSwitchToView = () => {
      const fresh = state.games.find(g => g.id === game.id) || game;
      openGameModal(fresh, 'view', onBack);
    };

    const contentEl = buildModalContent(
      game, sessions,
      handleSaveGame, handleDeleteGame,
      handleAddSession, handleDeleteSession,
      handleUploadInstructions, handleDeleteInstructions,
      handleUploadImage, handleDeleteImage,
      handleUploadScan, handleDeleteScan,
      images,
      handleUploadGalleryImage, handleDeleteGalleryImage, handleReorderGalleryImages,
      handleUploadScanGlb, handleDeleteScanGlb, handleSetScanFeatured,
      handleAddGalleryImageFromUrl,
      handleUpdateGalleryImageCaption,
      mode, onSwitchToEdit, onSwitchToView,
      state.games,
      (targetGame) => openGameModal(targetGame, 'view', () => openGameModal(game, 'view', onBack)),
    );

    if (onBack) {
      const backBtn = document.createElement('button');
      backBtn.className = 'modal-back-btn';
      backBtn.setAttribute('aria-label', 'Back');
      backBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>`;
      backBtn.addEventListener('click', onBack);
      const hero = contentEl.querySelector('.modal-hero');
      if (hero) hero.appendChild(backBtn);
    }

    activeModal = { game, mode };
    openModal(contentEl);
  }

  function openQuickLogSession(game) {
    const today = new Date().toISOString().split('T')[0];
    const overlay = document.createElement('div');
    overlay.className = 'quick-log-overlay';
    overlay.innerHTML = `
      <div class="quick-log-backdrop"></div>
      <div class="quick-log-popup">
        <div class="quick-log-header">
          <span class="quick-log-label">Log Play</span>
          <span class="quick-log-game">${escapeHtml(game.name)}</span>
        </div>
        <div class="quick-log-form">
          <div class="quick-log-field">
            <label for="ql-date">Date</label>
            <input type="date" id="ql-date" class="form-input" value="${today}">
          </div>
          <div class="quick-log-field">
            <label for="ql-players">Players</label>
            <input type="number" id="ql-players" class="form-input" min="1" max="20" placeholder="optional">
          </div>
          <div class="quick-log-field">
            <label for="ql-duration">Duration (min)</label>
            <input type="number" id="ql-duration" class="form-input" min="1" placeholder="optional">
          </div>
          <div class="quick-log-field ql-full">
            <label for="ql-notes">Notes</label>
            <input type="text" id="ql-notes" class="form-input" placeholder="optional">
          </div>
        </div>
        <div class="quick-log-actions">
          <button class="btn btn-primary btn-sm" id="ql-submit">Log Play</button>
          <button class="btn btn-ghost btn-sm" id="ql-cancel">Cancel</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));
    document.body.style.overflow = 'hidden';
    overlay.querySelector('#ql-date').focus();

    function close() {
      document.removeEventListener('keydown', onKeyDown);
      overlay.classList.remove('open');
      setTimeout(() => { overlay.remove(); document.body.style.overflow = ''; }, 200);
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') { close(); }
    }

    overlay.querySelector('.quick-log-backdrop').addEventListener('click', close);
    overlay.querySelector('#ql-cancel').addEventListener('click', close);
    document.addEventListener('keydown', onKeyDown);

    overlay.querySelector('#ql-submit').addEventListener('click', () => {
      const dateVal = overlay.querySelector('#ql-date').value;
      if (!dateVal) { showToast('Please enter a date.', 'error'); return; }
      handleAddSession(game.id, {
        played_at:        dateVal,
        player_count:     parseInt(overlay.querySelector('#ql-players').value, 10) || null,
        duration_minutes: parseInt(overlay.querySelector('#ql-duration').value, 10) || null,
        notes:            overlay.querySelector('#ql-notes').value.trim() || null,
      }, () => {
        renderCollection();
        refreshStatsBackground();
      });
      close();
    });
  }

  async function handleQuickStatusChange(gameId, newStatus) {
    try {
      const updated = await API.updateGame(gameId, { status: newStatus });
      const idx = state.games.findIndex(g => g.id === gameId);
      if (idx !== -1) state.games[idx] = updated;
      renderCollection();
      refreshStatsBackground();
      showToast('Added to collection!', 'success');
    } catch (err) {
      showToast(`Update failed: ${err.message}`, 'error');
    }
  }

  async function handleSaveGame(gameId, payload) {
    try {
      const updated = await API.updateGame(gameId, payload);
      showToast('Changes saved!', 'success');
      activeModal = null;
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
      activeModal = null;
      closeModal();
      state.games = state.games.filter(g => g.id !== gameId);
      renderCollection();
      refreshStatsBackground();
    } catch (err) {
      showToast(`Failed to remove: ${err.message}`, 'error');
    }
  }

  async function checkAndShowMilestones(gameId, gameName) {
    try {
      const sessions   = await API.getSessions(gameId);
      const count      = sessions.length;
      const totalHours = sessions.reduce((s, p) => s + (p.duration_minutes || 0), 0) / 60;
      const earned     = loadMilestones();
      const seenKeys   = new Set(earned.map(m => m.key));
      const newOnes    = [];

      for (const n of COUNT_MILESTONES) {
        const key = `${gameId}:count:${n}`;
        if (count >= n && !seenKeys.has(key))
          newOnes.push({ key, gameId, gameName, type: 'count', value: n, earnedAt: new Date().toISOString() });
      }
      for (const h of HOURS_MILESTONES) {
        const key = `${gameId}:hours:${h}`;
        if (totalHours >= h && !seenKeys.has(key))
          newOnes.push({ key, gameId, gameName, type: 'hours', value: h, earnedAt: new Date().toISOString() });
      }

      if (!newOnes.length) return;
      saveMilestones([...earned, ...newOnes]);
      newOnes.forEach((m, i) => setTimeout(() => {
        const msg = m.type === 'count'
          ? `🎉 ${ordinal(m.value)} play of ${m.gameName}!`
          : `⏱ ${m.value} hours with ${m.gameName}!`;
        showMilestoneToast(msg, m.gameId, (id) => {
          const g = state.games.find(g => g.id === id);
          if (g) openGameModal(g);
        });
        const bigEnough = m.type === 'count' ? m.value >= CONFETTI_COUNT_THRESHOLD : m.value >= CONFETTI_HOURS_THRESHOLD;
        if (bigEnough) launchConfetti();
      }, i * 900));
    } catch (_) { /* non-fatal: never block normal session logging */ }
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
      // Milestone check fires after callback so UI updates first
      const gameName = state.games[idx]?.name || 'this game';
      checkAndShowMilestones(gameId, gameName);
    } catch (err) {
      showToast(`Failed to log session: ${err.message}`, 'error');
    }
  }

  async function handleDeleteSession(sessionId, gameId, onSuccess) {
    try {
      await API.deleteSession(sessionId);
      // Refresh last_played in local state — the backend recalculates it on delete
      try {
        const updated = await API.getGame(gameId);
        const idx = state.games.findIndex(g => g.id === gameId);
        if (idx !== -1) state.games[idx].last_played = updated.last_played;
      } catch (_) { /* non-fatal */ }
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

  async function handleUploadScanGlb(gameId, file, onSuccess) {
    try {
      await API.uploadScanGlb(gameId, file);
      showToast('GLB scan uploaded!', 'success');
      const idx = state.games.findIndex(g => g.id === gameId);
      if (idx !== -1) state.games[idx].scan_glb_filename = file.name;
      if (onSuccess) onSuccess(file.name);
    } catch (err) { showToast(`GLB upload failed: ${err.message}`, 'error'); }
  }

  async function handleDeleteScanGlb(gameId, onSuccess) {
    try {
      await API.deleteScanGlb(gameId);
      showToast('GLB scan removed.', 'success');
      const idx = state.games.findIndex(g => g.id === gameId);
      if (idx !== -1) {
        state.games[idx].scan_glb_filename = null;
        if (!state.games[idx].scan_filename) state.games[idx].scan_featured = false;
      }
      if (onSuccess) onSuccess();
    } catch (err) { showToast(`Failed to remove GLB scan: ${err.message}`, 'error'); }
  }

  async function handleSetScanFeatured(gameId, featured, onSuccess) {
    try {
      const updated = await API.updateGame(gameId, { scan_featured: featured });
      const idx = state.games.findIndex(g => g.id === gameId);
      if (idx !== -1) state.games[idx].scan_featured = updated.scan_featured;
      renderCollection();
      if (onSuccess) onSuccess(updated.scan_featured);
    } catch (err) { showToast(`Failed to update featured state: ${err.message}`, 'error'); }
  }

  async function handleUploadScan(gameId, file, onSuccess) {
    try {
      await API.uploadScan(gameId, file);
      showToast('3D scan uploaded!', 'success');
      const idx = state.games.findIndex(g => g.id === gameId);
      if (idx !== -1) state.games[idx].scan_filename = file.name;
      if (onSuccess) onSuccess(file.name);
    } catch (err) {
      showToast(`Scan upload failed: ${err.message}`, 'error');
    }
  }

  async function handleDeleteScan(gameId, onSuccess) {
    try {
      await API.deleteScan(gameId);
      showToast('3D scan removed.', 'success');
      const idx = state.games.findIndex(g => g.id === gameId);
      if (idx !== -1) {
        state.games[idx].scan_filename = null;
        if (!state.games[idx].scan_glb_filename) state.games[idx].scan_featured = false;
      }
      if (onSuccess) onSuccess();
    } catch (err) {
      showToast(`Failed to remove 3D scan: ${err.message}`, 'error');
    }
  }

  // ===== Gallery (Multi-Image) =====

  async function handleUploadGalleryImage(gameId, file, onSuccess) {
    try {
      const newImg = await API.uploadGalleryImage(gameId, file);
      // If first gallery image, update local state image_url
      if (newImg.sort_order === 0) {
        const idx = state.games.findIndex(g => g.id === gameId);
        if (idx !== -1) state.games[idx].image_url = `/api/games/${gameId}/images/${newImg.id}/file`;
      }
      if (onSuccess) onSuccess(newImg);
    } catch (err) {
      showToast(`Photo upload failed: ${err.message}`, 'error');
    }
  }

  async function handleDeleteGalleryImage(gameId, imgId, newPrimaryUrl, onSuccess) {
    try {
      await API.deleteGalleryImage(gameId, imgId);
      const idx = state.games.findIndex(g => g.id === gameId);
      if (idx !== -1) state.games[idx].image_url = newPrimaryUrl;
      if (onSuccess) onSuccess();
    } catch (err) {
      showToast(`Failed to remove photo: ${err.message}`, 'error');
    }
  }

  async function handleReorderGalleryImages(gameId, orderedIds, newPrimaryUrl, onSuccess) {
    try {
      await API.reorderGalleryImages(gameId, orderedIds);
      const idx = state.games.findIndex(g => g.id === gameId);
      if (idx !== -1) state.games[idx].image_url = newPrimaryUrl;
      if (onSuccess) onSuccess();
    } catch (err) {
      showToast(`Failed to reorder photos: ${err.message}`, 'error');
    }
  }

  async function handleUpdateGalleryImageCaption(gameId, imgId, caption, onSuccess) {
    try {
      const updated = await API.updateGalleryImage(gameId, imgId, { caption });
      if (onSuccess) onSuccess(updated);
    } catch (err) {
      showToast(`Failed to save caption: ${err.message}`, 'error');
    }
  }

  async function handleAddGalleryImageFromUrl(gameId, url, onSuccess, onError) {
    try {
      const newImg = await API.addGalleryImageFromUrl(gameId, url);
      if (newImg.sort_order === 0) {
        const idx = state.games.findIndex(g => g.id === gameId);
        if (idx !== -1) state.games[idx].image_url = `/api/games/${gameId}/images/${newImg.id}/file`;
      }
      showToast('Image added!', 'success');
      if (onSuccess) onSuccess(newImg);
    } catch (err) {
      showToast(`Failed to add image: ${err.message}`, 'error');
      if (onError) onError();
    }
  }

  // ===== Modal Backdrop =====
  function bindModalBackdrop() {
    document.getElementById('modal-backdrop').addEventListener('click', () => { activeModal = null; closeModal(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { activeModal = null; closeModal(); }
    });
  }

  // ===== Keyboard Shortcuts =====
  function bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        document.querySelector('[data-view="add"]')?.click();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        if (!document.getElementById('view-collection')?.classList.contains('active')) {
          switchView('collection');
        }
        document.getElementById('collection-search')?.focus();
      } else if (e.key === 'e' || e.key === 'E') {
        if (activeModal && activeModal.mode === 'view') {
          e.preventDefault();
          openGameModal(activeModal.game, 'edit');
        } else if (!activeModal && hoveredGame) {
          e.preventDefault();
          openGameModal(hoveredGame, 'edit');
        }
      }
    });
  }

  // ===== Shortcuts Overlay =====
  function bindShortcutsOverlay() {
    const btn = document.getElementById('shortcuts-btn');
    if (!btn) return;

    const SHORTCUTS = [
      { key: 'N', desc: 'Add a new game' },
      { key: 'S', desc: 'Focus the search bar' },
      { key: 'E', desc: 'Edit hovered or open game' },
      { key: 'Esc', desc: 'Close modal or overlay' },
    ];

    btn.addEventListener('click', () => {
      const overlay = document.createElement('div');
      overlay.className = 'shortcuts-overlay';
      overlay.innerHTML = `
        <div class="shortcuts-panel">
          <div class="shortcuts-header">
            <span class="shortcuts-title">Keyboard Shortcuts</span>
            <button class="shortcuts-close" aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <ul class="shortcuts-list">
            ${SHORTCUTS.map(s => `
              <li class="shortcuts-row">
                <kbd class="kbd">${escapeHtml(s.key)}</kbd>
                <span class="shortcuts-desc">${escapeHtml(s.desc)}</span>
              </li>`).join('')}
          </ul>
        </div>`;

      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('open'));

      function close() {
        overlay.classList.remove('open');
        document.removeEventListener('keydown', onKey);
        setTimeout(() => overlay.remove(), 180);
      }

      function onKey(e) { if (e.key === 'Escape') close(); }

      overlay.querySelector('.shortcuts-close').addEventListener('click', close);
      overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
      document.addEventListener('keydown', onKey);
    });
  }

  // ===== Add Game =====
  function bindAddGame() {
    const form         = document.getElementById('manual-form');
    const fileInput    = document.getElementById('add-image-file');
    const urlInput     = document.getElementById('m-image-url');
    const preview      = document.getElementById('add-image-preview');
    const removeBtn    = document.getElementById('add-image-remove');
    let previewBlobUrl = null;

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
      if (previewBlobUrl) { URL.revokeObjectURL(previewBlobUrl); previewBlobUrl = null; }
      previewBlobUrl = URL.createObjectURL(fileInput.files[0]);
      setPreview(previewBlobUrl);
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
      if (previewBlobUrl) { URL.revokeObjectURL(previewBlobUrl); previewBlobUrl = null; }
      setPreview(null);
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('[type="submit"]');
      const fd   = new FormData(form);
      const file = fileInput.files[0];

      function csvToJson(key) {
        const val = fd.get(key) || '';
        const items = val.split(',').map(s => s.trim()).filter(Boolean);
        return items.length ? JSON.stringify(items) : null;
      }

      const purchasePriceRaw = fd.get('purchase_price');
      const purchasePriceParsed = parseFloat(purchasePriceRaw);
      const payload = {
        name:              fd.get('name'),
        status:            fd.get('status') || 'owned',
        year_published:    parseInt(fd.get('year_published'), 10) || null,
        min_players:       parseInt(fd.get('min_players'), 10) || null,
        max_players:       parseInt(fd.get('max_players'), 10) || null,
        min_playtime:      parseInt(fd.get('min_playtime'), 10) || null,
        max_playtime:      parseInt(fd.get('max_playtime'), 10) || null,
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
        purchase_price:    Number.isFinite(purchasePriceParsed) ? purchasePriceParsed : null,
        purchase_location: fd.get('purchase_location') || null,
        location:           fd.get('location') || null,
        show_location:      fd.get('show_location') === 'on',
      };

      const lastAdded = state.games.reduce((max, g) => {
        const d = g.date_added ? new Date(g.date_added) : new Date(0);
        return d > max ? d : max;
      }, new Date(0));

      try {
        await withLoading(submitBtn, async () => {
          const created = await API.createGame(payload);
          if (file) {
            try {
              await API.uploadGalleryImage(created.id, file);
            } catch (imgErr) {
              showToast(`Game added but image upload failed: ${imgErr.message}`, 'error');
            }
          }
          showToast(`"${payload.name}" added to collection!`, 'success');
          const lastAddedDay = lastAdded.getTime() > 0 ? lastAdded.toDateString() : null;
          if (!lastAddedDay || lastAddedDay !== new Date().toDateString()) launchConfetti();
          form.reset();
          if (previewBlobUrl) { URL.revokeObjectURL(previewBlobUrl); previewBlobUrl = null; }
          setPreview(null);
          switchView('collection');
          refreshStatsBackground();
        }, 'Adding…');
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
        saveCollectionPrefs();
        renderCollection();
      });
    });
  }

  // ===== Advanced Filters =====
  function renderFilterChips() {
    const mechRow = document.getElementById('filter-mechanics-chips');
    const catRow  = document.getElementById('filter-categories-chips');

    function buildChips(container, items, stateKey) {
      container.innerHTML = '';
      if (!items.length) { container.style.display = 'none'; return; }
      container.style.display = 'flex';
      items.forEach(name => {
        const btn = document.createElement('button');
        btn.className = 'filter-pill' + (state[stateKey].includes(name) ? ' active' : '');
        btn.type = 'button';
        btn.textContent = name;
        btn.addEventListener('click', () => {
          if (state[stateKey].includes(name)) {
            state[stateKey] = state[stateKey].filter(v => v !== name);
            btn.classList.remove('active');
          } else {
            state[stateKey] = [...state[stateKey], name];
            btn.classList.add('active');
          }
          renderCollection();
        });
        container.appendChild(btn);
      });
    }

    const mc = {}, cc = {};
    state.games.forEach(g => {
      parseList(g.mechanics).forEach(m => { if (m) mc[m] = (mc[m] || 0) + 1; });
      parseList(g.categories).forEach(c => { if (c) cc[c] = (cc[c] || 0) + 1; });
    });
    const topM = Object.entries(mc).sort(([, a], [, b]) => b - a).slice(0, 10).map(([n]) => n);
    const topC = Object.entries(cc).sort(([, a], [, b]) => b - a).slice(0, 10).map(([n]) => n);

    buildChips(mechRow, topM, 'filterMechanics');
    buildChips(catRow,  topC, 'filterCategories');
  }

  function bindFilters() {
    const panel      = document.getElementById('filter-panel');
    const searchEl   = document.getElementById('collection-search');
    const searchWrap = searchEl.closest('.search-wrapper');
    const neverBtn   = document.getElementById('filter-never-played');
    const playersEl  = document.getElementById('filter-players');
    const timeEl     = document.getElementById('filter-time');
    const clearBtn   = document.getElementById('filter-clear-all');
    const pickBtn    = document.getElementById('pick-for-me-btn');

    function hasActiveFilters() {
      return state.filterNeverPlayed || state.filterPlayers !== null ||
        state.filterTime !== null || state.filterMechanics.length > 0 ||
        state.filterCategories.length > 0;
    }

    function updatePickBtn() {
      pickBtn.style.display = (state.filterPlayers !== null || state.filterTime !== null) ? '' : 'none';
    }

    function openPanel()  { renderFilterChips(); panel.classList.add('open'); }
    function closePanel() { if (!hasActiveFilters()) panel.classList.remove('open'); }

    searchEl.addEventListener('click', openPanel);

    document.addEventListener('mousedown', e => {
      if (!panel.contains(e.target) && !searchWrap.contains(e.target)) closePanel();
    });

    neverBtn.addEventListener('click', () => {
      state.filterNeverPlayed = !state.filterNeverPlayed;
      neverBtn.classList.toggle('active', state.filterNeverPlayed);
      renderCollection();
    });

    let playerDebounce, timeDebounce;

    playersEl.addEventListener('input', () => {
      clearTimeout(playerDebounce);
      playerDebounce = setTimeout(() => {
        state.filterPlayers = playersEl.value ? parseInt(playersEl.value, 10) : null;
        updatePickBtn();
        renderCollection();
      }, 300);
    });

    timeEl.addEventListener('input', () => {
      clearTimeout(timeDebounce);
      timeDebounce = setTimeout(() => {
        state.filterTime = timeEl.value ? parseInt(timeEl.value, 10) : null;
        updatePickBtn();
        renderCollection();
      }, 300);
    });

    pickBtn.addEventListener('click', () => {
      const search = (state.search || '').toLowerCase();
      const matching = state.games.filter(g => {
        if (g.parent_game_id) return false;  // expansions can't be played standalone
        if (state.statusFilter !== 'all' && g.status !== state.statusFilter) return false;
        if (search && !g.name.toLowerCase().includes(search)) return false;
        if (state.filterNeverPlayed && g.last_played) return false;
        if (state.filterPlayers !== null) {
          const p = state.filterPlayers;
          if (p < (g.min_players ?? 1) || p > (g.max_players ?? Infinity)) return false;
        }
        if (state.filterTime !== null) {
          const t = state.filterTime;
          if (t < (g.min_playtime ?? 0) || t > (g.max_playtime ?? Infinity)) return false;
        }
        if (state.filterMechanics.length > 0) {
          if (!state.filterMechanics.some(m => parseList(g.mechanics).includes(m))) return false;
        }
        if (state.filterCategories.length > 0) {
          if (!state.filterCategories.some(c => parseList(g.categories).includes(c))) return false;
        }
        return true;
      });
      if (!matching.length) { showToast('No matching games found.', 'error'); return; }
      const picked = matching[Math.floor(Math.random() * matching.length)];
      openGameModal(picked);
    });

    clearBtn.addEventListener('click', () => {
      state.filterNeverPlayed = false;
      state.filterPlayers = null;
      state.filterTime = null;
      state.filterMechanics = [];
      state.filterCategories = [];
      neverBtn.classList.remove('active');
      playersEl.value = '';
      timeEl.value = '';
      document.querySelectorAll('#filter-mechanics-chips .filter-pill, #filter-categories-chips .filter-pill')
        .forEach(el => el.classList.remove('active'));
      updatePickBtn();
      panel.classList.remove('open');
      renderCollection();
    });
  }

  // ===== Stats =====
  const STATS_PREFS_KEY = 'cardboard_stats_prefs';
  const STATS_PREFS_DEFAULTS = {
    show_summary: true, show_most_played: true, show_recently_played: true,
    show_recently_added: true,
    show_ratings: true, show_labels: true, show_added_by_month: true,
    show_sessions_by_month: true, show_never_played: true,
    show_dormant: true, show_top_mechanics: true, show_collection_value: true,
    show_milestones: true,
    added_by_month_include_wishlist: true,
    section_order: ['summary', 'most_played', 'recently_played', 'recently_added',
                    'ratings', 'labels', 'added_by_month', 'sessions_by_month',
                    'never_played', 'dormant', 'top_mechanics', 'collection_value',
                    'milestones'],
  };

  function loadStatsPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(STATS_PREFS_KEY) || '{}');
      const merged = { ...STATS_PREFS_DEFAULTS, ...saved };
      // Keep saved order but append any newly added sections at the end
      const all = STATS_PREFS_DEFAULTS.section_order;
      const valid = (merged.section_order || []).filter(k => all.includes(k));
      merged.section_order = [...valid, ...all.filter(k => !valid.includes(k))];
      return merged;
    } catch { return { ...STATS_PREFS_DEFAULTS }; }
  }

  function saveStatsPrefs(newPrefs) {
    localStorage.setItem(STATS_PREFS_KEY, JSON.stringify(newPrefs));
  }

  const EXPORT_COLS = [
    { key: 'name',              label: 'Name',               list: false, on: true  },
    { key: 'status',            label: 'Status',             list: false, on: true  },
    { key: 'year_published',    label: 'Year Published',     list: false, on: true  },
    { key: 'min_players',       label: 'Min Players',        list: false, on: true  },
    { key: 'max_players',       label: 'Max Players',        list: false, on: true  },
    { key: 'min_playtime',      label: 'Min Playtime (min)', list: false, on: true  },
    { key: 'max_playtime',      label: 'Max Playtime (min)', list: false, on: true  },
    { key: 'difficulty',        label: 'Difficulty',         list: false, on: true  },
    { key: 'user_rating',       label: 'Rating',             list: false, on: true  },
    { key: 'user_notes',        label: 'Notes',              list: false, on: true  },
    { key: 'description',       label: 'Description',        list: false, on: false },
    { key: 'labels',            label: 'Labels',             list: true,  on: true  },
    { key: 'categories',        label: 'Categories',         list: true,  on: true  },
    { key: 'mechanics',         label: 'Mechanics',          list: true,  on: true  },
    { key: 'designers',         label: 'Designers',          list: true,  on: true  },
    { key: 'publishers',        label: 'Publishers',         list: true,  on: true  },
    { key: 'purchase_date',     label: 'Purchase Date',      list: false, on: true  },
    { key: 'purchase_price',    label: 'Purchase Price',     list: false, on: true  },
    { key: 'purchase_location', label: 'Purchase Location',  list: false, on: true  },
    { key: 'location',          label: 'Location',           list: false, on: true  },
    { key: 'last_played',       label: 'Last Played',        list: false, on: true  },
    { key: 'date_added',        label: 'Date Added',         list: false, on: true  },
    { key: 'date_modified',     label: 'Date Modified',      list: false, on: false },
    { key: 'image_url',         label: 'Image URL',          list: false, on: false },
  ];

  const EXPORT_PREFS_KEY = 'cardboard_export_prefs';

  function loadExportPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(EXPORT_PREFS_KEY) || '{}');
      return EXPORT_COLS.map(c => ({ ...c, on: c.key in saved ? saved[c.key] : c.on }));
    } catch { return EXPORT_COLS.map(c => ({ ...c })); }
  }

  function saveExportPrefs(cols) {
    const obj = {};
    cols.forEach(c => { obj[c.key] = c.on; });
    localStorage.setItem(EXPORT_PREFS_KEY, JSON.stringify(obj));
  }

  function _closeExportDropdown(e) {
    const wrapper = document.getElementById('stats-export-cols-wrapper');
    if (!wrapper || wrapper.contains(e.target)) return;
    const dd = document.getElementById('stats-export-cols-dropdown');
    const btn = document.getElementById('stats-export-cols-btn');
    if (dd) dd.hidden = true;
    if (btn) btn.classList.remove('open');
  }

  function exportCollectionJSON(cols) {
    const enabled = cols.filter(c => c.on);
    const data = state.games.map(g => {
      const out = {};
      enabled.forEach(c => { out[c.key] = g[c.key] ?? null; });
      return out;
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cardboard-export-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function exportCollectionCSV(cols) {
    const enabled = cols.filter(c => c.on);
    function csvField(val) {
      if (val == null) return '';
      const s = String(val);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    }
    const rows = [enabled.map(c => c.label).join(',')];
    for (const g of state.games) {
      rows.push(enabled.map(c => csvField(c.list ? parseList(g[c.key]).join('; ') : g[c.key])).join(','));
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cardboard-export-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function wireStatsView(statsView) {
    const exportCols = loadExportPrefs();
    const colsDropdown = statsView.querySelector('#stats-export-cols-dropdown');
    colsDropdown.innerHTML = exportCols.map(c => `
      <label class="export-col-item">
        <input type="checkbox" value="${c.key}"${c.on ? ' checked' : ''}>
        <span>${c.label}</span>
      </label>`).join('');
    colsDropdown.querySelectorAll('input').forEach(cb => {
      cb.addEventListener('change', () => {
        const col = exportCols.find(c => c.key === cb.value);
        if (col) col.on = cb.checked;
        saveExportPrefs(exportCols);
      });
    });
    const colsBtn = statsView.querySelector('#stats-export-cols-btn');
    colsBtn.addEventListener('click', e => {
      e.stopPropagation();
      colsDropdown.hidden = !colsDropdown.hidden;
      colsBtn.classList.toggle('open', !colsDropdown.hidden);
    });
    document.removeEventListener('click', _closeExportDropdown);
    document.addEventListener('click', _closeExportDropdown);
    statsView.querySelector('#stats-export-json').addEventListener('click', () => exportCollectionJSON(exportCols));
    statsView.querySelector('#stats-export-csv').addEventListener('click', () => exportCollectionCSV(exportCols));
    const wishlistToggle = statsView.querySelector('#added-wishlist-toggle');
    if (wishlistToggle) {
      wishlistToggle.addEventListener('change', () => {
        const prefs = loadStatsPrefs();
        prefs.added_by_month_include_wishlist = wishlistToggle.checked;
        saveStatsPrefs(prefs);
        const chart = statsView.querySelector('#added-by-month-chart');
        if (chart) chart.innerHTML = buildAddedByMonthHtml(state.games, wishlistToggle.checked);
      });
    }
    const bucketFilters = {
      '1\u20132':  r => r <= 2,
      '3\u20134':  r => r > 2 && r <= 4,
      '5\u20136':  r => r > 4 && r <= 6,
      '7\u20138':  r => r > 6 && r <= 8,
      '9\u201310': r => r > 8,
    };

    statsView.addEventListener('click', e => {
      const ratingRow = e.target.closest('.stat-bar-row[data-bucket]');
      if (ratingRow) {
        if (!parseInt(ratingRow.dataset.count || '0', 10)) return;
        const bucket = ratingRow.dataset.bucket;
        const filterFn = bucketFilters[bucket];
        const gamesForBucket = filterFn
          ? state.games.filter(g => g.user_rating != null && filterFn(g.user_rating))
          : [];
        const n = gamesForBucket.length;
        const label = `Rated ${bucket} \u00b7 ${n} game${n !== 1 ? 's' : ''}`;
        function showRatingList() {
          const listEl = buildMonthGameList(label, gamesForBucket,
            game => openGameModal(game, 'view', showRatingList),
            closeModal
          );
          openModal(listEl);
        }
        showRatingList();
        return;
      }

      const barRow = e.target.closest('.stat-bar-row[data-month]');
      if (barRow) {
        if (!parseInt(barRow.dataset.count || '0', 10)) return;
        const month = barRow.dataset.month;
        const type  = barRow.dataset.type;
        let gamesForMonth;
        if (type === 'added') {
          const parts = month.split(' ');
          if (parts.length !== 2) return;
          const [mon, yr] = parts;
          const monthIndex = new Date(`${mon} 1 ${yr}`).getMonth() + 1;
          const target = `${yr}-${String(monthIndex).padStart(2, '0')}`;
          const includeWishlist = statsView.querySelector('#added-wishlist-toggle')?.checked ?? true;
          gamesForMonth = state.games.filter(g =>
            g.date_added && g.date_added.slice(0, 7) === target &&
            (includeWishlist || g.status !== 'wishlist')
          );
        } else {
          const ids = JSON.parse(barRow.dataset.gameIds || '[]');
          gamesForMonth = ids.map(id => state.games.find(g => g.id === id)).filter(Boolean);
        }
        const n = gamesForMonth.length;
        const label = type === 'added'
          ? `${month} · ${n} game${n !== 1 ? 's' : ''} added`
          : `${month} · ${n} game${n !== 1 ? 's' : ''} played`;
        function showList() {
          const listEl = buildMonthGameList(label, gamesForMonth,
            game => openGameModal(game, 'view', showList),
            closeModal
          );
          openModal(listEl);
        }
        showList();
        return;
      }

      const moreBtn = e.target.closest('.insight-more-btn');
      if (moreBtn) {
        const overflow = moreBtn.previousElementSibling;
        const isOpen = overflow.classList.contains('open');
        if (!isOpen) {
          overflow.style.maxHeight = overflow.scrollHeight + 'px';
          overflow.classList.add('open');
          moreBtn.classList.add('open');
          moreBtn.textContent = 'Show less';
        } else {
          overflow.style.maxHeight = '0';
          overflow.classList.remove('open');
          moreBtn.classList.remove('open');
          moreBtn.textContent = `+${moreBtn.dataset.count} more`;
        }
        return;
      }
      const row = e.target.closest('.insight-game-row[data-game-id], .most-played-item[data-game-id], .recent-session-item[data-game-id]');
      if (!row) return;
      const game = state.games.find(g => g.id === parseInt(row.dataset.gameId, 10));
      if (game) openGameModal(game);
    });
  }

  function _injectMilestonesIntoGrid(statsView, prefs) {
    const milestonesEl = buildMilestonesSection(
      loadMilestones(),
      (gameId) => { const g = state.games.find(g => g.id === gameId); if (g) openGameModal(g); },
      () => saveMilestones([]),
    );
    milestonesEl.dataset.section = 'milestones';
    if (prefs.show_milestones === false) milestonesEl.style.display = 'none';
    const sectionsGrid = statsView.querySelector('#stats-sections');
    const order = prefs.section_order;
    const milIdx = order.indexOf('milestones');
    const nextKey = milIdx >= 0 ? order[milIdx + 1] : undefined;
    const nextEl = nextKey ? sectionsGrid.querySelector(`[data-section="${nextKey}"]`) : null;
    sectionsGrid.insertBefore(milestonesEl, nextEl); // insertBefore(el, null) === appendChild
  }

  async function loadStats() {
    const el = document.getElementById('stats-content');
    el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading statistics…</p></div>';
    try {
      const stats = await API.getStats();
      const prefs = loadStatsPrefs();
      el.innerHTML = '';
      const statsView = buildStatsView(stats, state.games, prefs, saveStatsPrefs);
      el.appendChild(statsView);
      wireStatsView(statsView);
      _injectMilestonesIntoGrid(statsView, prefs);
    } catch (err) {
      el.innerHTML = `<div class="loading-spinner"><p style="color:var(--danger)">Failed to load stats: ${escapeHtml(err.message)}</p></div>`;
    }
  }

  async function refreshStatsBackground() {
    if (!document.getElementById('view-stats')?.classList.contains('active')) return;
    try {
      const stats = await API.getStats();
      const prefs = loadStatsPrefs();
      const el = document.getElementById('stats-content');
      el.innerHTML = '';
      const statsView = buildStatsView(stats, state.games, prefs, saveStatsPrefs);
      el.appendChild(statsView);
      wireStatsView(statsView);
      _injectMilestonesIntoGrid(statsView, prefs);
    } catch (_) { /* non-fatal */ }
  }

})();
