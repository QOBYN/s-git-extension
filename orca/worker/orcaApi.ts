// Kiểu tối thiểu của API Orca mà worker dùng — chỉ phần cần, tránh phụ thuộc
// typings sinh bởi `orca plugin types` (.orca/types, không commit).
// Tham chiếu: docs/reference/plugin-authoring.md + plugin-host-api.md của Orca.

export interface OrcaDisposable {
  dispose(): void;
}

export interface PanelRequestContext {
  panel: { id: string };
  signal: AbortSignal;
}

export interface OrcaWorkerApi {
  readonly api: { major: number; minor: number };
  readonly host: {
    call(method: string, params?: unknown): Promise<unknown>;
    has(method: string): boolean;
  };
  readonly panels: {
    handle(
      name: string,
      handler: (input: unknown, context: PanelRequestContext) => unknown,
    ): OrcaDisposable;
    post(event: string, payload?: unknown, options?: { panel?: string }): void;
  };
  readonly events: {
    on(event: string, handler: (payload: unknown) => void | Promise<void>): OrcaDisposable;
  };
  log(message: string): void;
}

/** 1 dòng của `workspace.list`. */
export interface OrcaWorkspace {
  id: string;
  kind: 'worktree' | 'folder';
  name: string;
  project?: string | null;
  projectId?: string | null;
  path: string;
  branch: string | null;
  hostId: string | null;
}

/** Kết quả `workspace.readContext` / payload `workspace.changed`.context. */
export type OrcaFocusContext = {
  workspaceId?: string;
  branch: string;
  displayName: string;
} | null;
