import { describe, expect, it } from 'vitest';
import type { OrcaWorkspace } from './orcaApi';
import {
  OrcaWorkspaces,
  displayName,
  matchFocusedWorkspace,
  orderFocusedFirst,
  pickLocalWorkspaces,
  workspaceContaining,
} from './workspaces';

function ws(partial: Partial<OrcaWorkspace> & { id: string; path: string }): OrcaWorkspace {
  return { kind: 'worktree', name: partial.id, branch: 'main', hostId: 'local', ...partial };
}

describe('pickLocalWorkspaces', () => {
  it('giữ local + host null, bỏ SSH/runtime', () => {
    const rows = [
      ws({ id: 'a', path: '/a' }),
      ws({ id: 'b', path: '/b', hostId: null }),
      ws({ id: 'c', path: '/c', hostId: 'ssh:box' }),
      ws({ id: 'd', path: '/d', hostId: 'runtime:x' }),
    ];
    expect(pickLocalWorkspaces(rows).map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('matchFocusedWorkspace', () => {
  const rows = [
    ws({ id: 'w1', path: '/p1/main', name: 'main', branch: 'main' }),
    ws({ id: 'w2', path: '/p2/main', name: 'main', branch: 'main' }),
    ws({ id: 'w3', path: '/p1/feat', name: 'feat', branch: 'feat' }),
  ];

  it('ưu tiên id', () => {
    expect(
      matchFocusedWorkspace({ workspaceId: 'w2', displayName: 'main', branch: 'main' }, rows)?.id,
    ).toBe('w2');
  });

  it('id lạ / không có id → khớp tên + nhánh, lấy cái đầu', () => {
    expect(matchFocusedWorkspace({ displayName: 'feat', branch: 'feat' }, rows)?.id).toBe('w3');
    expect(
      matchFocusedWorkspace({ workspaceId: 'zz', displayName: 'main', branch: 'main' }, rows)?.id,
    ).toBe('w1');
  });

  it('không focus / không khớp → null', () => {
    expect(matchFocusedWorkspace(null, rows)).toBeNull();
    expect(matchFocusedWorkspace({ displayName: 'x', branch: 'y' }, rows)).toBeNull();
  });
});

describe('displayName', () => {
  it('worktree: ghép project khi tên khác project; folder giữ tên', () => {
    expect(displayName(ws({ id: 'x', path: '/x', name: 'main', project: 'api' }))).toBe('api · main');
    expect(displayName(ws({ id: 'x', path: '/x', name: 'api', project: 'api' }))).toBe('api');
    expect(displayName(ws({ id: 'x', path: '/x', name: 'docs', kind: 'folder', project: 'p' }))).toBe(
      'docs',
    );
  });

  it('không dùng "/" (dành cho submodule cha/path)', () => {
    expect(displayName(ws({ id: 'x', path: '/x', name: 'main', project: 'api' }))).not.toContain('/');
  });

  it('tên rỗng → basename của path', () => {
    expect(displayName(ws({ id: 'x', path: '/repos/s-git', name: '' }))).toBe('s-git');
  });
});

describe('orderFocusedFirst / workspaceContaining', () => {
  const rows = [
    ws({ id: 'a', path: '/w/a' }),
    ws({ id: 'b', path: '/w/b' }),
    ws({ id: 'nested', path: '/w/a/sub' }),
  ];

  it('đưa workspace focus lên đầu, giữ thứ tự phần còn lại', () => {
    expect(orderFocusedFirst(rows, rows[1]).map((r) => r.id)).toEqual(['b', 'a', 'nested']);
    expect(orderFocusedFirst(rows, null).map((r) => r.id)).toEqual(['a', 'b', 'nested']);
  });

  it('chọn workspace có root dài nhất chứa file; không nhận tiền tố trùng tên', () => {
    expect(workspaceContaining(rows, '/w/a/sub/x.ts')?.id).toBe('nested');
    expect(workspaceContaining(rows, '/w/a/x.ts')?.id).toBe('a');
    expect(workspaceContaining(rows, '/w/ab/x.ts')).toBeNull();
  });
});

describe('OrcaWorkspaces', () => {
  it('getFolders: chỉ local, workspace focus đầu tiên', async () => {
    const host = {
      async call(method: string) {
        if (method === 'workspace.list') {
          return {
            workspaces: [
              ws({ id: 'a', path: '/w/a', name: 'a' }),
              ws({ id: 'b', path: '/w/b', name: 'b' }),
              ws({ id: 'r', path: '/remote', hostId: 'ssh:x' }),
            ],
          };
        }
        if (method === 'workspace.readContext') {
          return { workspaceId: 'b', displayName: 'b', branch: 'main', terminals: [] };
        }
        throw new Error(method);
      },
    };
    const reader = new OrcaWorkspaces(host);
    expect(await reader.getFolders()).toEqual([
      { name: 'b', fsPath: '/w/b' },
      { name: 'a', fsPath: '/w/a' },
    ]);
    // Sự kiện workspace.changed đổi focus không cần hỏi lại readContext.
    reader.setFocusContext({ workspaceId: 'a', displayName: 'a', branch: 'main' });
    expect((await reader.getFolders())[0].fsPath).toBe('/w/a');
  });
});
