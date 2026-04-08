export type JobStatus = 'pending' | 'running' | 'completed' | 'cancelled' | 'failed';

export interface JobHandler<TPayload = any> {
  readonly displayName: string;
  /** Whether only one job of this type can run at a time. Default: true */
  readonly exclusive?: boolean;
  process(payload: TPayload, ctx: JobContext): Promise<void>;
}

export interface JobContext {
  readonly jobId: string;
  progress(update: {
    total?: number;
    completed?: number;
    skipped?: number;
    failed?: number;
    currentItem?: string;
  }): Promise<void>;
  addResults(results: any[]): Promise<void>;
  isCancelled(): Promise<boolean>;
  tick(): Promise<void>;
  tickFailed(): Promise<void>;
  tickSkipped(): Promise<void>;
}

export interface JobRecord {
  id: string;
  type: string;
  status: JobStatus;
  payload: any;
  total: number;
  completed: number;
  skipped: number;
  failed: number;
  currentItem: string;
  results: any[];
  error: string | null;
  parentJobId: string | null;
  startedAt: string;
  completedAt: string | null;
}
