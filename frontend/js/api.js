/**
 * Cardboard API client
 * Communicates with the FastAPI backend.
 */

const API_BASE = '/api';

async function request(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== null) opts.body = JSON.stringify(body);

  const resp = await fetch(`${API_BASE}${path}`, opts);

  if (resp.status === 204) return null;

  const data = await resp.json().catch(() => ({ detail: resp.statusText }));

  if (!resp.ok) {
    const msg = data.detail || `HTTP ${resp.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

async function uploadFile(path, file) {
  const fd = new FormData();
  fd.append('file', file);
  const resp = await fetch(`${API_BASE}${path}`, { method: 'POST', body: fd });
  if (resp.status === 204) return null;
  const data = await resp.json().catch(() => ({ detail: resp.statusText }));
  if (!resp.ok) throw new Error(data.detail || `HTTP ${resp.status}`);
  return data;
}

const API = {
  // Games
  getGames: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== ''));
    return request('GET', `/games/${qs.toString() ? '?' + qs : ''}`);
  },
  getGame:    (id)       => request('GET',    `/games/${id}`),
  createGame: (data)     => request('POST',   '/games/', data),
  updateGame: (id, data) => request('PATCH',  `/games/${id}`, data),
  deleteGame: (id)       => request('DELETE', `/games/${id}`),

  // Play sessions
  getSessions:   (gameId)       => request('GET',    `/games/${gameId}/sessions`),
  addSession:    (gameId, data) => request('POST',   `/games/${gameId}/sessions`, data),
  deleteSession: (id)           => request('DELETE', `/sessions/${id}`),

  // Images
  uploadImage:        (gameId, file) => uploadFile(`/games/${gameId}/image`, file),
  deleteImage:        (gameId)       => request('DELETE', `/games/${gameId}/image`),

  // Instructions
  uploadInstructions: (gameId, file) => uploadFile(`/games/${gameId}/instructions`, file),
  deleteInstructions: (gameId)       => request('DELETE', `/games/${gameId}/instructions`),

  // 3D scans
  uploadScan:         (gameId, file) => uploadFile(`/games/${gameId}/scan`, file),
  deleteScan:         (gameId)       => request('DELETE', `/games/${gameId}/scan`),

  // GLB scans
  uploadScanGlb:      (gameId, file) => uploadFile(`/games/${gameId}/scan/glb`, file),
  deleteScanGlb:      (gameId)       => request('DELETE', `/games/${gameId}/scan/glb`),

  // Photo gallery (multi-image)
  getImages:          (gameId)           => request('GET', `/games/${gameId}/images`),
  uploadGalleryImage: (gameId, file)     => uploadFile(`/games/${gameId}/images`, file),
  deleteGalleryImage: (gameId, imgId)    => request('DELETE', `/games/${gameId}/images/${imgId}`),
  reorderGalleryImages: (gameId, order)  => request('PATCH', `/games/${gameId}/images/reorder`, { order }),

  // Stats
  getStats: () => request('GET', '/stats'),
};
