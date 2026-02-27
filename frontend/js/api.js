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

  // Instructions (uses raw fetch — multipart file upload)
  uploadInstructions: async (gameId, file) => {
    const fd = new FormData();
    fd.append('file', file);
    const resp = await fetch(`${API_BASE}/games/${gameId}/instructions`, { method: 'POST', body: fd });
    if (resp.status === 204) return null;
    const data = await resp.json().catch(() => ({ detail: resp.statusText }));
    if (!resp.ok) throw new Error(data.detail || `HTTP ${resp.status}`);
    return data;
  },
  deleteInstructions: (gameId) => request('DELETE', `/games/${gameId}/instructions`),

  // Stats
  getStats: () => request('GET', '/stats'),
};
