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

function formatDatetime(isoDatetime) {
  if (!isoDatetime) return null;
  const d = new Date(isoDatetime);
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

function isSafeUrl(url) {
  if (!url) return false;
  return url.startsWith('/api/') || url.startsWith('https://') || url.startsWith('http://');
}

function placeholderSvg() {
  return `<svg class="placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
    <rect x="2" y="6" width="20" height="14" rx="2"/><rect x="6" y="2" width="12" height="4" rx="1"/>
    <circle cx="12" cy="13" r="3"/><circle cx="12" cy="13" r="1.2" fill="currentColor" stroke="none"/>
  </svg>`;
}

// ===== Card / List Media Helpers =====

function cardMediaHtml(game) {
  if (game.scan_featured) {
    if (game.scan_glb_filename) {
      const iosSrc = game.scan_filename ? `ios-src="/api/games/${game.id}/scan"` : '';
      return `<model-viewer src="/api/games/${game.id}/scan/glb" ${iosSrc}
        camera-controls auto-rotate shadow-intensity="1"
        class="card-model-viewer" alt="${escapeHtml(game.name)}"></model-viewer>`;
    }
    if (game.scan_filename) {
      return `<a class="scan-ar-placeholder" href="/api/games/${game.id}/scan" rel="ar" aria-label="View in AR">
        <svg class="scan-ar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
          <line x1="12" y1="22.08" x2="12" y2="12"/>
        </svg>
        <span class="scan-ar-label">AR</span>
      </a>`;
    }
  }
  const scanBadge = (game.scan_filename || game.scan_glb_filename)
    ? `<button class="scan-badge" type="button" title="View 3D Scan">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
        3D
      </button>`
    : '';
  return scanBadge + (isSafeUrl(game.image_url)
    ? `<img src="${escapeHtml(game.image_url)}" alt="${escapeHtml(game.name)}" loading="lazy"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
       ${placeholderSvg().replace('class="placeholder-icon"', 'class="placeholder-icon" style="display:none"')}`
    : placeholderSvg());
}

function listThumbHtml(game) {
  if (game.scan_featured && (game.scan_glb_filename || game.scan_filename)) {
    return `<div class="scan-featured-thumb" title="3D Scan">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
        <line x1="12" y1="22.08" x2="12" y2="12"/>
      </svg>
      <span>3D</span>
    </div>`;
  }
  return isSafeUrl(game.image_url)
    ? `<img src="${escapeHtml(game.image_url)}" alt="${escapeHtml(game.name)}" loading="lazy"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
       ${placeholderSvg().replace('class="placeholder-icon"', 'class="placeholder-icon" style="display:none"')}`
    : placeholderSvg();
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

  const cardStatusBadge = game.status === 'wishlist'
    ? `<span class="status-badge status-wishlist">Wishlist</span><button class="quick-owned-btn" type="button" title="Move to collection">✓ Mark Owned</button>`
    : game.status === 'sold'
    ? `<span class="status-badge status-sold">Sold</span>`
    : '';

  const cardLabels = parseList(game.labels);
  const cardLabelsHtml = cardLabels.length
    ? `<div class="label-chips">${cardLabels.slice(0, 3).map(l => `<span class="label-chip">${escapeHtml(l)}</span>`).join('')}</div>`
    : '';

  const cardLocationHtml = (game.show_location && game.location)
    ? `<span class="location-line">${escapeHtml(game.location)}</span>`
    : '';

  el.innerHTML = `
    <div class="game-card-image">
      ${cardMediaHtml(game)}
    </div>
    <div class="game-card-body">
      <div class="game-card-title-row">
        <div class="game-card-title">${escapeHtml(game.name)}</div>
        ${cardStatusBadge}
      </div>
      ${metaHtml ? `<div class="game-card-meta">${metaHtml}</div>` : ''}
      <div class="game-card-footer">
        <div class="rating-row">${ratingHtml}</div>
        ${lastPlayedHtml}
        ${cardLabelsHtml}
        ${cardLocationHtml}
        ${game.date_added ? `<span class="game-date-added">Added ${escapeHtml(formatDatetime(game.date_added))}</span>` : ''}
        ${game.status === 'owned' ? `<button class="quick-log-btn" type="button">+ Log Play</button>` : ''}
      </div>
    </div>`;

  if (game.scan_filename || game.scan_glb_filename) {
    const badge = el.querySelector('.scan-badge');
    if (badge) badge.addEventListener('click', e => { e.stopPropagation(); openScanViewer(game); });
  }

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

  const listStatusBadge = game.status === 'wishlist'
    ? `<span class="status-badge status-wishlist">Wishlist</span><button class="quick-owned-btn" type="button" title="Move to collection">✓ Mark Owned</button>`
    : game.status === 'sold'
    ? `<span class="status-badge status-sold">Sold</span>`
    : '';

  const listLabels = parseList(game.labels);
  const listLabelsHtml = listLabels.length
    ? `<div class="label-chips">${listLabels.slice(0, 4).map(l => `<span class="label-chip">${escapeHtml(l)}</span>`).join('')}</div>`
    : '';

  el.innerHTML = `
    <div class="list-thumb">
      ${listThumbHtml(game)}
    </div>
    <div class="list-info">
      <div class="list-title-row">
        <div class="list-title">${escapeHtml(game.name)}</div>
        ${listStatusBadge}
        ${(game.scan_filename || game.scan_glb_filename) ? `<button class="scan-badge scan-badge-list" type="button" title="View 3D Scan">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
          3D
        </button>` : ''}
      </div>
      ${metaParts.length ? `<div class="list-meta">${metaParts.map(escapeHtml).join(' · ')}</div>` : ''}
      ${listLabelsHtml}
      ${game.last_played ? `<div class="last-played-line">Played ${escapeHtml(formatDate(game.last_played))}</div>` : ''}
      ${game.date_added ? `<div class="last-played-line">Added ${escapeHtml(formatDatetime(game.date_added))}</div>` : ''}
      ${(game.show_location && game.location) ? `<div class="location-line">${escapeHtml(game.location)}</div>` : ''}
      ${game.status === 'owned' ? `<button class="quick-log-btn" type="button">+ Log Play</button>` : ''}
    </div>
    <div class="list-rating">${ratingHtml}</div>`;

  if (game.scan_filename || game.scan_glb_filename) {
    const badge = el.querySelector('.scan-badge-list');
    if (badge) badge.addEventListener('click', e => { e.stopPropagation(); openScanViewer(game); });
  }

  return el;
}

// ===== Modal =====

function buildModalContent(game, sessions, onSave, onDelete, onAddSession, onDeleteSession, onUploadInstructions, onDeleteInstructions, onUploadImage, onDeleteImage, onUploadScan, onDeleteScan, images, onUploadGalleryImage, onDeleteGalleryImage, onReorderGalleryImages, onUploadScanGlb, onDeleteScanGlb, onSetScanFeatured, onAddGalleryImageFromUrl, onUpdateGalleryImageCaption, mode = 'view', onSwitchToEdit, onSwitchToView) {
  const el = document.createElement('div');

  const categories = parseList(game.categories);
  const mechanics  = parseList(game.mechanics);
  const designers  = parseList(game.designers);
  const publishers = parseList(game.publishers);
  const modalLabels = parseList(game.labels);

  const modalStatusBadge = game.status && game.status !== 'owned'
    ? `<span class="status-badge status-${escapeHtml(game.status)}">${game.status === 'wishlist' ? 'Wishlist' : 'Sold'}</span>`
    : '';

  const labelsDisplayHtml = modalLabels.length
    ? `<div class="modal-tags-group">
        <span class="modal-tags-label">My Labels</span>
        <div class="modal-tags">${modalLabels.map(l => `<span class="label-chip">${escapeHtml(l)}</span>`).join('')}</div>
      </div>`
    : '';

  const locationDisplayHtml = game.location
    ? `<div class="modal-section">
        <div class="section-label">Storage Location</div>
        <div>${escapeHtml(game.location)}</div>
      </div>`
    : '';

  const hasPurchaseInfo = game.purchase_date || game.purchase_price != null || game.purchase_location;
  const purchaseDisplayHtml = hasPurchaseInfo
    ? `<div class="modal-section">
        <div class="section-label">Purchase Info</div>
        <div class="purchase-info">
          ${game.purchase_date ? `<span class="purchase-field"><span class="purchase-label">Date</span> ${escapeHtml(formatDate(game.purchase_date))}</span>` : ''}
          ${game.purchase_price != null ? `<span class="purchase-field"><span class="purchase-label">Price</span> $${game.purchase_price.toFixed(2)}</span>` : ''}
          ${game.purchase_location ? `<span class="purchase-field"><span class="purchase-label">From</span> ${escapeHtml(game.purchase_location)}</span>` : ''}
        </div>
      </div>`
    : '';

  // Hero
  const heroHtml = isSafeUrl(game.image_url)
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
  const hasScan      = !!game.scan_filename;
  const hasGlb       = !!game.scan_glb_filename;
  const hasScanAny   = hasScan || hasGlb;
  const scanFeatured = !!game.scan_featured;

  const isEdit = mode === 'edit';
  let selectedRating = game.user_rating || null;

  // ===== Mode-specific HTML blocks =====

  const starButtonsHtml = Array.from({length: 10}, (_, i) => i + 1).map(n =>
    `<button class="star-btn${(game.user_rating || 0) >= n ? ' active' : ''}" data-value="${n}" aria-label="${n} stars"><svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></button>`
  ).join('');

  const ratingWidgetHtml = isEdit
    ? `<div class="modal-section">
        <div class="section-label">My Rating</div>
        <div class="rating-widget">
          <div class="rating-stars-interactive" id="rating-stars">${starButtonsHtml}</div>
          <span class="rating-display" id="rating-display">${game.user_rating || '—'}</span>
          <button class="btn btn-ghost btn-sm" id="rating-clear">Clear</button>
        </div>
      </div>`
    : game.user_rating
      ? `<div class="modal-section">
          <div class="section-label">My Rating</div>
          <div class="rating-display-only">
            ${renderStars(game.user_rating)}
            <span class="rating-text">${game.user_rating}/10</span>
          </div>
        </div>`
      : '';

  const lastPlayedWidgetHtml = isEdit
    ? `<div class="modal-section">
        <div class="section-label">Last Played</div>
        <div class="last-played-row">
          <input type="date" id="last-played-input" class="date-input" value="${game.last_played || ''}">
          <button class="btn btn-ghost btn-sm" id="today-btn">Today</button>
        </div>
      </div>`
    : game.last_played
      ? `<div class="modal-section">
          <div class="section-label">Last Played</div>
          <span class="chip">${escapeHtml(formatDate(game.last_played))}</span>
        </div>`
      : '';

  const descriptionSectionHtml = isEdit
    ? `<div class="modal-section">
        <div class="section-label">Description</div>
        <textarea id="edit-description" class="form-input" rows="3">${escapeHtml(game.description || '')}</textarea>
      </div>`
    : game.description
      ? `<div class="modal-section">
          <div class="section-label">Description</div>
          <div class="description-text" id="desc-text">${escapeHtml(game.description)}</div>
          <button class="btn btn-ghost btn-sm" id="desc-toggle" style="margin-top:6px">Show more</button>
        </div>`
      : '';

  const notesSectionHtml = isEdit
    ? `<div class="modal-section">
        <div class="section-label">My Notes</div>
        <textarea id="user-notes" class="notes-input" rows="3" placeholder="Personal notes, house rules, favourite moments…">${escapeHtml(game.user_notes || '')}</textarea>
      </div>`
    : game.user_notes
      ? `<div class="modal-section">
          <div class="section-label">My Notes</div>
          <p class="notes-display">${escapeHtml(game.user_notes)}</p>
        </div>`
      : '';

  const gallerySectionHtml = isEdit
    ? `<div class="modal-section" id="gallery-section">
        <div class="section-label-row">
          <div class="section-label">Photo Gallery</div>
          <label class="btn btn-ghost btn-sm gallery-add-label" title="Add photo">
            <input type="file" id="gallery-file-input" accept="image/jpeg,image/png,image/gif,image/webp" multiple style="display:none">
            + Add Photo
          </label>
        </div>
        <div class="gallery-url-row">
          <input type="url" id="gallery-url-input" class="form-input form-input-sm" placeholder="Add image from URL…">
          <button class="btn btn-secondary btn-sm" id="gallery-url-add-btn">Add</button>
        </div>
        <div class="gallery-list" id="gallery-list"></div>
      </div>`
    : images.length > 0
      ? `<div class="modal-section">
          <div class="section-label">Photo Gallery</div>
          <div class="gallery-view-strip">${images.map((img, i) =>
            `<button class="gallery-view-thumb-btn" data-idx="${i}" aria-label="View image ${i + 1}">
              <img class="gallery-view-thumb" src="/api/games/${game.id}/images/${img.id}/file" loading="lazy" alt="">
              ${img.caption ? `<span class="gallery-view-caption">${escapeHtml(img.caption)}</span>` : ''}
            </button>`
          ).join('')}</div>
        </div>`
      : '';

  const instructionsSectionHtml = isEdit
    ? `<div class="modal-section">
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
      </div>`
    : hasInstructions
      ? `<div class="modal-section">
          <div class="section-label">Rulebook</div>
          <a href="/api/games/${game.id}/instructions" target="_blank" class="btn btn-ghost btn-sm">View Rulebook</a>
        </div>`
      : '';

  const scanSectionHtml = isEdit
    ? `<div class="modal-section">
        <div class="section-label-row">
          <div class="section-label">3D Scan</div>
          <div id="scan-featured-toggle" style="${hasScanAny ? '' : 'display:none'}">
            <button class="btn btn-ghost btn-sm${scanFeatured ? ' btn-active' : ''}" id="set-scan-featured-btn">
              ${scanFeatured ? '★ Featured on card' : '☆ Set as featured'}
            </button>
          </div>
        </div>
        <div class="instructions-existing" id="scan-existing" style="${hasScan ? '' : 'display:none'}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
          <span class="instructions-link">${escapeHtml(game.scan_filename || '')} <span style="color:var(--text-3);font-size:11px">(USDZ)</span></span>
          <button class="btn btn-ghost btn-sm" id="view-scan-btn">View</button>
          <button class="btn btn-ghost btn-sm" id="delete-scan-btn">Remove</button>
        </div>
        <div class="instructions-existing" id="scan-glb-existing" style="${hasGlb ? '' : 'display:none'}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
          <span class="instructions-link">${escapeHtml(game.scan_glb_filename || '')} <span style="color:var(--text-3);font-size:11px">(GLB)</span></span>
          <button class="btn btn-ghost btn-sm" id="delete-scan-glb-btn">Remove</button>
        </div>
        <div class="instructions-upload" id="scan-upload" style="${hasScan && hasGlb ? 'display:none' : ''}">
          <label class="upload-label">
            <input type="file" id="scan-file-input" accept=".usdz,.glb" style="display:none">
            <span class="btn btn-secondary btn-sm upload-trigger">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Upload 3D Scan (.usdz or .glb)
            </span>
          </label>
        </div>
      </div>`
    : hasScanAny
      ? `<div class="modal-section">
          <div class="section-label">3D Scan</div>
          <button id="view-scan-view-btn" class="btn btn-ghost btn-sm">View 3D Scan</button>
        </div>`
      : '';

  const editFieldsSectionHtml = isEdit
    ? `<div class="modal-section">
        <div class="edit-form-grid">
          <div class="form-group full-width">
            <label>Name</label>
            <input type="text" id="edit-name" class="form-input" value="${escapeHtml(game.name)}">
          </div>
          <div class="form-group">
            <label>Status</label>
            <select id="edit-status" class="form-input">
              <option value="owned"${game.status === 'owned' || !game.status ? ' selected' : ''}>Owned</option>
              <option value="wishlist"${game.status === 'wishlist' ? ' selected' : ''}>Wishlist</option>
              <option value="sold"${game.status === 'sold' ? ' selected' : ''}>Sold</option>
            </select>
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
          <div class="form-group full-width">
            <label>Labels <span class="hint">(comma-separated)</span></label>
            <input type="text" id="edit-labels" class="form-input" value="${escapeHtml(modalLabels.join(', '))}">
          </div>
          <div class="form-group">
            <label>Purchase Date</label>
            <input type="date" id="edit-purchase-date" class="form-input date-input" value="${game.purchase_date || ''}">
          </div>
          <div class="form-group">
            <label>Purchase Price ($)</label>
            <input type="number" id="edit-purchase-price" class="form-input" step="0.01" min="0" value="${game.purchase_price != null ? game.purchase_price : ''}">
          </div>
          <div class="form-group full-width">
            <label>Purchase Location</label>
            <input type="text" id="edit-purchase-location" class="form-input" value="${escapeHtml(game.purchase_location || '')}">
          </div>
          <div class="form-group full-width">
            <label>Storage Location</label>
            <div class="input-with-toggle">
              <input type="text" id="edit-location" class="form-input" placeholder="Shelf 2, Box A…" value="${escapeHtml(game.location || '')}">
              <label class="inline-toggle">
                <input type="checkbox" id="edit-show-location"${game.show_location ? ' checked' : ''}>
                Show on card
              </label>
            </div>
          </div>
        </div>
      </div>`
    : '';

  const actionsSectionHtml = isEdit
    ? `<div class="modal-actions">
        <button class="btn btn-danger" id="delete-game-btn">Remove from Collection</button>
        <div class="modal-actions-right">
          <button class="btn btn-secondary" id="cancel-btn">Cancel</button>
          <button class="btn btn-primary" id="save-btn">Save Changes</button>
        </div>
      </div>`
    : `<div class="modal-actions">
        <button class="btn btn-danger" id="delete-game-btn">Remove from Collection</button>
        <div class="modal-actions-right">
          <button class="btn btn-primary" id="edit-game-btn">Edit Game</button>
        </div>
      </div>`;

  el.innerHTML = `
    ${heroHtml}
    <div class="modal-body">
      <div class="modal-title-row">
        <h2 class="modal-title" id="modal-title">${escapeHtml(game.name)}</h2>
        ${game.year_published ? `<span class="modal-year">${game.year_published}</span>` : ''}
        ${modalStatusBadge}
      </div>

      ${chipsHtml ? `<div class="modal-chips">${chipsHtml}</div>` : ''}
      ${game.difficulty ? `<div class="modal-difficulty">${renderDifficultyBar(game.difficulty)}</div>` : ''}

      ${tagsBlock('Categories', categories)}
      ${tagsBlock('Mechanics', mechanics)}
      ${tagsBlock('Designers', designers)}
      ${tagsBlock('Publishers', publishers)}
      ${labelsDisplayHtml}
      ${purchaseDisplayHtml}
      ${locationDisplayHtml}

      ${ratingWidgetHtml}
      ${lastPlayedWidgetHtml}
      ${descriptionSectionHtml}
      ${notesSectionHtml}
      ${gallerySectionHtml}
      ${instructionsSectionHtml}
      ${scanSectionHtml}

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

      ${editFieldsSectionHtml}

      ${(game.date_added || game.date_modified) ? `
      <div class="game-dates-row">
        ${game.date_added   ? `<span><span class="game-dates-label">Added</span> ${escapeHtml(formatDatetime(game.date_added))}</span>` : ''}
        ${game.date_modified ? `<span><span class="game-dates-label">Modified</span> ${escapeHtml(formatDatetime(game.date_modified))}</span>` : ''}
      </div>` : ''}

      ${actionsSectionHtml}
    </div>`;

  // ===== Wire events =====

  el.querySelector('#modal-close-btn').addEventListener('click', closeModal);
  el.querySelector('#delete-game-btn').addEventListener('click', () => onDelete(game.id, game.name));

  // Sessions (always wired)
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
      player_count:     parseInt(el.querySelector('#session-players').value, 10) || null,
      duration_minutes: parseInt(el.querySelector('#session-duration').value, 10) || null,
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
    const sessionId = parseInt(btn.dataset.sessionId, 10);
    onDeleteSession(sessionId, game.id, () => {
      const item = el.querySelector(`.session-item[data-session-id="${sessionId}"]`);
      if (item) item.remove();
      if (!el.querySelector('#sessions-list .session-item')) {
        el.querySelector('#sessions-list').innerHTML = '<p class="no-sessions">No sessions logged yet.</p>';
      }
    });
  });

  if (!isEdit) {
    // ===== View mode wiring =====
    el.querySelector('#edit-game-btn').addEventListener('click', () => onSwitchToEdit());

    if (hasScanAny) {
      el.querySelector('#view-scan-view-btn').addEventListener('click', () => openScanViewer(game));
    }

    // Gallery strip thumbnails → lightbox
    el.querySelectorAll('.gallery-view-thumb-btn').forEach(btn => {
      btn.addEventListener('click', () => openGalleryLightbox(images, parseInt(btn.dataset.idx, 10)));
    });

    // Hero image → lightbox (when gallery images exist)
    if (images.length > 0 && game.image_url && game.image_url.includes('/images/')) {
      const hero = el.querySelector('.modal-hero');
      if (hero) {
        hero.style.cursor = 'zoom-in';
        hero.addEventListener('click', () => openGalleryLightbox(images, 0));
      }
    }

    const descText   = el.querySelector('#desc-text');
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
  } else {
    // ===== Edit mode wiring =====
    el.querySelector('#cancel-btn').addEventListener('click', () => onSwitchToView());

    // Rating
    const starsContainer = el.querySelector('#rating-stars');
    const ratingDisplay  = el.querySelector('#rating-display');

    function updateStarDisplay(value) {
      starsContainer.querySelectorAll('.star-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.value, 10) <= (value || 0));
      });
      ratingDisplay.textContent = value || '—';
    }

    starsContainer.addEventListener('mouseover', e => {
      const btn = e.target.closest('.star-btn');
      if (btn) updateStarDisplay(parseInt(btn.dataset.value, 10));
    });
    starsContainer.addEventListener('mouseleave', () => updateStarDisplay(selectedRating));
    starsContainer.addEventListener('click', e => {
      const btn = e.target.closest('.star-btn');
      if (btn) { selectedRating = parseInt(btn.dataset.value, 10); updateStarDisplay(selectedRating); }
    });
    el.querySelector('#rating-clear').addEventListener('click', () => { selectedRating = null; updateStarDisplay(null); });

    // Today button
    el.querySelector('#today-btn').addEventListener('click', () => {
      el.querySelector('#last-played-input').value = new Date().toISOString().split('T')[0];
    });

    // Instructions upload
    const fileInput = el.querySelector('#instructions-file-input');
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

    // 3D scan upload — single input accepts .usdz or .glb
    function updateScanUploadVisibility() {
      const usdzVisible = el.querySelector('#scan-existing').style.display !== 'none';
      const glbVisible  = el.querySelector('#scan-glb-existing').style.display !== 'none';
      el.querySelector('#scan-upload').style.display = (usdzVisible && glbVisible) ? 'none' : '';
      el.querySelector('#scan-featured-toggle').style.display = (usdzVisible || glbVisible) ? '' : 'none';
    }

    const scanFileInput = el.querySelector('#scan-file-input');
    if (scanFileInput) {
      scanFileInput.addEventListener('change', () => {
        const file = scanFileInput.files[0];
        if (!file) return;
        const ext = file.name.split('.').pop().toLowerCase();
        scanFileInput.value = '';

        if (ext === 'usdz') {
          onUploadScan(game.id, file, (filename) => {
            const existing = el.querySelector('#scan-existing');
            existing.style.display = 'flex';
            existing.querySelector('.instructions-link').innerHTML =
              `${escapeHtml(filename)} <span style="color:var(--text-3);font-size:11px">(USDZ)</span>`;
            updateScanUploadVisibility();
            wireScanButtons({ name: game.name, id: game.id, scan_filename: filename, scan_glb_filename: game.scan_glb_filename });
          });
        } else if (ext === 'glb') {
          onUploadScanGlb(game.id, file, (filename) => {
            const existing = el.querySelector('#scan-glb-existing');
            existing.style.display = 'flex';
            existing.querySelector('.instructions-link').innerHTML =
              `${escapeHtml(filename)} <span style="color:var(--text-3);font-size:11px">(GLB)</span>`;
            updateScanUploadVisibility();
            wireGlbDeleteBtn();
          });
        }
      });
    }

    function wireScanButtons(gameRef) {
      const viewBtn = el.querySelector('#view-scan-btn');
      if (viewBtn) {
        const freshView = viewBtn.cloneNode(true);
        viewBtn.parentNode.replaceChild(freshView, viewBtn);
        freshView.addEventListener('click', () => openScanViewer(gameRef));
      }
      const deleteBtn = el.querySelector('#delete-scan-btn');
      if (deleteBtn) {
        const freshDel = deleteBtn.cloneNode(true);
        deleteBtn.parentNode.replaceChild(freshDel, deleteBtn);
        freshDel.addEventListener('click', () => {
          onDeleteScan(game.id, () => {
            el.querySelector('#scan-existing').style.display = 'none';
            updateScanUploadVisibility();
          });
        });
      }
    }
    wireScanButtons(game);

    function wireGlbDeleteBtn() {
      const btn = el.querySelector('#delete-scan-glb-btn');
      if (!btn) return;
      const fresh = btn.cloneNode(true);
      btn.parentNode.replaceChild(fresh, btn);
      fresh.addEventListener('click', () => {
        onDeleteScanGlb(game.id, () => {
          el.querySelector('#scan-glb-existing').style.display = 'none';
          updateScanUploadVisibility();
        });
      });
    }
    wireGlbDeleteBtn();

    // Scan featured toggle
    let currentScanFeatured = !!game.scan_featured;

    function updateFeaturedBtn(featured) {
      const btn = el.querySelector('#set-scan-featured-btn');
      if (!btn) return;
      currentScanFeatured = featured;
      btn.textContent = featured ? '★ Featured on card' : '☆ Set as featured';
      btn.classList.toggle('btn-active', featured);
    }

    const featuredBtn = el.querySelector('#set-scan-featured-btn');
    if (featuredBtn) {
      featuredBtn.addEventListener('click', () => {
        onSetScanFeatured(game.id, !currentScanFeatured, (updated) => updateFeaturedBtn(updated));
      });
    }

    // Image URL tracking
    let currentImageUrl = game.image_url || null;

    // Gallery
    let galleryImages = Array.isArray(images) ? [...images] : [];

    function buildGalleryItemEl(img, index, total) {
      const item = document.createElement('div');
      item.className = 'gallery-list-item';
      item.dataset.imgId = img.id;
      item.innerHTML = `
        <img class="gallery-thumb" src="/api/games/${game.id}/images/${img.id}/file" loading="lazy" alt="">
        <div class="gallery-item-info">
          ${index === 0 ? '<span class="gallery-featured-badge">★ Featured</span>' : '<span class="gallery-item-num">#' + (index + 1) + '</span>'}
        </div>
        <div class="gallery-item-controls">
          <button class="btn btn-ghost btn-sm gallery-move-up"${index === 0 ? ' disabled' : ''} title="Move up">↑</button>
          <button class="btn btn-ghost btn-sm gallery-move-down"${index === total - 1 ? ' disabled' : ''} title="Move down">↓</button>
          <button class="btn btn-ghost btn-sm gallery-delete" title="Remove photo">Remove</button>
        </div>
        <input type="text" class="gallery-caption-input form-input form-input-sm"
               placeholder="Add caption…" value="${escapeHtml(img.caption || '')}">`;
      return item;
    }

    function renderGallery() {
      const list = el.querySelector('#gallery-list');
      list.innerHTML = '';
      if (galleryImages.length === 0) {
        list.innerHTML = '<p class="no-gallery">No photos yet. Use "+ Add Photo" to upload images.</p>';
        return;
      }
      galleryImages.forEach((img, i) => {
        const item = buildGalleryItemEl(img, i, galleryImages.length);
        list.appendChild(item);

        item.querySelector('.gallery-move-up').addEventListener('click', () => {
          const newOrder = [...galleryImages];
          [newOrder[i - 1], newOrder[i]] = [newOrder[i], newOrder[i - 1]];
          const newPrimaryUrl = `/api/games/${game.id}/images/${newOrder[0].id}/file`;
          onReorderGalleryImages(game.id, newOrder.map(g => g.id), newPrimaryUrl, () => {
            galleryImages.splice(0, galleryImages.length, ...newOrder);
            renderGallery();
            onGalleryPrimaryChanged(newPrimaryUrl);
          });
        });

        item.querySelector('.gallery-move-down').addEventListener('click', () => {
          const newOrder = [...galleryImages];
          [newOrder[i], newOrder[i + 1]] = [newOrder[i + 1], newOrder[i]];
          const newPrimaryUrl = `/api/games/${game.id}/images/${newOrder[0].id}/file`;
          onReorderGalleryImages(game.id, newOrder.map(g => g.id), newPrimaryUrl, () => {
            galleryImages.splice(0, galleryImages.length, ...newOrder);
            renderGallery();
            onGalleryPrimaryChanged(newPrimaryUrl);
          });
        });

        const captionInput = item.querySelector('.gallery-caption-input');
        captionInput.addEventListener('blur', () => {
          const newCaption = captionInput.value.trim() || null;
          if (newCaption === (img.caption || null)) return;
          onUpdateGalleryImageCaption(game.id, img.id, newCaption, (updated) => {
            img.caption = updated.caption;
          });
        });

        // Capture img.id (not index i) so concurrent deletes don't corrupt the reference
        const imgId = img.id;
        item.querySelector('.gallery-delete').addEventListener('click', () => {
          const afterDelete = galleryImages.filter(g => g.id !== imgId);
          const wasFirst = galleryImages.findIndex(g => g.id === imgId) === 0;
          const newPrimaryUrl = afterDelete.length > 0
            ? `/api/games/${game.id}/images/${afterDelete[0].id}/file`
            : null;
          onDeleteGalleryImage(game.id, imgId, newPrimaryUrl, () => {
            galleryImages.splice(0, galleryImages.length, ...afterDelete);
            renderGallery();
            if (wasFirst) onGalleryPrimaryChanged(newPrimaryUrl);
          });
        });
      });
    }

    function onGalleryPrimaryChanged(newUrl) {
      currentImageUrl = newUrl;
    }

    const galleryFileInput = el.querySelector('#gallery-file-input');
    if (galleryFileInput) {
      galleryFileInput.addEventListener('change', async () => {
        const files = Array.from(galleryFileInput.files);
        for (const file of files) {
          await onUploadGalleryImage(game.id, file, (newImg) => {
            galleryImages.push(newImg);
            renderGallery();
            if (galleryImages.length === 1) {
              onGalleryPrimaryChanged(`/api/games/${game.id}/images/${newImg.id}/file`);
            }
          });
        }
        galleryFileInput.value = '';
      });
    }

    renderGallery();

    // Gallery URL add
    const galleryUrlInput = el.querySelector('#gallery-url-input');
    const galleryUrlAddBtn = el.querySelector('#gallery-url-add-btn');
    if (galleryUrlAddBtn) {
      galleryUrlAddBtn.addEventListener('click', () => {
        const url = galleryUrlInput.value.trim();
        if (!url) return;
        galleryUrlAddBtn.disabled = true;
        galleryUrlAddBtn.textContent = 'Adding…';
        const resetBtn = () => { galleryUrlAddBtn.disabled = false; galleryUrlAddBtn.textContent = 'Add'; };
        onAddGalleryImageFromUrl(game.id, url, (newImg) => {
          galleryUrlInput.value = '';
          resetBtn();
          galleryImages.push(newImg);
          renderGallery();
          if (galleryImages.length === 1) {
            onGalleryPrimaryChanged(`/api/games/${game.id}/images/${newImg.id}/file`);
          }
        }, resetBtn);
      });
    }

    // Save
    function csvToJson(val) {
      const items = (val || '').split(',').map(s => s.trim()).filter(Boolean);
      return items.length ? JSON.stringify(items) : null;
    }

    el.querySelector('#save-btn').addEventListener('click', () => {
      const name = el.querySelector('#edit-name').value.trim();
      if (!name) { showToast('Game name cannot be empty.', 'error'); return; }

      const payload = {
        user_rating:      selectedRating || null,
        user_notes:       el.querySelector('#user-notes').value.trim() || null,
        last_played:      el.querySelector('#last-played-input').value || null,
        name:             name,
        status:           el.querySelector('#edit-status').value || 'owned',
        year_published:   parseInt(el.querySelector('#edit-year').value, 10) || null,
        min_players:      parseInt(el.querySelector('#edit-min-players').value, 10) || null,
        max_players:      parseInt(el.querySelector('#edit-max-players').value, 10) || null,
        min_playtime:     parseInt(el.querySelector('#edit-min-playtime').value, 10) || null,
        max_playtime:     parseInt(el.querySelector('#edit-max-playtime').value, 10) || null,
        difficulty:       parseFloat(el.querySelector('#edit-difficulty').value) || null,
        image_url:        currentImageUrl,
        description:      el.querySelector('#edit-description').value.trim() || null,
        categories:       csvToJson(el.querySelector('#edit-categories').value),
        mechanics:        csvToJson(el.querySelector('#edit-mechanics').value),
        designers:        csvToJson(el.querySelector('#edit-designers').value),
        publishers:       csvToJson(el.querySelector('#edit-publishers').value),
        labels:           csvToJson(el.querySelector('#edit-labels').value),
        purchase_date:    el.querySelector('#edit-purchase-date').value || null,
        purchase_price:   el.querySelector('#edit-purchase-price').value !== '' ? parseFloat(el.querySelector('#edit-purchase-price').value) : null,
        purchase_location: el.querySelector('#edit-purchase-location').value.trim() || null,
        location:           el.querySelector('#edit-location').value.trim() || null,
        show_location:      el.querySelector('#edit-show-location').checked,
      };
      onSave(game.id, payload);
    });
  }

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

