// ShellPort cho Orca — các hành động "ngoài git" của context menu file/folder.
// VSCode làm bằng API editor/Explorer; Orca không có các API đó cho plugin nên:
//  - Open in Editor → `editor.open` của Orca (tab editor của workspace chứa file);
//  - Reveal / mở bằng app mặc định → lệnh của hệ điều hành;
//  - Rename → node:fs; Delete → Thùng rác của hệ điều hành (KHÔNG xoá vĩnh viễn).
//    Orca không cho worker hiện hộp thoại: panel tự hỏi xác nhận trước khi gọi.
//  - Terminal / Find in Folder: Orca không có API tương ứng — panel ẩn 2 mục này.

import { spawn } from 'node:child_process';
import { access, rename } from 'node:fs/promises';
import * as path from 'node:path';
import type { ShellPort } from '../../extension/rpc/hostFunctions';
import type { OrcaWorkspace } from './orcaApi';
import { workspaceContaining } from './workspaces';

export interface CommandRunner {
  /** Chạy lệnh và chờ xong; exit ≠ 0 → reject kèm stderr. */
  run(command: string, args: string[], env?: Record<string, string>): Promise<void>;
  /** Mở app ngoài rồi bỏ đó (open/xdg-open/explorer) — không chờ. */
  launch(command: string, args: string[]): void;
}

export interface OrcaShellDeps {
  host: {
    call(method: string, params?: unknown): Promise<unknown>;
    has(method: string): boolean;
  };
  workspaces: {
    list(): Promise<OrcaWorkspace[]>;
    focused(rows?: readonly OrcaWorkspace[]): Promise<OrcaWorkspace | null>;
  };
  /** Báo panel mở màn File Log (worker không tự mở được panel). */
  showFileLog(repoRoot: string, relPath: string): void;
  log(message: string): void;
  platform?: NodeJS.Platform;
  commands?: CommandRunner;
}

/** Đường dẫn tuyệt đối của relPath, chặn thoát ra ngoài repo ('..', path tuyệt đối). */
export function resolveInside(repoRoot: string, relPath: string, allowRoot: boolean): string {
  const root = path.resolve(repoRoot);
  const abs = path.resolve(root, relPath);
  if (abs === root ? !allowRoot : !abs.startsWith(root + path.sep)) {
    throw new Error(`Đường dẫn ngoài repo: ${relPath}`);
  }
  return abs;
}

/** Tên mới hợp lệ: 1 thành phần đường dẫn, không rỗng, không phải '.'/'..'. */
export function assertPlainName(name: string): void {
  const trimmed = name.trim();
  if (trimmed === '' || trimmed === '.' || trimmed === '..' || /[\\/]/.test(trimmed)) {
    throw new Error(`Tên không hợp lệ: '${name}'`);
  }
}

