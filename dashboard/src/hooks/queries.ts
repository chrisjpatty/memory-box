import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

// --- Query Keys ---

export const queryKeys = {
  authStatus: ['auth', 'status'] as const,
  tokenHint: ['token', 'hint'] as const,
  stats: ['stats'] as const,
  memories: (params?: { type?: string; tag?: string; category?: string; limit?: number; skip?: number }) =>
    ['memories', params ?? {}] as const,
  memory: (id: string) => ['memories', id] as const,
  search: (query: string) => ['search', query] as const,
  githubToken: ['github', 'token'] as const,
  syncStatus: ['github', 'sync'] as const,
  activeImportJob: ['github', 'import', 'active'] as const,
  importJobStatus: (jobId: string) => ['github', 'import', jobId] as const,
  activeReprocessJob: ['reprocess', 'active'] as const,
  reprocessJobStatus: (jobId: string) => ['reprocess', jobId] as const,
};

// --- Auth ---

export function useAuthStatus() {
  return useQuery({
    queryKey: queryKeys.authStatus,
    queryFn: () => api.authStatus(),
    retry: false,
    staleTime: Infinity,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (password: string) => api.login(password),
    onSuccess: () => {
      qc.setQueryData(queryKeys.authStatus, { authenticated: true });
    },
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

// --- Token ---

export function useTokenHint() {
  return useQuery({
    queryKey: queryKeys.tokenHint,
    queryFn: () => api.tokenHint(),
  });
}

export function useGenerateToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.tokenGenerate(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tokenHint });
    },
  });
}

export function useRotateToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.tokenRotate(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tokenHint });
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
      api.startGitHubImport(repos, token),
  });
}

export function useActiveImportJob() {
  return useQuery({
    queryKey: queryKeys.activeImportJob,
    queryFn: () => api.activeImportJob(),
  });
}

export function useImportJobStatus(jobId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.importJobStatus(jobId!),
    queryFn: () => api.importJobStatus(jobId!),
    enabled: enabled && !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === 'running' ? 1500 : false;
    },
  });
}

export function useCancelGitHubImport() {
  return useMutation({
    mutationFn: (jobId: string) => api.cancelGitHubImport(jobId),
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

// --- Reprocessing ---

export function useActiveReprocessJob() {
  return useQuery({
    queryKey: queryKeys.activeReprocessJob,
    queryFn: () => api.activeReprocessJob(),
  });
}

export function useReprocessJobStatus(jobId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.reprocessJobStatus(jobId!),
    queryFn: () => api.reprocessJobStatus(jobId!),
    enabled: enabled && !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === 'running' ? 1500 : false;
    },
  });
}

export function useStartReprocess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.startReprocess(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.activeReprocessJob });
    },
  });
}

export function useCancelReprocess() {
  return useMutation({
    mutationFn: (jobId: string) => api.cancelReprocess(jobId),
  });
}