// ===== Gallery Lightbox =====

function openGalleryLightbox(images, startIndex = 0) {
  if (!images.length) return;
  let current = startIndex;
  const multi = images.length > 1;

  const overlay = document.createElement('div');
  overlay.className = 'gallery-lightbox-overlay';
  overlay.innerHTML = `
    <div class="gallery-lightbox-panel">
      <button class="gallery-lightbox-close" aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      ${multi ? '<button class="gallery-lightbox-nav gallery-lightbox-prev" aria-label="Previous">&#8249;</button>' : ''}
      <div class="gallery-lightbox-img-wrap">
        <img class="gallery-lightbox-img" src="" alt="Gallery image">
      </div>
      ${multi ? '<button class="gallery-lightbox-nav gallery-lightbox-next" aria-label="Next">&#8250;</button>' : ''}
      <div class="gallery-lightbox-caption"></div>
      ${multi ? '<div class="gallery-lightbox-counter"></div>' : ''}
    </div>`;

  const img        = overlay.querySelector('.gallery-lightbox-img');
  const counter    = overlay.querySelector('.gallery-lightbox-counter');
  const captionEl  = overlay.querySelector('.gallery-lightbox-caption');

  function show(idx) {
    current = ((idx % images.length) + images.length) % images.length;
    img.src = `/api/games/${images[current].game_id}/images/${images[current].id}/file`;
    if (counter) counter.textContent = `${current + 1} / ${images.length}`;
    if (captionEl) captionEl.textContent = images[current].caption || '';
  }

  if (multi) {
    overlay.querySelector('.gallery-lightbox-prev').addEventListener('click', () => show(current - 1));
    overlay.querySelector('.gallery-lightbox-next').addEventListener('click', () => show(current + 1));
  }
  overlay.querySelector('.gallery-lightbox-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  let touchStartX = 0;
  overlay.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  overlay.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (multi && Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
  });

  function onKey(e) {
    if (e.key === 'ArrowLeft'  && multi) show(current - 1);
    else if (e.key === 'ArrowRight' && multi) show(current + 1);
    else if (e.key === 'Escape') close();
  }
  document.addEventListener('keydown', onKey);

  function close() {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  }

  show(startIndex);
  document.body.appendChild(overlay);
}