/** Chuỗi AppleScript an toàn cho đường dẫn bất kỳ. */
export function appleScriptString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function createOrcaShell(deps: OrcaShellDeps): ShellPort {
  const platform = deps.platform ?? process.platform;
  const commands = deps.commands ?? nodeCommandRunner;

  /** Lỗi của thao tác fire-and-forget chỉ ghi log — ShellPort trả void. */
  const background = (label: string, task: Promise<unknown>) =>
    void task.catch((error: unknown) =>
      deps.log(`${label}: ${error instanceof Error ? error.message : String(error)}`),
    );

  function openWithSystem(absPath: string): void {
    if (platform === 'darwin') {
      commands.launch('open', [absPath]);
    } else if (platform === 'win32') {
      // explorer.exe <file> mở bằng app mặc định, không cần quote kiểu cmd /c start.
      commands.launch('explorer.exe', [absPath]);
    } else {
      commands.launch('xdg-open', [absPath]);
    }
  }

  async function openInOrcaEditor(absPath: string): Promise<boolean> {
    if (!deps.host.has('editor.open')) {
      return false;
    }
    const rows = await deps.workspaces.list();
    const workspace = workspaceContaining(rows, absPath);
    if (workspace === null) {
      return false;
    }
    const focused = await deps.workspaces.focused(rows);
    if (focused?.id !== workspace.id && deps.host.has('workspace.open')) {
      // editor.open chỉ mở tab trong workspace đó — phải hiện workspace ra trước.
      await deps.host.call('workspace.open', { workspaceId: workspace.id });
    }
    const relative = path.relative(workspace.path, absPath).split(path.sep).join('/');
    await deps.host.call('editor.open', { workspaceId: workspace.id, path: relative });
    return true;
  }

  async function moveToTrash(absPath: string): Promise<void> {
    if (platform === 'darwin') {
      // macOS 15+ có sẵn /usr/bin/trash; bản cũ hơn nhờ Finder (giữ được "Put Back").
      const hasTrashCli = await access('/usr/bin/trash').then(
        () => true,
        () => false,
      );
      if (hasTrashCli) {
        await commands.run('/usr/bin/trash', [absPath]);
      } else {
        await commands.run('osascript', [
          '-e',
          `tell application "Finder" to delete (POSIX file ${appleScriptString(absPath)} as alias)`,
        ]);
      }
      return;
    }
    if (platform === 'win32') {
      // Đường dẫn đi qua biến môi trường — khỏi lo quote/escape của PowerShell.
      const script = [
        'Add-Type -AssemblyName Microsoft.VisualBasic',
        '$p = $env:SGIT_TRASH_PATH',
        "if (Test-Path -LiteralPath $p -PathType Container) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p, 'OnlyErrorDialogs', 'SendToRecycleBin') }",
        "else { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p, 'OnlyErrorDialogs', 'SendToRecycleBin') }",
      ].join('; ');
      await commands.run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        SGIT_TRASH_PATH: absPath,
      });
      return;
    }
    await commands.run('gio', ['trash', absPath]).catch((error: unknown) => {
      throw new Error(
        `Không chuyển được vào Thùng rác (cần lệnh 'gio' của GLib) — chưa xoá gì. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }

  return {
    openFile(repoRoot, relPath) {
      background(
        'Open in Editor',
        (async () => {
          const abs = resolveInside(repoRoot, relPath, false);
          if (!(await openInOrcaEditor(abs))) {
            openWithSystem(abs); // file ngoài mọi workspace Orca (vd repo submodule lạ)
          }
        })(),
      );
    },

    revealInOS(repoRoot, relPath) {
      background(
        'Reveal',
        (async () => {
          const abs = resolveInside(repoRoot, relPath, true);
          if (platform === 'darwin') {
            commands.launch('open', ['-R', abs]);
          } else if (platform === 'win32') {
            commands.launch('explorer.exe', [`/select,${abs}`]);
          } else {
            // Không có chuẩn "select" trên Linux — mở thư mục chứa.
            commands.launch('xdg-open', [abs === path.resolve(repoRoot) ? abs : path.dirname(abs)]);
          }
        })(),
      );
    },

    openFileLog(repoRoot, relPath) {
      deps.showFileLog(repoRoot, relPath);
    },

    openInTerminal() {
      deps.log('Open in Terminal: Orca chưa có API cho plugin — bỏ qua.');
    },

    findInFolder() {
      deps.log('Find in Folder: Orca chưa có API cho plugin — bỏ qua.');
    },

    async renamePath(repoRoot, relPath, newName) {
      assertPlainName(newName);
      const abs = resolveInside(repoRoot, relPath, false);
      const target = path.join(path.dirname(abs), newName.trim());
      const exists = await access(target).then(
        () => true,
        () => false,
      );
      if (exists) {
        throw new Error(`'${newName}' đã tồn tại.`);
      }
      await rename(abs, target);
    },

    async deletePath(repoRoot, relPath) {
      await moveToTrash(resolveInside(repoRoot, relPath, false));
      return true;
    },

    openExternal(fsPath) {
      openWithSystem(path.resolve(fsPath));
    },
  };
}

const nodeCommandRunner: CommandRunner = {
  run(command, args, env) {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ['ignore', 'ignore', 'pipe'],
        env: env ? { ...process.env, ...env } : process.env,
        windowsHide: true,
      });
      let stderr = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`${command} exited ${code}${stderr ? `: ${stderr.trim()}` : ''}`)),
      );
    });
  },
  launch(command, args) {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {}); // app không tồn tại — không làm sập worker
    child.unref();
  },
};
