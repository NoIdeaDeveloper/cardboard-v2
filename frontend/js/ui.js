/**
 * Cardboard – UI helpers and component builders
 */

// ===== Notifications =====

function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('hide'); setTimeout(() => toast.remove(), 400); }, duration);
}

function showConfirm(title, message) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-dialog">
        <h3 class="confirm-title">${escapeHtml(title)}</h3>
        <p class="confirm-message">${escapeHtml(message)}</p>
        <div class="confirm-actions">
          <button class="btn btn-secondary" id="confirm-cancel">Cancel</button>
          <button class="btn btn-danger" id="confirm-ok">Remove</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#confirm-cancel').addEventListener('click', () => { overlay.remove(); resolve(false); });
    overlay.querySelector('#confirm-ok').addEventListener('click', () => { overlay.remove(); resolve(true); });
  });
}

// ===== Display Helpers =====

function renderStars(rating) {
  const filled = Math.round((rating || 0) / 2);
  let html = '<div class="rating-stars">';
  for (let i = 1; i <= 5; i++) {
    html += `<svg class="star${i <= filled ? '' : ' empty'}" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
  }
  return html + '</div>';
}

function renderDifficultyBar(difficulty) {
  if (!difficulty) return '';
  const filled = Math.round(difficulty);
  let bars = '';
  for (let i = 1; i <= 5; i++) {
    bars += `<div class="diff-segment${i <= filled ? ' filled' : ''}"></div>`;
  }
  const label = difficulty <= 2 ? 'Light' : difficulty <= 3.5 ? 'Medium' : 'Heavy';
  return `<div class="difficulty-bar">${bars}</div><span class="diff-label">${label}</span>`;
}

function formatPlaytime(min, max) {
  if (!min && !max) return null;
  if (min === max || !max) return `${min} min`;
  return `${min}–${max} min`;
}

function formatPlayers(min, max) {
  if (!min && !max) return null;
  if (min === max || !max) return `${min} player${min !== 1 ? 's' : ''}`;
  return `${min}–${max} players`;
}

function formatDate(isoDate) {
  if (!isoDate) return null;
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function parseList(json) {
  try { return JSON.parse(json) || []; } catch { return []; }
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function placeholderSvg() {
  return `<svg class="placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
    <rect x="2" y="6" width="20" height="14" rx="2"/><rect x="6" y="2" width="12" height="4" rx="1"/>
    <circle cx="12" cy="13" r="3"/><circle cx="12" cy="13" r="1.2" fill="currentColor" stroke="none"/>
  </svg>`;
}

// ===== Game Card (Grid) =====

function buildGameCard(game) {
  const el = document.createElement('div');
  el.className = 'game-card';

  const playtime = formatPlaytime(game.min_playtime, game.max_playtime);
  const players  = formatPlayers(game.min_players, game.max_players);

  let metaHtml = '';
  if (players)  metaHtml += `<span class="chip">${escapeHtml(players)}</span>`;
  if (playtime) metaHtml += `<span class="chip">${escapeHtml(playtime)}</span>`;
  if (game.year_published) metaHtml += `<span class="chip">${game.year_published}</span>`;

  const ratingHtml = game.user_rating
    ? `${renderStars(game.user_rating)}<span class="rating-num">${game.user_rating}</span>`
    : `<span class="unrated">Unrated</span>`;

  const lastPlayedHtml = game.last_played
    ? `<span class="last-played-line">Played ${escapeHtml(formatDate(game.last_played))}</span>`
    : '';

  el.innerHTML = `
    <div class="game-card-image">
      ${game.image_url
        ? `<img src="${escapeHtml(game.image_url)}" alt="${escapeHtml(game.name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">${placeholderSvg().replace('class="placeholder-icon"', 'class="placeholder-icon" style="display:none"')}`
        : placeholderSvg()}
    </div>
    <div class="game-card-body">
      <div class="game-card-title">${escapeHtml(game.name)}</div>
      ${metaHtml ? `<div class="game-card-meta">${metaHtml}</div>` : ''}
      <div class="game-card-footer">
        <div class="rating-row">${ratingHtml}</div>
        ${lastPlayedHtml}
      </div>
    </div>`;

  return el;
}

// ===== Game List Item =====

function buildGameListItem(game) {
  const el = document.createElement('div');
  el.className = 'game-list-item';

  const playtime = formatPlaytime(game.min_playtime, game.max_playtime);
  const players  = formatPlayers(game.min_players, game.max_players);
  const metaParts = [players, playtime, game.difficulty ? `Difficulty ${game.difficulty.toFixed(1)}` : null].filter(Boolean);

  const ratingHtml = game.user_rating
    ? `${renderStars(game.user_rating)}<span class="rating-num">${game.user_rating}</span>`
    : `<span class="unrated">Unrated</span>`;

  el.innerHTML = `
    <div class="list-thumb">
      ${game.image_url
        ? `<img src="${escapeHtml(game.image_url)}" alt="${escapeHtml(game.name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">${placeholderSvg().replace('class="placeholder-icon"', 'class="placeholder-icon" style="display:none"')}`
        : placeholderSvg()}
    </div>
    <div class="list-info">
      <div class="list-title">${escapeHtml(game.name)}</div>
      ${metaParts.length ? `<div class="list-meta">${metaParts.map(escapeHtml).join(' · ')}</div>` : ''}
      ${game.last_played ? `<div class="last-played-line">Played ${escapeHtml(formatDate(game.last_played))}</div>` : ''}
    </div>
    <div class="list-rating">${ratingHtml}</div>`;

  return el;
}

// ===== Modal =====

function buildModalContent(game, sessions, onSave, onDelete, onAddSession, onDeleteSession, onUploadInstructions, onDeleteInstructions) {
  const el = document.createElement('div');

  const categories = parseList(game.categories);
  const mechanics  = parseList(game.mechanics);
  const designers  = parseList(game.designers);
  const publishers = parseList(game.publishers);

  // Hero
  const heroHtml = game.image_url
    ? `<div class="modal-hero" style="background-image:url('${escapeHtml(game.image_url)}')">
        <div class="modal-hero-overlay"></div>
        <button class="modal-close" id="modal-close-btn" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`
    : `<div class="modal-hero modal-hero-placeholder">
        ${placeholderSvg()}
        <button class="modal-close" id="modal-close-btn" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`;

  // Info chips
  const playtime = formatPlaytime(game.min_playtime, game.max_playtime);
  const players  = formatPlayers(game.min_players, game.max_players);
  let chipsHtml = '';
  if (players)  chipsHtml += `<span class="chip">${escapeHtml(players)}</span>`;
  if (playtime) chipsHtml += `<span class="chip">${escapeHtml(playtime)}</span>`;
  if (game.difficulty) chipsHtml += `<span class="chip chip-difficulty">${game.difficulty.toFixed(1)} weight</span>`;
  if (game.year_published) chipsHtml += `<span class="chip">${game.year_published}</span>`;

  function tagsBlock(label, items) {
    if (!items.length) return '';
    return `<div class="modal-tags-group">
      <span class="modal-tags-label">${label}</span>
      <div class="modal-tags">${items.slice(0, 12).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
    </div>`;
  }

  function buildSessionsHtml(list) {
    if (!list.length) return '<p class="no-sessions">No sessions logged yet.</p>';
    return list.map(s => `
      <div class="session-item" data-session-id="${s.id}">
        <div class="session-info">
          <span class="session-date">${escapeHtml(formatDate(s.played_at))}</span>
          ${s.player_count ? `<span class="session-meta">${s.player_count} player${s.player_count !== 1 ? 's' : ''}</span>` : ''}
          ${s.duration_minutes ? `<span class="session-meta">${s.duration_minutes} min</span>` : ''}
          ${s.notes ? `<span class="session-notes">${escapeHtml(s.notes)}</span>` : ''}
        </div>
        <button class="session-delete" data-session-id="${s.id}" title="Delete session">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>`).join('');
  }

  const hasInstructions = !!game.instructions_filename;

  el.innerHTML = `
    ${heroHtml}
    <div class="modal-body">
      <div class="modal-title-row">
        <h2 class="modal-title" id="modal-title">${escapeHtml(game.name)}</h2>
        ${game.year_published ? `<span class="modal-year">${game.year_published}</span>` : ''}
      </div>

      ${chipsHtml ? `<div class="modal-chips">${chipsHtml}</div>` : ''}
      ${game.difficulty ? `<div class="modal-difficulty">${renderDifficultyBar(game.difficulty)}</div>` : ''}

      ${tagsBlock('Categories', categories)}
      ${tagsBlock('Mechanics', mechanics)}
      ${tagsBlock('Designers', designers)}
      ${tagsBlock('Publishers', publishers)}

      <div class="modal-section">
        <div class="section-label">My Rating</div>
        <div class="rating-widget">
          <div class="rating-stars-interactive" id="rating-stars">
            ${Array.from({length: 10}, (_, i) => i + 1).map(n =>
              `<button class="star-btn${(game.user_rating || 0) >= n ? ' active' : ''}" data-value="${n}" aria-label="${n} stars">
                <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              </button>`).join('')}
          </div>
          <span class="rating-display" id="rating-display">${game.user_rating || '—'}</span>
          <button class="btn btn-ghost btn-sm" id="rating-clear">Clear</button>
        </div>
      </div>

      <div class="modal-section">
        <div class="section-label">Last Played</div>
        <div class="last-played-row">
          <input type="date" id="last-played-input" class="date-input" value="${game.last_played || ''}">
          <button class="btn btn-ghost btn-sm" id="today-btn">Today</button>
        </div>
      </div>

      ${game.description ? `
      <div class="modal-section">
        <div class="section-label">Description</div>
        <div class="description-text" id="desc-text">${escapeHtml(game.description)}</div>
        <button class="btn btn-ghost btn-sm" id="desc-toggle" style="margin-top:6px">Show more</button>
      </div>` : ''}

      <div class="modal-section">
        <div class="section-label">My Notes</div>
        <textarea id="user-notes" class="notes-input" rows="3" placeholder="Personal notes, house rules, favourite moments…">${escapeHtml(game.user_notes || '')}</textarea>
      </div>

      <div class="modal-section">
        <div class="section-label">Rulebook</div>
        <div class="instructions-existing" id="instructions-existing" style="${hasInstructions ? '' : 'display:none'}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <a href="/api/games/${game.id}/instructions" target="_blank" class="instructions-link">${escapeHtml(game.instructions_filename || '')}</a>
          <button class="btn btn-ghost btn-sm" id="delete-instructions-btn">Remove</button>
        </div>
        <div class="instructions-upload" id="instructions-upload" style="${hasInstructions ? 'display:none' : ''}">
          <label class="upload-label">
            <input type="file" id="instructions-file-input" accept=".pdf,.txt" style="display:none">
            <span class="btn btn-secondary btn-sm upload-trigger">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Upload PDF or TXT
            </span>
          </label>
        </div>
      </div>

      <div class="modal-section">
        <div class="section-label-row">
          <div class="section-label">Play History</div>
          <button class="btn btn-ghost btn-sm" id="log-session-toggle">+ Log Session</button>
        </div>
        <div class="log-session-form" id="log-session-form" style="display:none">
          <div class="session-form-grid">
            <div class="form-group">
              <label>Date</label>
              <input type="date" id="session-date" class="form-input" value="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group">
              <label>Players</label>
              <input type="number" id="session-players" class="form-input" placeholder="4" min="1" max="20">
            </div>
            <div class="form-group">
              <label>Duration (min)</label>
              <input type="number" id="session-duration" class="form-input" placeholder="90" min="1">
            </div>
            <div class="form-group full-width">
              <label>Notes</label>
              <input type="text" id="session-notes" class="form-input" placeholder="Who won? Any highlights?">
            </div>
          </div>
          <div class="session-form-actions">
            <button class="btn btn-primary btn-sm" id="session-submit">Save Session</button>
            <button class="btn btn-ghost btn-sm" id="session-cancel">Cancel</button>
          </div>
        </div>
        <div class="sessions-list" id="sessions-list">${buildSessionsHtml(sessions)}</div>
      </div>

      <details class="edit-details">
        <summary class="edit-details-summary">Edit Game Details</summary>
        <div class="edit-form-grid">
          <div class="form-group full-width">
            <label>Name</label>
            <input type="text" id="edit-name" class="form-input" value="${escapeHtml(game.name)}">
          </div>
          <div class="form-group">
            <label>Year</label>
            <input type="number" id="edit-year" class="form-input" value="${game.year_published || ''}">
          </div>
          <div class="form-group">
            <label>Min Players</label>
            <input type="number" id="edit-min-players" class="form-input" value="${game.min_players || ''}">
          </div>
          <div class="form-group">
            <label>Max Players</label>
            <input type="number" id="edit-max-players" class="form-input" value="${game.max_players || ''}">
          </div>
          <div class="form-group">
            <label>Min Playtime (min)</label>
            <input type="number" id="edit-min-playtime" class="form-input" value="${game.min_playtime || ''}">
          </div>
          <div class="form-group">
            <label>Max Playtime (min)</label>
            <input type="number" id="edit-max-playtime" class="form-input" value="${game.max_playtime || ''}">
          </div>
          <div class="form-group">
            <label>Difficulty (1–5)</label>
            <input type="number" id="edit-difficulty" class="form-input" min="1" max="5" step="0.1" value="${game.difficulty || ''}">
          </div>
          <div class="form-group">
            <label>Image URL</label>
            <input type="url" id="edit-image-url" class="form-input" value="${escapeHtml(game.image_url || '')}">
          </div>
          <div class="form-group full-width">
            <label>Description</label>
            <textarea id="edit-description" class="form-input" rows="3">${escapeHtml(game.description || '')}</textarea>
          </div>
          <div class="form-group full-width">
            <label>Categories <span class="hint">(comma-separated)</span></label>
            <input type="text" id="edit-categories" class="form-input" value="${escapeHtml(categories.join(', '))}">
          </div>
          <div class="form-group full-width">
            <label>Mechanics <span class="hint">(comma-separated)</span></label>
            <input type="text" id="edit-mechanics" class="form-input" value="${escapeHtml(mechanics.join(', '))}">
          </div>
          <div class="form-group full-width">
            <label>Designers <span class="hint">(comma-separated)</span></label>
            <input type="text" id="edit-designers" class="form-input" value="${escapeHtml(designers.join(', '))}">
          </div>
          <div class="form-group full-width">
            <label>Publishers <span class="hint">(comma-separated)</span></label>
            <input type="text" id="edit-publishers" class="form-input" value="${escapeHtml(publishers.join(', '))}">
          </div>
        </div>
      </details>

      <div class="modal-actions">
        <button class="btn btn-danger" id="delete-game-btn">Remove from Collection</button>
        <div class="modal-actions-right">
          <button class="btn btn-secondary" id="cancel-btn">Cancel</button>
          <button class="btn btn-primary" id="save-btn">Save Changes</button>
        </div>
      </div>
    </div>`;

  // ===== Wire events =====

  el.querySelector('#modal-close-btn').addEventListener('click', closeModal);
  el.querySelector('#cancel-btn').addEventListener('click', closeModal);

  // Rating
  let selectedRating = game.user_rating || null;
  const starsContainer = el.querySelector('#rating-stars');
  const ratingDisplay  = el.querySelector('#rating-display');

  function updateStarDisplay(value) {
    starsContainer.querySelectorAll('.star-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.value) <= (value || 0));
    });
    ratingDisplay.textContent = value || '—';
  }

  starsContainer.addEventListener('mouseover', e => {
    const btn = e.target.closest('.star-btn');
    if (btn) updateStarDisplay(parseInt(btn.dataset.value));
  });
  starsContainer.addEventListener('mouseleave', () => updateStarDisplay(selectedRating));
  starsContainer.addEventListener('click', e => {
    const btn = e.target.closest('.star-btn');
    if (btn) { selectedRating = parseInt(btn.dataset.value); updateStarDisplay(selectedRating); }
  });
  el.querySelector('#rating-clear').addEventListener('click', () => { selectedRating = null; updateStarDisplay(null); });

  // Today button
  el.querySelector('#today-btn').addEventListener('click', () => {
    el.querySelector('#last-played-input').value = new Date().toISOString().split('T')[0];
  });

  // Description toggle
  const descText = el.querySelector('#desc-text');
  const descToggle = el.querySelector('#desc-toggle');
  if (descText && descToggle) {
    descText.style.webkitLineClamp = '4';
    descText.style.overflow = 'hidden';
    descText.style.display = '-webkit-box';
    descText.style.webkitBoxOrient = 'vertical';
    descToggle.addEventListener('click', () => {
      const expanded = descText.style.webkitLineClamp === 'unset';
      descText.style.webkitLineClamp = expanded ? '4' : 'unset';
      descToggle.textContent = expanded ? 'Show more' : 'Show less';
    });
  }

  // Instructions upload
  const fileInput = el.querySelector('#instructions-file-input');
  const uploadTrigger = el.querySelector('.upload-trigger');
  if (uploadTrigger) {
    uploadTrigger.addEventListener('click', () => fileInput && fileInput.click());
  }
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      onUploadInstructions(game.id, file, (filename) => {
        const existing = el.querySelector('#instructions-existing');
        existing.style.display = 'flex';
        existing.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <a href="/api/games/${game.id}/instructions" target="_blank" class="instructions-link">${escapeHtml(filename)}</a>
          <button class="btn btn-ghost btn-sm" id="delete-instructions-btn">Remove</button>`;
        el.querySelector('#instructions-upload').style.display = 'none';
        wireDeleteInstructions();
      });
    });
  }

  function wireDeleteInstructions() {
    const deleteBtn = el.querySelector('#delete-instructions-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        onDeleteInstructions(game.id, () => {
          el.querySelector('#instructions-existing').style.display = 'none';
          el.querySelector('#instructions-upload').style.display = 'block';
        });
      });
    }
  }
  wireDeleteInstructions();

  // Session toggle
  const sessionToggle = el.querySelector('#log-session-toggle');
  const sessionForm   = el.querySelector('#log-session-form');
  sessionToggle.addEventListener('click', () => {
    const open = sessionForm.style.display !== 'none';
    sessionForm.style.display = open ? 'none' : 'block';
    sessionToggle.textContent = open ? '+ Log Session' : '− Cancel';
  });
  el.querySelector('#session-cancel').addEventListener('click', () => {
    sessionForm.style.display = 'none';
    sessionToggle.textContent = '+ Log Session';
  });

  el.querySelector('#session-submit').addEventListener('click', () => {
    const dateVal = el.querySelector('#session-date').value;
    if (!dateVal) { showToast('Please enter a date.', 'error'); return; }

    const sessionData = {
      played_at:        dateVal,
      player_count:     parseInt(el.querySelector('#session-players').value) || null,
      duration_minutes: parseInt(el.querySelector('#session-duration').value) || null,
      notes:            el.querySelector('#session-notes').value.trim() || null,
    };

    onAddSession(game.id, sessionData, (created) => {
      const list = el.querySelector('#sessions-list');
      const noSessions = list.querySelector('.no-sessions');
      if (noSessions) noSessions.remove();

      const item = document.createElement('div');
      item.className = 'session-item';
      item.dataset.sessionId = created.id;
      item.innerHTML = `
        <div class="session-info">
          <span class="session-date">${escapeHtml(formatDate(created.played_at))}</span>
          ${created.player_count ? `<span class="session-meta">${created.player_count} player${created.player_count !== 1 ? 's' : ''}</span>` : ''}
          ${created.duration_minutes ? `<span class="session-meta">${created.duration_minutes} min</span>` : ''}
          ${created.notes ? `<span class="session-notes">${escapeHtml(created.notes)}</span>` : ''}
        </div>
        <button class="session-delete" data-session-id="${created.id}" title="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>`;
      list.prepend(item);

      el.querySelector('#session-players').value = '';
      el.querySelector('#session-duration').value = '';
      el.querySelector('#session-notes').value = '';
      sessionForm.style.display = 'none';
      sessionToggle.textContent = '+ Log Session';
    });
  });

  el.querySelector('#sessions-list').addEventListener('click', e => {
    const btn = e.target.closest('.session-delete');
    if (!btn) return;
    const sessionId = parseInt(btn.dataset.sessionId);
    onDeleteSession(sessionId, () => {
      const item = el.querySelector(`.session-item[data-session-id="${sessionId}"]`);
      if (item) item.remove();
      if (!el.querySelector('#sessions-list .session-item')) {
        el.querySelector('#sessions-list').innerHTML = '<p class="no-sessions">No sessions logged yet.</p>';
      }
    });
  });

  // Save
  function csvToJson(val) {
    const items = (val || '').split(',').map(s => s.trim()).filter(Boolean);
    return items.length ? JSON.stringify(items) : null;
  }

  el.querySelector('#save-btn').addEventListener('click', () => {
    const payload = {
      user_rating:      selectedRating || null,
      user_notes:       el.querySelector('#user-notes').value.trim() || null,
      last_played:      el.querySelector('#last-played-input').value || null,
      name:             el.querySelector('#edit-name').value.trim(),
      year_published:   parseInt(el.querySelector('#edit-year').value) || null,
      min_players:      parseInt(el.querySelector('#edit-min-players').value) || null,
      max_players:      parseInt(el.querySelector('#edit-max-players').value) || null,
      min_playtime:     parseInt(el.querySelector('#edit-min-playtime').value) || null,
      max_playtime:     parseInt(el.querySelector('#edit-max-playtime').value) || null,
      difficulty:       parseFloat(el.querySelector('#edit-difficulty').value) || null,
      image_url:        el.querySelector('#edit-image-url').value.trim() || null,
      description:      el.querySelector('#edit-description').value.trim() || null,
      categories:       csvToJson(el.querySelector('#edit-categories').value),
      mechanics:        csvToJson(el.querySelector('#edit-mechanics').value),
      designers:        csvToJson(el.querySelector('#edit-designers').value),
      publishers:       csvToJson(el.querySelector('#edit-publishers').value),
    };
    onSave(game.id, payload);
  });

  el.querySelector('#delete-game-btn').addEventListener('click', () => onDelete(game.id, game.name));

  return el;
}

// ===== Modal Management =====

function openModal(contentEl) {
  const inner = document.getElementById('modal-inner');
  inner.innerHTML = '';
  inner.appendChild(contentEl);
  const modal = document.getElementById('game-modal');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => modal.classList.add('open'));
}

function closeModal() {
  const modal = document.getElementById('game-modal');
  modal.classList.remove('open');
  setTimeout(() => {
    modal.style.display = 'none';
    document.getElementById('modal-inner').innerHTML = '';
    document.body.style.overflow = '';
  }, 200);
}
