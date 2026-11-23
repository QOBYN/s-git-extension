import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { OrcaWorkspace } from './orcaApi';
import {
  appleScriptString,
  assertPlainName,
  createOrcaShell,
  resolveInside,
  type CommandRunner,
} from './shell';

function recorder() {
  const runs: Array<{ command: string; args: string[]; env?: Record<string, string> }> = [];
  const launches: Array<{ command: string; args: string[] }> = [];
  const commands: CommandRunner = {
    async run(command, args, env) {
      runs.push({ command, args, env });
    },
    launch(command, args) {
      launches.push({ command, args });
    },
  };
  return { runs, launches, commands };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeShell(opts: {
  platform: NodeJS.Platform;
  rows?: OrcaWorkspace[];
  focusedId?: string | null;
  has?: string[];
}) {
  const rec = recorder();
  const hostCalls: Array<{ method: string; params: unknown }> = [];
  const logs: string[] = [];
  const fileLogs: string[] = [];
  const rows = opts.rows ?? [];
  const shell = createOrcaShell({
    host: {
      async call(method, params) {
        hostCalls.push({ method, params });
        return {};
      },
      has: (method) => (opts.has ?? ['editor.open', 'workspace.open']).includes(method),
    },
    workspaces: {
      list: async () => rows,
      focused: async () => rows.find((r) => r.id === opts.focusedId) ?? null,
    },
    showFileLog: (root, rel) => fileLogs.push(`${root}:${rel}`),
    log: (message) => logs.push(message),
    platform: opts.platform,
    commands: rec.commands,
  });
  return { shell, hostCalls, logs, fileLogs, ...rec };
}

describe('helpers', () => {
  it('resolveInside chặn thoát khỏi repo', () => {
    expect(resolveInside('/repo', 'a/b.txt', false)).toBe(path.resolve('/repo/a/b.txt'));
    expect(() => resolveInside('/repo', '../etc/passwd', false)).toThrow();
    expect(() => resolveInside('/repo', '/etc/passwd', false)).toThrow();
    expect(() => resolveInside('/repo', '', false)).toThrow();
    expect(resolveInside('/repo', '', true)).toBe(path.resolve('/repo'));
  });

  it('assertPlainName chỉ nhận 1 thành phần đường dẫn', () => {
    expect(() => assertPlainName('ok-name.txt')).not.toThrow();
    for (const bad of ['', '  ', '.', '..', 'a/b', 'a\\b']) {
      expect(() => assertPlainName(bad)).toThrow();
    }
  });

  it('appleScriptString escape dấu nháy và backslash', () => {
    expect(appleScriptString('/a "b"\\c')).toBe('"/a \\"b\\"\\\\c"');
  });
});

describe('openFile', () => {
  const rows: OrcaWorkspace[] = [
    { id: 'w1', kind: 'worktree', name: 'main', path: '/ws/one', branch: 'main', hostId: 'local' },
    { id: 'w2', kind: 'worktree', name: 'feat', path: '/ws/two', branch: 'feat', hostId: 'local' },
  ];

  it('mở trong editor Orca với path tương đối workspace', async () => {
    const t = makeShell({ platform: 'darwin', rows, focusedId: 'w1' });
    t.shell.openFile('/ws/one/pkg', 'src/a.ts');
    await flush();
    await flush();
    expect(t.hostCalls).toEqual([
      { method: 'editor.open', params: { workspaceId: 'w1', path: 'pkg/src/a.ts' } },
    ]);
    expect(t.launches).toEqual([]);
  });

  it('file thuộc workspace khác → hiện workspace đó trước', async () => {
    const t = makeShell({ platform: 'darwin', rows, focusedId: 'w1' });
    t.shell.openFile('/ws/two', 'b.ts');
    await flush();
    await flush();
    expect(t.hostCalls.map((c) => c.method)).toEqual(['workspace.open', 'editor.open']);
  });

  it('ngoài mọi workspace / Orca không có editor.open → app mặc định của HĐH', async () => {
    const t = makeShell({ platform: 'linux', rows, focusedId: 'w1' });
    t.shell.openFile('/elsewhere', 'c.ts');
    const t2 = makeShell({ platform: 'darwin', rows, focusedId: 'w1', has: [] });
    t2.shell.openFile('/ws/one', 'd.ts');
    await flush();
    await flush();
    expect(t.launches).toEqual([{ command: 'xdg-open', args: [path.resolve('/elsewhere/c.ts')] }]);
    expect(t2.launches).toEqual([{ command: 'open', args: [path.resolve('/ws/one/d.ts')] }]);
  });

  it('đường dẫn ngoài repo chỉ ghi log, không mở gì', async () => {
    const t = makeShell({ platform: 'darwin', rows });
    t.shell.openFile('/ws/one', '../../etc/passwd');
    await flush();
    expect(t.launches).toEqual([]);
    expect(t.logs[0]).toContain('ngoài repo');
  });
});

describe('revealInOS / openExternal / openFileLog', () => {
  it('lệnh đúng theo hệ điều hành', async () => {
    const mac = makeShell({ platform: 'darwin' });
    const win = makeShell({ platform: 'win32' });
    const linux = makeShell({ platform: 'linux' });
    mac.shell.revealInOS('/repo', 'a.txt');
    win.shell.revealInOS('/repo', 'a.txt');
    linux.shell.revealInOS('/repo', 'dir/a.txt');
    await flush();
    expect(mac.launches[0]).toEqual({ command: 'open', args: ['-R', path.resolve('/repo/a.txt')] });
    expect(win.launches[0]).toEqual({
      command: 'explorer.exe',
      args: [`/select,${path.resolve('/repo/a.txt')}`],
    });
    expect(linux.launches[0]).toEqual({ command: 'xdg-open', args: [path.resolve('/repo/dir')] });
  });

  it('openFileLog chuyển cho panel', () => {
    const t = makeShell({ platform: 'darwin' });
    t.shell.openFileLog('/repo', 'a.ts');
    expect(t.fileLogs).toEqual(['/repo:a.ts']);
  });
});

describe('deletePath → Thùng rác', () => {
  it('Linux dùng gio trash; Windows truyền path qua biến môi trường', async () => {
    const linux = makeShell({ platform: 'linux' });
    expect(await linux.shell.deletePath('/repo', 'old')).toBe(true);
    expect(linux.runs).toEqual([{ command: 'gio', args: ['trash', path.resolve('/repo/old')], env: undefined }]);

    const win = makeShell({ platform: 'win32' });
    await win.shell.deletePath('/repo', 'old');
    expect(win.runs[0].command).toBe('powershell.exe');
    expect(win.runs[0].env).toEqual({ SGIT_TRASH_PATH: path.resolve('/repo/old') });
    expect(win.runs[0].args.join(' ')).not.toContain('/repo');
  });

  it('không xoá root repo / đường dẫn ngoài repo', async () => {
    const t = makeShell({ platform: 'linux' });
    await expect(t.shell.deletePath('/repo', '')).rejects.toThrow();
    await expect(t.shell.deletePath('/repo', '../x')).rejects.toThrow();
    expect(t.runs).toEqual([]);
  });

  it('gio hỏng → báo lỗi rõ, không xoá vĩnh viễn', async () => {
    const t = makeShell({ platform: 'linux' });
    const failing = createOrcaShell({
      host: { call: async () => ({}), has: () => false },
      workspaces: { list: async () => [], focused: async () => null },
      showFileLog: () => {},
      log: () => {},
      platform: 'linux',
      commands: {
        run: async () => {
          throw new Error('gio: not found');
        },
        launch: () => {},
      },
    });
    await expect(failing.deletePath('/repo', 'x')).rejects.toThrow(/Thùng rác/);
    expect(t.runs).toEqual([]);
  });
});

describe('renamePath', () => {
  let dir = '';
  afterEach(async () => {
    if (dir !== '') {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('đổi tên trong cùng thư mục; từ chối tên đã tồn tại / tên có "/"', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'sgit-shell-'));
    await writeFile(path.join(dir, 'a.txt'), 'A');
    await writeFile(path.join(dir, 'b.txt'), 'B');
    const { shell } = makeShell({ platform: 'darwin' });
    await shell.renamePath(dir, 'a.txt', 'c.txt');
    expect(await readFile(path.join(dir, 'c.txt'), 'utf8')).toBe('A');
    await expect(shell.renamePath(dir, 'c.txt', 'b.txt')).rejects.toThrow(/đã tồn tại/);
    await expect(shell.renamePath(dir, 'c.txt', 'x/y.txt')).rejects.toThrow();
  });
});