// ===== 3D Scan Viewer =====

function openScanViewer(game) {
  const hasUsdz = !!game.scan_filename;
  const hasGlb  = !!game.scan_glb_filename;

  const linksHtml = [
    hasGlb  ? `<a href="/api/games/${game.id}/scan/glb" class="btn btn-primary scan-viewer-open"
                  download="${escapeHtml(game.scan_glb_filename || 'scan.glb')}">Download GLB</a>` : '',
    hasUsdz ? `<a href="/api/games/${game.id}/scan"
                  class="btn ${hasGlb ? 'btn-secondary' : 'btn-primary'} scan-viewer-open"
                  target="_blank" rel="ar">${hasGlb ? 'Open AR (iOS)' : 'Open 3D Scan'}</a>` : '',
  ].join('');

  const subtitle = [
    hasGlb  ? `GLB: ${escapeHtml(game.scan_glb_filename || '')}` : '',
    hasUsdz ? `USDZ: ${escapeHtml(game.scan_filename || '')}` : '',
  ].filter(Boolean).join(' · ');

  const hint = hasGlb && hasUsdz
    ? 'GLB works in all browsers · USDZ for AR on iPhone/Mac'
    : hasUsdz
      ? 'Tap <strong>View in AR</strong> on iPhone · Opens in QuickLook on Mac'
      : 'GLB format — open in any 3D viewer';

  const overlay = document.createElement('div');
  overlay.className = 'scan-viewer-overlay';
  overlay.innerHTML = `
    <div class="scan-viewer-panel">
      <button class="scan-viewer-close" aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div class="scan-viewer-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
          <line x1="12" y1="22.08" x2="12" y2="12"/>
        </svg>
      </div>
      <h2 class="scan-viewer-title">${escapeHtml(game.name)}</h2>
      <p class="scan-viewer-subtitle">${subtitle}</p>
      ${linksHtml}
      <p class="scan-viewer-hint">${hint}</p>
    </div>`;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => overlay.classList.add('open'));

  function close() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(() => overlay.remove(), 200);
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) { if (e.key === 'Escape') close(); }

  overlay.querySelector('.scan-viewer-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
}

