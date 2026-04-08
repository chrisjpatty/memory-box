import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

// --- Query Keys ---

export const queryKeys = {
  conversations: ['conversations'] as const,
  authStatus: ['auth', 'status'] as const,
  tokens: ['tokens'] as const,
  stats: ['stats'] as const,
  memories: (params?: { type?: string; tag?: string; category?: string; limit?: number; skip?: number }) =>
    ['memories', params ?? {}] as const,
  infiniteMemories: (type?: string) => ['memories', 'infinite', type ?? ''] as const,
  memory: (id: string) => ['memories', id] as const,
  search: (query: string) => ['search', query] as const,
  githubToken: ['github', 'token'] as const,
  syncStatus: ['github', 'sync'] as const,
  twitterStatus: ['twitter', 'status'] as const,
  activeJob: (type: string) => ['jobs', 'active', type] as const,
  jobStatus: (jobId: string) => ['jobs', jobId] as const,
  activeJobs: ['jobs', 'active'] as const,
  jobHistory: ['jobs', 'history'] as const,
};

// --- Conversations ---

export function useConversations() {
  return useQuery({
    queryKey: queryKeys.conversations,
    queryFn: () => api.listConversations(),
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts?: { id?: string; title?: string }) => api.createConversation(opts),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}

export function useUpdateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => api.updateConversation(id, title),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteConversation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}

// --- Auth ---

export function useAuthStatus() {
  return useQuery({
    queryKey: queryKeys.authStatus,
    queryFn: () => api.authStatus(),
    retry: false,
    staleTime: Infinity,
  });
}

export function useSetup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (password: string) => api.setup(password),
    onSuccess: () => {
      qc.setQueryData(queryKeys.authStatus, { authenticated: true, setupRequired: false });
    },
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (password: string) => api.login(password),
    onSuccess: () => {
      qc.setQueryData(queryKeys.authStatus, { authenticated: true, setupRequired: false });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      api.changePassword(currentPassword, newPassword),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      qc.clear();
    },
  });
}

// --- Tokens ---

export function useTokens() {
  return useQuery({
    queryKey: queryKeys.tokens,
    queryFn: () => api.listTokens(),
  });
}

export function useCreateToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.createToken(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tokens });
    },
  });
}

export function useRevokeToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.revokeToken(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tokens });
    },
  });
}

// --- Stats ---

export function useStats() {
  return useQuery({
    queryKey: queryKeys.stats,
    queryFn: () => api.stats(),
  });
}

// --- Memories ---

export function useMemories(params?: { type?: string; tag?: string; category?: string; limit?: number; skip?: number }) {
  return useQuery({
    queryKey: queryKeys.memories(params),
    queryFn: () => api.memories(params),
  });
}

const PAGE_SIZE = 40;

export function useInfiniteMemories(type?: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.infiniteMemories(type),
    queryFn: ({ pageParam }) => api.memories({ type: type || undefined, limit: PAGE_SIZE, skip: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.memories.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });
}

export function useMemory(id: string) {
  return useQuery({
    queryKey: queryKeys.memory(id),
    queryFn: () => api.memory(id),
  });
}

export function useDeleteMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteMemory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['memories'] });
      qc.invalidateQueries({ queryKey: queryKeys.stats });
    },
  });
}

// --- Search ---

export function useSearch() {
  return useMutation({
    mutationFn: ({ query, limit }: { query: string; limit?: number }) => api.search(query, limit),
  });
}

// --- Ingest ---

export function useIngest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { content: string; title?: string; tags?: string[] }) => api.ingest(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['memories'] });
      qc.invalidateQueries({ queryKey: queryKeys.stats });
    },
  });
}

// --- GitHub Import ---

export function useGitHubToken() {
  return useQuery({
    queryKey: queryKeys.githubToken,
    queryFn: () => api.getGitHubToken(),
  });
}

export function useSaveGitHubToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api.saveGitHubToken(token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.githubToken });
    },
  });
}

export function useRemoveGitHubToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.removeGitHubToken(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.githubToken });
      qc.invalidateQueries({ queryKey: queryKeys.syncStatus });
    },
  });
}

export function useDiscoverGitHubStars() {
  return useMutation({
    mutationFn: ({ username, token }: { username: string; token?: string }) =>
      api.discoverGitHubStars(username, token),
  });
}

export function useStartGitHubImport() {
  return useMutation({
    mutationFn: ({ repos, token }: { repos: string[]; token?: string }) =>
      api.startJob('github-import', { repos, githubToken: token }),
  });
}

export function useSyncStatus() {
  return useQuery({
    queryKey: queryKeys.syncStatus,
    queryFn: () => api.syncStatus(),
  });
}

export function useToggleSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => enabled ? api.enableSync() : api.disableSync(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.syncStatus });
    },
  });
}

// --- Twitter Import ---

export function useTwitterStatus() {
  return useQuery({
    queryKey: queryKeys.twitterStatus,
    queryFn: () => api.getTwitterStatus(),
  });
}

export function useSaveTwitterCredentials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, clientSecret }: { clientId: string; clientSecret: string }) =>
      api.saveTwitterCredentials(clientId, clientSecret),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.twitterStatus });
    },
  });
}

export function useDisconnectTwitter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.disconnectTwitter(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.twitterStatus });
    },
  });
}

export function useGetTwitterAuthUrl() {
  return useMutation({
    mutationFn: () => api.getTwitterAuthUrl(),
  });
}

export function useDiscoverTwitterBookmarks() {
  return useMutation({
    mutationFn: (folderId?: string) => api.discoverTwitterBookmarks(folderId),
  });
}

export function useUploadTwitterExport() {
  return useMutation({
    mutationFn: (file: File) => api.uploadTwitterExport(file),
  });
}

// --- Unified Job Hooks ---

export function useActiveJob(type: string) {
  return useQuery({
    queryKey: queryKeys.activeJob(type),
    queryFn: () => api.activeJob(type),
  });
}

export function useJobStatus(jobId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.jobStatus(jobId!),
    queryFn: () => api.jobStatus(jobId!),
    enabled: enabled && !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === 'running' ? 1500 : false;
    },
  });
}

export function useActiveJobs() {
  return useQuery({
    queryKey: queryKeys.activeJobs,
    queryFn: () => api.listJobs({ status: 'running', limit: 10 }),
    refetchInterval: 1500,
  });
}

export function useJobHistory() {
  return useQuery({
    queryKey: queryKeys.jobHistory,
    queryFn: () => api.listJobs({ limit: 25 }),
  });
}

export function useStartJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ type, payload }: { type: string; payload?: any }) =>
      api.startJob(type, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.activeJobs });
    },
  });
}

export function useCancelJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => api.cancelJob(jobId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.activeJobs });
      qc.invalidateQueries({ queryKey: queryKeys.jobHistory });
    },
  });
}
