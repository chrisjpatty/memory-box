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
  authStatus: () => request<{ authenticated: boolean; setupRequired: boolean }>('/api/auth/status'),
  setup: (password: string) => request<{ ok: boolean }>('/api/auth/setup', { method: 'POST', body: JSON.stringify({ password }) }),
  login: (password: string) => request<{ ok: boolean }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  listTokens: () => request<{ tokens: { id: number; name: string; hint: string; created_at: string }[] }>('/api/token'),
  createToken: (name: string) => request<{ token: string }>('/api/token/create', { method: 'POST', body: JSON.stringify({ name }) }),
  revokeToken: (id: number) => request<{ success: boolean }>(`/api/token/${id}`, { method: 'DELETE' }),

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
  clearAllMemories: () => request<{ success: boolean }>('/api/memories', { method: 'DELETE' }),

  search: (query: string, limit?: number) => request<{ results: any[] }>('/api/search', { method: 'POST', body: JSON.stringify({ query, limit }) }),

  ingest: (data: { content: string; title?: string; tags?: string[] }) =>
    request<{ success: boolean; memoryId: string; contentType: string; title: string; chunks: number }>('/api/ingest', { method: 'POST', body: JSON.stringify(data) }),

  // GitHub token & discovery (non-job routes)
  saveGitHubToken: (token: string) =>
    request<{ success: boolean; username: string; hint: string }>('/api/import/github/token', { method: 'POST', body: JSON.stringify({ token }) }),
  getGitHubToken: () =>
    request<{ hasToken: boolean; hint?: string; username?: string; rateLimit?: { remaining: number; limit: number; reset: string } }>('/api/import/github/token'),
  removeGitHubToken: () =>
    request<{ success: boolean }>('/api/import/github/token', { method: 'DELETE' }),
  discoverGitHubStars: (username: string, token?: string) =>
    request<any>('/api/import/github/discover', { method: 'POST', body: JSON.stringify({ username, token }) }),
  enableSync: () =>
    request<{ success: boolean }>('/api/import/github/sync/enable', { method: 'POST' }),
  disableSync: () =>
    request<{ success: boolean }>('/api/import/github/sync/disable', { method: 'POST' }),
  syncStatus: () =>
    request<{ enabled: boolean; lastCheck?: string; nextCheck?: string }>('/api/import/github/sync/status'),

  // Twitter OAuth 2.0 & discovery
  saveTwitterCredentials: (clientId: string, clientSecret: string) =>
    request<{ success: boolean }>('/api/import/twitter/credentials', { method: 'POST', body: JSON.stringify({ clientId, clientSecret }) }),
  getTwitterStatus: () =>
    request<{ hasCredentials: boolean; hasToken: boolean; username?: string; userId?: string }>('/api/import/twitter/status'),
  getTwitterAuthUrl: () =>
    request<{ url: string }>('/api/import/twitter/authorize'),
  disconnectTwitter: () =>
    request<{ success: boolean }>('/api/import/twitter/disconnect', { method: 'DELETE' }),
  discoverTwitterBookmarks: (folderId?: string) =>
    request<any>('/api/import/twitter/discover', { method: 'POST', body: JSON.stringify({ folderId }) }),
  uploadTwitterExport: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/import/twitter/upload', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Upload failed: ${res.status}`);
    }
    return res.json();
  },
  getTwitterFolders: () =>
    request<{ folders: { id: string; name: string }[] }>('/api/import/twitter/folders'),

  // Conversations
  listConversations: () =>
    request<{ conversations: { id: string; title: string; created_at: string; updated_at: string }[] }>('/api/conversations'),
  createConversation: (opts?: { id?: string; title?: string }) =>
    request<{ id: string; title: string; created_at: string; updated_at: string }>('/api/conversations', { method: 'POST', body: JSON.stringify(opts) }),
  conversationMessages: (id: string) =>
    request<{ messages: { id: string; role: string; content: string; parts: any[] }[] }>(`/api/conversations/${id}/messages`),
  updateConversation: (id: string, title: string) =>
    request<{ id: string; title: string; created_at: string; updated_at: string }>(`/api/conversations/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  deleteConversation: (id: string) =>
    request<{ success: boolean }>(`/api/conversations/${id}`, { method: 'DELETE' }),

  // Unified job system
  startJob: (type: string, payload?: any) =>
    request<{ jobId: string }>('/api/jobs', { method: 'POST', body: JSON.stringify({ type, payload }) }),
  activeJob: (type: string) =>
    request<any>(`/api/jobs/active/${type}`),
  jobStatus: (jobId: string) =>
    request<any>(`/api/jobs/${jobId}`),
  cancelJob: (jobId: string) =>
    request<{ success: boolean; message: string }>(`/api/jobs/${jobId}/cancel`, { method: 'POST' }),
  listJobs: (params?: { type?: string; status?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.type) qs.set('type', params.type);
    if (params?.status) qs.set('status', params.status);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const query = qs.toString();
    return request<{ jobs: any[]; total: number }>(`/api/jobs${query ? `?${query}` : ''}`);
  },
};