// ===== Stats View =====

function buildStatsView(stats, games, prefs = {}, onPrefsChange = null) {
  const SECTION_DEFAULTS = {
    show_summary: true, show_most_played: true, show_recently_played: true,
    show_ratings: true, show_labels: true, show_added_by_month: true,
    show_sessions_by_month: true, show_never_played: true,
    show_dormant: true, show_top_mechanics: true,
    section_order: ['summary', 'most_played', 'recently_played', 'ratings',
                    'labels', 'added_by_month', 'sessions_by_month', 'never_played',
                    'dormant', 'top_mechanics'],
  };
  let currentPrefs = { ...SECTION_DEFAULTS, ...prefs };

  // [prefKey, display label, section id (= data-section attribute value)]
  const SECTION_TOGGLES = [
    ['show_summary',           'Summary Cards',      'summary'],
    ['show_most_played',       'Most Played',        'most_played'],
    ['show_recently_played',   'Recently Played',    'recently_played'],
    ['show_ratings',           'Rating Distribution','ratings'],
    ['show_labels',            'Labels',             'labels'],
    ['show_added_by_month',    'Added by Month',     'added_by_month'],
    ['show_sessions_by_month', 'Sessions by Month',  'sessions_by_month'],
    ['show_never_played',      'Never Played',       'never_played'],
    ['show_dormant',           'Dormant Games',      'dormant'],
    ['show_top_mechanics',     'Top Mechanics',      'top_mechanics'],
  ];

  const gripSvg = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <circle cx="9"  cy="5"  r="1.5"/><circle cx="15" cy="5"  r="1.5"/>
    <circle cx="9"  cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
    <circle cx="9"  cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
  </svg>`;

  const settingsTogglesHtml = currentPrefs.section_order.map(sectionKey => {
    const entry = SECTION_TOGGLES.find(([,, k]) => k === sectionKey);
    if (!entry) return '';
    const [prefKey, label] = entry;
    return `<div class="stats-settings-row" draggable="true" data-key="${sectionKey}">
      <span class="drag-handle" aria-hidden="true">${gripSvg}</span>
      <label class="stats-settings-toggle">
        <input type="checkbox" data-pref="${prefKey}"${currentPrefs[prefKey] !== false ? ' checked' : ''}>
        ${escapeHtml(label)}
      </label>
    </div>`;
  }).join('');

  const el = document.createElement('div');
  el.className = 'stats-view';

  // Stat cards
  const statDefs = [
    { label: 'Total Games',   value: stats.total_games },
    { label: 'Owned',         value: stats.by_status.owned    || 0 },
    { label: 'Wishlist',      value: stats.by_status.wishlist || 0 },
    { label: 'Play Sessions', value: stats.total_sessions },
    { label: 'Hours Played',  value: stats.total_hours },
    ...(stats.avg_rating    != null ? [{ label: 'Avg Rating',        value: stats.avg_rating + ' / 10' }] : []),
    { label: 'Collection Value', value: '$' + (stats.total_spent != null ? stats.total_spent.toFixed(2) : '0.00') },
    { label: 'Never Played',  value: stats.never_played_count },
  ];

  const cardsHtml = `<div class="stat-cards" data-section="summary"${!currentPrefs.show_summary ? ' style="display:none"' : ''}>
    ${statDefs.map(c => `
      <div class="stat-card">
        <div class="stat-card-value">${c.value}</div>
        <div class="stat-card-label">${c.label}</div>
      </div>`).join('')}
  </div>`;

  // Most played
  const mostPlayedHtml = stats.most_played.length ? `
    <div class="stats-section" data-section="most_played"${!currentPrefs.show_most_played ? ' style="display:none"' : ''}>
      <h3 class="stats-section-title">Most Played</h3>
      <div class="most-played-list">
        ${stats.most_played.map((entry, i) => {
          const maxCount = stats.most_played[0].count;
          const pct = Math.round((entry.count / maxCount) * 100);
          return `<div class="most-played-item">
            <div class="most-played-rank">${i + 1}</div>
            <div class="most-played-info">
              <div class="most-played-name">${escapeHtml(entry.name)}</div>
              <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%"></div></div>
            </div>
            <div class="most-played-count">${entry.count} play${entry.count !== 1 ? 's' : ''}</div>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  // Rating distribution
  const ratingEntries = Object.entries(stats.ratings_distribution);
  const maxRating = Math.max(...ratingEntries.map(([, v]) => v), 1);
  const ratingsHtml = `
    <div class="stats-section" data-section="ratings"${!currentPrefs.show_ratings ? ' style="display:none"' : ''}>
      <h3 class="stats-section-title">Rating Distribution</h3>
      <div class="stat-bar-chart">
        ${ratingEntries.map(([bucket, count]) => `<div class="stat-bar-row">
          <span class="stat-bar-label">${escapeHtml(bucket)}</span>
          <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${count ? Math.round(count / maxRating * 100) : 0}%"></div></div>
          <span class="stat-bar-count">${count}</span>
        </div>`).join('')}
      </div>
    </div>`;

  // Label breakdown
  const labelEntries = Object.entries(stats.label_counts).slice(0, 10);
  const maxLabel = Math.max(...labelEntries.map(([, v]) => v), 1);
  const labelsHtml = labelEntries.length ? `
    <div class="stats-section" data-section="labels"${!currentPrefs.show_labels ? ' style="display:none"' : ''}>
      <h3 class="stats-section-title">Labels</h3>
      <div class="stat-bar-chart">
        ${labelEntries.map(([label, count]) => `<div class="stat-bar-row">
          <span class="stat-bar-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
          <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${Math.round(count / maxLabel * 100)}%"></div></div>
          <span class="stat-bar-count">${count}</span>
        </div>`).join('')}
      </div>
    </div>` : '';

  // Added by month
  const addedMax = Math.max(...stats.added_by_month.map(e => e.count), 1);
  const addedHtml = `
    <div class="stats-section" data-section="added_by_month"${!currentPrefs.show_added_by_month ? ' style="display:none"' : ''}>
      <h3 class="stats-section-title">Added by Month</h3>
      <div class="stat-bar-chart">
        ${stats.added_by_month.map(entry => `<div class="stat-bar-row">
          <span class="stat-bar-label">${escapeHtml(entry.month)}</span>
          <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${entry.count ? Math.round(entry.count / addedMax * 100) : 0}%"></div></div>
          <span class="stat-bar-count">${entry.count}</span>
        </div>`).join('')}
      </div>
    </div>`;

  // Sessions by month
  const sessionsMax = Math.max(...stats.sessions_by_month.map(e => e.count), 1);
  const sessionsByMonthHtml = `
    <div class="stats-section" data-section="sessions_by_month"${!currentPrefs.show_sessions_by_month ? ' style="display:none"' : ''}>
      <h3 class="stats-section-title">Sessions by Month</h3>
      <div class="stat-bar-chart">
        ${stats.sessions_by_month.map(entry => `<div class="stat-bar-row">
          <span class="stat-bar-label">${escapeHtml(entry.month)}</span>
          <div class="stat-bar-track"><div class="stat-bar-fill stat-bar-fill-sessions" style="width:${entry.count ? Math.round(entry.count / sessionsMax * 100) : 0}%"></div></div>
          <span class="stat-bar-count">${entry.count}</span>
        </div>`).join('')}
      </div>
    </div>`;

  // Recently played (last 10 sessions)
  const recentSessionsHtml = stats.recent_sessions.length ? `
    <div class="stats-section" data-section="recently_played"${!currentPrefs.show_recently_played ? ' style="display:none"' : ''}>
      <h3 class="stats-section-title">Recently Played</h3>
      <div class="recent-sessions-list">
        ${stats.recent_sessions.map(s => `
          <div class="recent-session-item">
            <div class="recent-session-name">${escapeHtml(s.game_name)}</div>
            <div class="recent-session-meta">
              <span class="recent-session-date">${escapeHtml(formatDate(s.played_at))}</span>
              ${s.player_count ? `<span class="recent-session-detail">${s.player_count} player${s.player_count !== 1 ? 's' : ''}</span>` : ''}
              ${s.duration_minutes ? `<span class="recent-session-detail">${s.duration_minutes} min</span>` : ''}
            </div>
          </div>`).join('')}
      </div>
    </div>` : '';

  // Never played — owned games only, with optional unplayed value
  const neverPlayed = games.filter(g => g.status === 'owned' && !g.last_played);
  const neverPlayedValue = neverPlayed.reduce((sum, g) => sum + (g.purchase_price || 0), 0);
  const neverPlayedHtml = `
    <div class="stats-section" data-section="never_played"${!currentPrefs.show_never_played ? ' style="display:none"' : ''}>
      <h3 class="stats-section-title">Never Played (${neverPlayed.length})</h3>
      ${neverPlayed.length
        ? `${neverPlayedValue > 0 ? `<p class="insight-subtext">Unplayed value: <strong>$${neverPlayedValue.toFixed(2)}</strong></p>` : ''}
           <div class="insight-game-list">
             ${neverPlayed.slice(0, 10).map(g => `
               <div class="insight-game-row">
                 <span class="insight-game-name">${escapeHtml(g.name)}</span>
                 <span class="insight-game-meta">${g.purchase_price ? `$${g.purchase_price.toFixed(2)}` : g.date_added ? escapeHtml(formatDate(g.date_added)) : ''}</span>
               </div>`).join('')}
             ${neverPlayed.length > 10 ? `<div class="insight-more">+${neverPlayed.length - 10} more</div>` : ''}
           </div>`
        : '<p class="no-sessions">All your games have been played!</p>'}
    </div>`;

  // Dormant — owned games not played in 12+ months
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
  const dormantGames = games
    .filter(g => g.status === 'owned' && g.last_played && new Date(g.last_played + 'T00:00:00') < twelveMonthsAgo)
    .sort((a, b) => a.last_played.localeCompare(b.last_played));
  const dormantHtml = dormantGames.length ? `
    <div class="stats-section" data-section="dormant"${!currentPrefs.show_dormant ? ' style="display:none"' : ''}>
      <h3 class="stats-section-title">Dormant Games (${dormantGames.length})</h3>
      <p class="insight-subtext">Owned but not played in over a year</p>
      <div class="insight-game-list">
        ${dormantGames.slice(0, 10).map(g => `
          <div class="insight-game-row">
            <span class="insight-game-name">${escapeHtml(g.name)}</span>
            <span class="insight-game-meta">Last played ${escapeHtml(formatDate(g.last_played))}</span>
          </div>`).join('')}
        ${dormantGames.length > 10 ? `<div class="insight-more">+${dormantGames.length - 10} more</div>` : ''}
      </div>
    </div>` : '';

  // Top Mechanics — most common mechanics in owned collection
  const mechanicCounts = {};
  games.filter(g => g.status === 'owned').forEach(g => {
    parseList(g.mechanics).forEach(m => { if (m) mechanicCounts[m] = (mechanicCounts[m] || 0) + 1; });
  });
  const topMechanics = Object.entries(mechanicCounts).sort(([, a], [, b]) => b - a).slice(0, 10);
  const maxMechanic = topMechanics[0]?.[1] || 1;
  const topMechanicsHtml = topMechanics.length ? `
    <div class="stats-section" data-section="top_mechanics"${!currentPrefs.show_top_mechanics ? ' style="display:none"' : ''}>
      <h3 class="stats-section-title">Top Mechanics</h3>
      <div class="stat-bar-chart">
        ${topMechanics.map(([name, count]) => `
          <div class="stat-bar-row">
            <span class="stat-bar-label">${escapeHtml(name)}</span>
            <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${Math.round(count / maxMechanic * 100)}%"></div></div>
            <span class="stat-bar-count">${count}</span>
          </div>`).join('')}
      </div>
    </div>` : '';

  // Build ordered sections HTML
  const sectionsMap = {
    summary:           cardsHtml,
    most_played:       mostPlayedHtml,
    recently_played:   recentSessionsHtml,
    ratings:           ratingsHtml,
    labels:            labelsHtml,
    added_by_month:    addedHtml,
    sessions_by_month: sessionsByMonthHtml,
    never_played:      neverPlayedHtml,
    dormant:           dormantHtml,
    top_mechanics:     topMechanicsHtml,
  };
  const orderedSectionsHtml = currentPrefs.section_order.map(k => sectionsMap[k] || '').join('');

  el.innerHTML = `
    <div class="stats-header">
      <h1 class="stats-title">Collection Stats</h1>
      <button class="stats-settings-btn" id="stats-settings-btn" title="Configure sections" aria-label="Configure sections">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
      </button>
    </div>
    <div class="stats-settings-panel" id="stats-settings-panel" style="display:none">
      <div class="stats-settings-list" id="stats-settings-list">
        ${settingsTogglesHtml}
      </div>
      <div class="stats-export-group">
        <span class="stats-export-label">Export collection</span>
        <div class="stats-export-btns">
          <button class="btn btn-ghost btn-sm" id="stats-export-json">JSON</button>
          <button class="btn btn-ghost btn-sm" id="stats-export-csv">CSV</button>
        </div>
      </div>
    </div>
    <div class="stats-grid" id="stats-sections">
      ${orderedSectionsHtml}
    </div>`;

  const settingsBtn   = el.querySelector('#stats-settings-btn');
  const settingsPanel = el.querySelector('#stats-settings-panel');
  const settingsList  = el.querySelector('#stats-settings-list');
  const sectionsEl    = el.querySelector('#stats-sections');

  settingsBtn.addEventListener('click', () => {
    const open = settingsPanel.style.display !== 'none';
    settingsPanel.style.display = open ? 'none' : 'block';
    settingsBtn.classList.toggle('active', !open);
  });

  let dragSrcKey = null;

  settingsList.querySelectorAll('.stats-settings-row').forEach(row => {
    // Checkbox visibility toggle
    row.querySelector('input').addEventListener('change', () => {
      const prefKey = row.querySelector('input').dataset.pref;
      currentPrefs = { ...currentPrefs, [prefKey]: row.querySelector('input').checked };
      const section = sectionsEl.querySelector(`[data-section="${row.dataset.key}"]`);
      if (section) section.style.display = row.querySelector('input').checked ? '' : 'none';
      if (onPrefsChange) onPrefsChange(currentPrefs);
    });

    // Drag-and-drop reordering
    row.addEventListener('dragstart', e => {
      dragSrcKey = row.dataset.key;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      settingsList.querySelectorAll('.drag-over').forEach(r => r.classList.remove('drag-over'));
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (row.dataset.key !== dragSrcKey) row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', e => {
      e.preventDefault();
      row.classList.remove('drag-over');
      if (!dragSrcKey || dragSrcKey === row.dataset.key) return;

      // Reorder settings rows in the panel
      const srcRow = settingsList.querySelector(`[data-key="${dragSrcKey}"]`);
      const rows = [...settingsList.children];
      const srcIdx = rows.indexOf(srcRow);
      const dstIdx = rows.indexOf(row);
      settingsList.insertBefore(srcRow, srcIdx < dstIdx ? row.nextSibling : row);

      // Reorder stat sections in the page (appendChild moves existing nodes)
      const newOrder = [...settingsList.querySelectorAll('[data-key]')].map(r => r.dataset.key);
      newOrder.forEach(key => {
        const sec = sectionsEl.querySelector(`[data-section="${key}"]`);
        if (sec) sectionsEl.appendChild(sec);
      });

      // Persist new order
      currentPrefs = { ...currentPrefs, section_order: newOrder };
      if (onPrefsChange) onPrefsChange(currentPrefs);
    });
  });

  return el;
}
