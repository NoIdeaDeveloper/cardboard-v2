/**
 * Cardboard UI helpers
 */

// ===== Toast =====
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ===== Confirm Dialog =====
function showConfirm(title, message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-box">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>
        <div class="confirm-actions">
          <button class="btn btn-secondary" id="confirm-cancel">Cancel</button>
          <button class="btn btn-danger" id="confirm-ok">Delete</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#confirm-cancel').onclick = () => { overlay.remove(); resolve(false); };
    overlay.querySelector('#confirm-ok').onclick = () => { overlay.remove(); resolve(true); };
    overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } };
  });
}

// ===== Render Stars (display, 5-star scale from 1-10 rating) =====
function renderStars(rating) {
  // Convert 1-10 rating to nearest whole star out of 5 (e.g. 9 → 5, 7 → 4, 5 → 3)
  const filled = Math.round((rating || 0) / 2);
  let html = '<div class="rating-stars">';
  for (let i = 1; i <= 5; i++) {
    html += `<svg class="star${i <= filled ? '' : ' empty'}" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
  }
  html += '</div>';
  return html;
}

// ===== Difficulty Bar =====
function renderDifficultyBar(difficulty) {
  if (!difficulty) return '<span style="color:var(--text-3);font-size:0.75rem">—</span>';
  const labels = ['', 'Light', 'Light-Med', 'Medium', 'Med-Heavy', 'Heavy'];
  const filled = Math.round(difficulty);
  let html = '<div class="difficulty-bar"><div class="difficulty-segments">';
  for (let i = 1; i <= 5; i++) {
    html += `<div class="diff-seg${i <= filled ? ' filled' : ''}"></div>`;
  }
  html += `</div><span class="difficulty-label">${labels[filled] || difficulty.toFixed(1)}</span></div>`;
  return html;
}

// ===== Format playtime =====
function formatPlaytime(min, max) {
  if (!min && !max) return null;
  if (min === max || !max) return `${min} min`;
  if (!min) return `${max} min`;
  return `${min}–${max} min`;
}

// ===== Format players =====
function formatPlayers(min, max) {
  if (!min && !max) return null;
  if (min === max || !max) return `${min} player${min !== 1 ? 's' : ''}`;
  if (!min) return `1–${max} players`;
  return `${min}–${max} players`;
}

// ===== Format date =====
function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ===== Parse JSON list =====
function parseList(str) {
  if (!str) return [];
  try { return JSON.parse(str); } catch { return []; }
}

// ===== Escape HTML =====
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function placeholderSvg() {
  return `<div class="game-card-image-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg></div>`;
}

// ===== Build Game Card (grid) =====
function buildGameCard(game) {
  const playtime = formatPlaytime(game.min_playtime, game.max_playtime);
  const players  = formatPlayers(game.min_players, game.max_players);
  const chips = [players, playtime, game.year_published ? game.year_published : null]
    .filter(Boolean)
    .map(c => `<span class="meta-chip">${escapeHtml(String(c))}</span>`)
    .join('');

  const ratingHtml = game.user_rating
    ? `${renderStars(game.user_rating)}<span class="rating-value">${game.user_rating.toFixed(1)}</span>`
    : '<span style="font-size:0.72rem;color:var(--text-3)">Unrated</span>';

  const lastPlayed = game.last_played
    ? `<div class="game-card-last-played">Played ${formatDate(game.last_played)}</div>`
    : '';

  const imageHtml = game.thumbnail_url || game.image_url
    ? `<img src="${escapeHtml(game.thumbnail_url || game.image_url)}" alt="${escapeHtml(game.name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div class="game-card-image-placeholder" style="display:none">${placeholderSvg()}</div>`
    : placeholderSvg();

  const card = document.createElement('div');
  card.className = 'game-card';
  card.dataset.id = game.id;
  card.innerHTML = `
    <div class="game-card-image">${imageHtml}</div>
    <div class="game-card-body">
      <div class="game-card-name">${escapeHtml(game.name)}</div>
      <div class="game-card-meta">${chips}</div>
      <div class="game-card-rating">${ratingHtml}</div>
      ${lastPlayed}
    </div>`;
  return card;
}

// ===== Build Game List Item =====
function buildGameListItem(game) {
  const playtime = formatPlaytime(game.min_playtime, game.max_playtime);
  const players  = formatPlayers(game.min_players, game.max_players);

  const thumbHtml = (game.thumbnail_url || game.image_url)
    ? `<img src="${escapeHtml(game.thumbnail_url || game.image_url)}" alt="${escapeHtml(game.name)}" loading="lazy" onerror="this.style.display='none'" />`
    : `<div class="game-list-image-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg></div>`;

  const metaParts = [players, playtime, game.difficulty ? `Difficulty: ${game.difficulty.toFixed(1)}/5` : null]
    .filter(Boolean)
    .map(p => `<span>${escapeHtml(p)}</span>`)
    .join('');

  const ratingHtml = game.user_rating
    ? `${renderStars(game.user_rating)}<span class="rating-value" style="font-size:0.8rem;color:var(--gold)">${game.user_rating.toFixed(1)}</span>`
    : '';

  const item = document.createElement('div');
  item.className = 'game-list-item';
  item.dataset.id = game.id;
  item.innerHTML = `
    <div class="game-list-image">${thumbHtml}</div>
    <div class="game-list-info">
      <div class="game-list-name">${escapeHtml(game.name)}</div>
      <div class="game-list-meta">${metaParts}</div>
    </div>
    <div class="game-list-right">
      <div class="game-card-rating">${ratingHtml}</div>
      ${game.last_played ? `<span style="font-size:0.75rem;color:var(--text-3)">${formatDate(game.last_played)}</span>` : ''}
    </div>`;
  return item;
}

// ===== Build Modal Content =====
function buildModalContent(game, onSave, onDelete) {
  const categories = parseList(game.categories);
  const mechanics  = parseList(game.mechanics);
  const designers  = parseList(game.designers);
  const publishers = parseList(game.publishers);

  const playtime = formatPlaytime(game.min_playtime, game.max_playtime);
  const players  = formatPlayers(game.min_players, game.max_players);

  const heroHtml = (game.image_url || game.thumbnail_url)
    ? `<img class="modal-hero-image" src="${escapeHtml(game.image_url || game.thumbnail_url)}" alt="${escapeHtml(game.name)}" /><div class="modal-hero-overlay"></div>`
    : `<div class="modal-hero-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg></div>`;

  const chipsHtml = [
    players  ? `<span class="chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.87"/></svg>${escapeHtml(players)}</span>` : '',
    playtime ? `<span class="chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${escapeHtml(playtime)}</span>` : '',
    game.difficulty ? `<span class="chip accent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>Difficulty ${game.difficulty.toFixed(1)}/5</span>` : '',
    game.year_published ? `<span class="chip">${game.year_published}</span>` : '',
  ].filter(Boolean).join('');

  const tagsSections = [
    { title: 'Categories', list: categories },
    { title: 'Mechanics',  list: mechanics  },
    { title: 'Designers',  list: designers  },
    { title: 'Publishers', list: publishers },
  ].filter(s => s.list.length > 0);

  const tagsHtml = tagsSections.map(s => `
    <div class="modal-tags-section">
      <div class="modal-tags-title">${s.title}</div>
      <div class="tags-list">${s.list.slice(0, 12).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
    </div>`).join('');

  // Build interactive rating stars (1–10 mapped to 10 half-stars, shown as 10 full stars)
  const currentRating = game.user_rating || 0;
  let starsHtml = '';
  for (let i = 1; i <= 10; i++) {
    starsHtml += `<button class="star-btn${i <= currentRating ? ' filled' : ''}" data-val="${i}" title="${i}/10" aria-label="Rate ${i} out of 10">
      <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
    </button>`;
  }

  const lastPlayedVal = game.last_played || '';

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="modal-hero">${heroHtml}
      <button class="modal-close" id="modal-close-btn" aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="modal-body">
      <div class="modal-title-row">
        <h2 class="modal-title" id="modal-title">${escapeHtml(game.name)}</h2>
        ${game.year_published ? `<span class="modal-year">${game.year_published}</span>` : ''}
      </div>
      <div class="modal-chips">${chipsHtml}</div>

      <!-- Rating -->
      <div class="rating-widget">
        <span class="rating-label">My Rating</span>
        <div class="rating-stars-interactive" id="rating-stars">${starsHtml}</div>
        <span class="rating-number" id="rating-display">${currentRating ? currentRating.toFixed(1) : '—'}</span>
        <button class="clear-rating-btn" id="clear-rating">Clear</button>
      </div>

      <!-- Last Played -->
      <div class="last-played-row">
        <span class="last-played-label">Last Played</span>
        <input type="date" id="last-played-input" value="${lastPlayedVal}" />
        <button class="today-btn" id="today-btn">Today</button>
      </div>

      ${game.description ? `
        <div class="modal-description" id="modal-desc">${escapeHtml(game.description)}</div>
        <button class="description-toggle" id="desc-toggle">Show more</button>` : ''}

      ${tagsHtml}

      <!-- Notes -->
      <div class="notes-section">
        <label class="notes-label" for="notes-input">Personal Notes</label>
        <textarea class="notes-textarea" id="notes-input" placeholder="Add your own notes about this game…">${escapeHtml(game.user_notes || '')}</textarea>
      </div>

      <!-- Edit Details -->
      <details class="edit-mode-section" id="edit-details">
        <summary class="edit-mode-title" style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit Game Details
        </summary>
        <div style="margin-top:16px;">
          <div class="form-grid">
            <div class="form-group full-width">
              <label>Game Name</label>
              <input type="text" id="edit-name" value="${escapeHtml(game.name)}" />
            </div>
            <div class="form-group">
              <label>Year Published</label>
              <input type="number" id="edit-year" value="${game.year_published || ''}" min="1800" max="2030" />
            </div>
            <div class="form-group">
              <label>Min Players</label>
              <input type="number" id="edit-min-players" value="${game.min_players || ''}" min="1" max="20" />
            </div>
            <div class="form-group">
              <label>Max Players</label>
              <input type="number" id="edit-max-players" value="${game.max_players || ''}" min="1" max="20" />
            </div>
            <div class="form-group">
              <label>Min Playtime (min)</label>
              <input type="number" id="edit-min-playtime" value="${game.min_playtime || ''}" min="1" />
            </div>
            <div class="form-group">
              <label>Max Playtime (min)</label>
              <input type="number" id="edit-max-playtime" value="${game.max_playtime || ''}" min="1" />
            </div>
            <div class="form-group">
              <label>Difficulty (1–5)</label>
              <input type="number" id="edit-difficulty" value="${game.difficulty || ''}" min="1" max="5" step="0.1" />
            </div>
            <div class="form-group">
              <label>Image URL</label>
              <input type="url" id="edit-image-url" value="${escapeHtml(game.image_url || '')}" />
            </div>
            <div class="form-group full-width">
              <label>Description</label>
              <textarea id="edit-description" rows="4">${escapeHtml(game.description || '')}</textarea>
            </div>
            <div class="form-group full-width">
              <label>Categories <span class="hint">(comma-separated)</span></label>
              <input type="text" id="edit-categories" value="${escapeHtml(categories.join(', '))}" />
            </div>
            <div class="form-group full-width">
              <label>Mechanics <span class="hint">(comma-separated)</span></label>
              <input type="text" id="edit-mechanics" value="${escapeHtml(mechanics.join(', '))}" />
            </div>
            <div class="form-group full-width">
              <label>Designers <span class="hint">(comma-separated)</span></label>
              <input type="text" id="edit-designers" value="${escapeHtml(designers.join(', '))}" />
            </div>
            <div class="form-group full-width">
              <label>Publishers <span class="hint">(comma-separated)</span></label>
              <input type="text" id="edit-publishers" value="${escapeHtml(publishers.join(', '))}" />
            </div>
          </div>
        </div>
      </details>

      <!-- Actions -->
      <div class="modal-actions">
        <button class="btn btn-danger btn-sm" id="delete-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          Remove
        </button>
        <div class="modal-actions-right">
          <button class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
          <button class="btn btn-primary" id="save-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            Save Changes
          </button>
        </div>
      </div>
    </div>`;

  // Wire up interactive rating
  let selectedRating = currentRating;
  const starsContainer = el.querySelector('#rating-stars');
  const ratingDisplay = el.querySelector('#rating-display');

  function updateStarsDisplay(val) {
    starsContainer.querySelectorAll('.star-btn').forEach(btn => {
      const bVal = parseInt(btn.dataset.val, 10);
      btn.classList.toggle('filled', bVal <= val);
    });
    ratingDisplay.textContent = val ? val.toFixed(1) : '—';
  }

  starsContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.star-btn');
    if (!btn) return;
    selectedRating = parseInt(btn.dataset.val, 10);
    updateStarsDisplay(selectedRating);
  });

  // Hover preview
  starsContainer.addEventListener('mouseover', (e) => {
    const btn = e.target.closest('.star-btn');
    if (!btn) return;
    const hoverVal = parseInt(btn.dataset.val, 10);
    starsContainer.querySelectorAll('.star-btn').forEach(b => {
      b.classList.toggle('filled', parseInt(b.dataset.val, 10) <= hoverVal);
    });
  });

  starsContainer.addEventListener('mouseleave', () => {
    updateStarsDisplay(selectedRating);
  });

  el.querySelector('#clear-rating').addEventListener('click', () => {
    selectedRating = 0;
    updateStarsDisplay(0);
  });

  // Today btn
  el.querySelector('#today-btn').addEventListener('click', () => {
    el.querySelector('#last-played-input').value = new Date().toISOString().split('T')[0];
  });

  // Description toggle
  const descEl = el.querySelector('#modal-desc');
  const descToggle = el.querySelector('#desc-toggle');
  if (descEl && descToggle) {
    descToggle.addEventListener('click', () => {
      descEl.classList.toggle('expanded');
      descToggle.textContent = descEl.classList.contains('expanded') ? 'Show less' : 'Show more';
    });
  }

  // Close buttons
  el.querySelector('#modal-close-btn').addEventListener('click', () => closeModal());
  el.querySelector('#modal-cancel-btn').addEventListener('click', () => closeModal());

  // Save
  el.querySelector('#save-btn').addEventListener('click', async () => {
    function csvToJson(str) {
      if (!str.trim()) return null;
      return JSON.stringify(str.split(',').map(s => s.trim()).filter(Boolean));
    }

    const lastPlayedVal = el.querySelector('#last-played-input').value;
    const payload = {
      user_rating:   selectedRating || null,
      user_notes:    el.querySelector('#notes-input').value || null,
      last_played:   lastPlayedVal || null,
      name:          el.querySelector('#edit-name').value.trim() || game.name,
      year_published: parseInt(el.querySelector('#edit-year').value) || null,
      min_players:   parseInt(el.querySelector('#edit-min-players').value) || null,
      max_players:   parseInt(el.querySelector('#edit-max-players').value) || null,
      min_playtime:  parseInt(el.querySelector('#edit-min-playtime').value) || null,
      max_playtime:  parseInt(el.querySelector('#edit-max-playtime').value) || null,
      difficulty:    parseFloat(el.querySelector('#edit-difficulty').value) || null,
      image_url:     el.querySelector('#edit-image-url').value.trim() || null,
      description:   el.querySelector('#edit-description').value.trim() || null,
      categories:    csvToJson(el.querySelector('#edit-categories').value),
      mechanics:     csvToJson(el.querySelector('#edit-mechanics').value),
      designers:     csvToJson(el.querySelector('#edit-designers').value),
      publishers:    csvToJson(el.querySelector('#edit-publishers').value),
    };
    await onSave(game.id, payload);
  });

  // Delete
  el.querySelector('#delete-btn').addEventListener('click', () => onDelete(game.id, game.name));

  return el;
}

// ===== Modal open/close =====
function openModal(contentEl) {
  const modal = document.getElementById('game-modal');
  const inner = document.getElementById('modal-inner');
  inner.innerHTML = '';
  inner.appendChild(contentEl);
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const modal = document.getElementById('game-modal');
  modal.style.display = 'none';
  document.getElementById('modal-inner').innerHTML = '';
  document.body.style.overflow = '';
}
