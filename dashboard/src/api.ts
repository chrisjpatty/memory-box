async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  authStatus: () => request<{ authenticated: boolean }>('/api/auth/status'),
  login: (password: string) => request<{ ok: boolean }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  tokenHint: () => request<{ hint: string | null; hasToken: boolean }>('/api/token/hint'),
  tokenGenerate: () => request<{ token: string }>('/api/token/generate', { method: 'POST' }),
  tokenRotate: () => request<{ token: string }>('/api/token/rotate', { method: 'POST' }),

  stats: () => request<{ memories: number; tags: number; categories: number }>('/api/stats'),

  memories: (params?: { type?: string; tag?: string; category?: string; limit?: number; skip?: number }) => {
    const qs = new URLSearchParams();
    if (params?.type) qs.set('type', params.type);
    if (params?.tag) qs.set('tag', params.tag);
    if (params?.category) qs.set('category', params.category);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.skip) qs.set('skip', String(params.skip));
    const query = qs.toString();
    return request<{ memories: any[]; total: number }>(`/api/memories${query ? `?${query}` : ''}`);
  },
  memory: (id: string) => request<{ found: boolean; memory?: any }>(`/api/memories/${id}`),
  deleteMemory: (id: string) => request<{ success: boolean; message: string }>(`/api/memories/${id}`, { method: 'DELETE' }),

  search: (query: string, limit?: number) => request<{ results: any[] }>('/api/search', { method: 'POST', body: JSON.stringify({ query, limit }) }),

  ingest: (data: { content: string; title?: string; tags?: string[] }) =>
    request<{ success: boolean; memoryId: string; contentType: string; title: string; chunks: number }>('/api/ingest', { method: 'POST', body: JSON.stringify(data) }),

  // GitHub import
  saveGitHubToken: (token: string) =>
    request<{ success: boolean; username: string; hint: string }>('/api/import/github/token', { method: 'POST', body: JSON.stringify({ token }) }),
  getGitHubToken: () =>
    request<{ hasToken: boolean; hint?: string; username?: string; rateLimit?: { remaining: number; limit: number; reset: string } }>('/api/import/github/token'),
  removeGitHubToken: () =>
    request<{ success: boolean }>('/api/import/github/token', { method: 'DELETE' }),
  discoverGitHubStars: (username: string, token?: string) =>
    request<any>('/api/import/github/discover', { method: 'POST', body: JSON.stringify({ username, token }) }),
  startGitHubImport: (repos: string[], token?: string) =>
    request<{ jobId: string }>('/api/import/github/start', { method: 'POST', body: JSON.stringify({ repos, token }) }),
  activeImportJob: () =>
    request<any>('/api/import/github/active'),
  importJobStatus: (jobId: string) =>
    request<any>(`/api/import/github/${jobId}/status`),
  cancelGitHubImport: (jobId: string) =>
    request<{ success: boolean; message: string }>(`/api/import/github/${jobId}/cancel`, { method: 'POST' }),
  enableSync: () =>
    request<{ success: boolean }>('/api/import/github/sync/enable', { method: 'POST' }),
  disableSync: () =>
    request<{ success: boolean }>('/api/import/github/sync/disable', { method: 'POST' }),
  syncStatus: () =>
    request<{ enabled: boolean; lastCheck?: string; nextCheck?: string }>('/api/import/github/sync/status'),

  // Reprocessing
  startReprocess: () =>
    request<{ jobId: string }>('/api/import/reprocess/start', { method: 'POST' }),
  activeReprocessJob: () =>
    request<any>('/api/import/reprocess/active'),
  reprocessJobStatus: (jobId: string) =>
    request<any>(`/api/import/reprocess/${jobId}/status`),
  cancelReprocess: (jobId: string) =>
    request<{ success: boolean }>(`/api/import/reprocess/${jobId}/cancel`, { method: 'POST' }),
};
