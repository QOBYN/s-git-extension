// Workspace của Orca → "folder" cho RepoManager (thay vscode.workspace.workspaceFolders).
// Orca: mỗi workspace là 1 git worktree hoặc 1 folder của 1 project, có thể nằm
// trên máy SSH/runtime khác — worker chạy git tại máy này nên chỉ lấy workspace local.

import * as path from 'node:path';
import type { WorkspaceReader } from '../../extension/services/interfaces';
import type { OrcaFocusContext, OrcaWorkspace } from './orcaApi';

interface HostCaller {
  call(method: string, params?: unknown): Promise<unknown>;
}

/** Workspace chạy trên máy này: hostId 'local', hoặc null (folder Orca không ghi host). */
export function pickLocalWorkspaces(rows: readonly OrcaWorkspace[]): OrcaWorkspace[] {
  return rows.filter((row) => row.hostId === null || row.hostId === 'local');
}

/**
 * Workspace mà context focus chỉ tới. Ưu tiên id; Orca cũ chỉ báo tên + nhánh
 * (nhiều worktree trùng `main`/`main`) — khi đó lấy cái đầu tiên khớp.
 */
export function matchFocusedWorkspace(
  context: OrcaFocusContext,
  rows: readonly OrcaWorkspace[],
): OrcaWorkspace | null {
  if (context === null) {
    return null;
  }
  if (context.workspaceId !== undefined) {
    const byId = rows.find((row) => row.id === context.workspaceId);
    if (byId !== undefined) {
      return byId;
    }
  }
  return (
    rows.find((row) => row.name === context.displayName && row.branch === context.branch) ?? null
  );
}

/**
 * Tên hiển thị trong dropdown repo. Worktree của 1 project hay trùng tên nhau
 * (`main` ở 2 project) → ghép tên project khi tên workspace chưa nói lên điều đó.
 * Không dùng '/' — RepoInfo.name dạng "cha/path" là quy ước của submodule.
 */
export function displayName(row: OrcaWorkspace): string {
  const project = row.project?.trim();
  if (row.kind === 'worktree' && project && project !== row.name) {
    return `${project} · ${row.name}`;
  }
  return row.name || path.basename(row.path);
}

/** Workspace đang focus lên đầu (panel mở repo đầu tiên), còn lại giữ thứ tự của Orca. */
export function orderFocusedFirst(
  rows: readonly OrcaWorkspace[],
  focused: OrcaWorkspace | null,
): OrcaWorkspace[] {
  if (focused === null) {
    return [...rows];
  }
  return [focused, ...rows.filter((row) => row.id !== focused.id)];
}

/** Workspace chứa `absPath` — chọn root DÀI nhất (worktree lồng trong thư mục khác). */
export function workspaceContaining(
  rows: readonly OrcaWorkspace[],
  absPath: string,
): OrcaWorkspace | null {
  const target = path.resolve(absPath);
  let best: OrcaWorkspace | null = null;
  for (const row of rows) {
    const root = path.resolve(row.path);
    const inside = target === root || target.startsWith(root + path.sep);
    if (inside && (best === null || root.length > path.resolve(best.path).length)) {
      best = row;
    }
  }
  return best;
}

/**
 * WorkspaceReader cho RepoManager + nguồn thông tin focus cho worker.
 * Danh sách hỏi lại Orca mỗi lần (workspace.list rẻ), không cache lâu — Orca
 * không báo sự kiện đổi tên/ẩn project.
 */
export class OrcaWorkspaces implements WorkspaceReader {
  private focusContext: OrcaFocusContext = null;

  constructor(private readonly host: HostCaller) {}

  /** Ghi nhận context mới từ sự kiện `workspace.changed` (khỏi phải hỏi lại readContext). */
  setFocusContext(context: OrcaFocusContext): void {
    this.focusContext = context;
  }

  async list(): Promise<OrcaWorkspace[]> {
    const result = (await this.host.call('workspace.list', {})) as {
      workspaces?: OrcaWorkspace[];
    } | null;
    return pickLocalWorkspaces(result?.workspaces ?? []);
  }

  async focused(rows?: readonly OrcaWorkspace[]): Promise<OrcaWorkspace | null> {
    const list = rows ?? (await this.list());
    if (this.focusContext === null) {
      this.focusContext = (await this.host
        .call('workspace.readContext', {})
        .catch(() => null)) as OrcaFocusContext;
    }
    return matchFocusedWorkspace(this.focusContext, list);
  }

  async getFolders(): Promise<Array<{ name: string; fsPath: string }>> {
    const rows = await this.list();
    const focused = await this.focused(rows);
    return orderFocusedFirst(rows, focused).map((row) => ({
      name: displayName(row),
      fsPath: row.path,
    }));
  }
}
