import { describe, expect, it } from 'vitest';
import { RepoStateReader } from './repoStateReader';
import { FakeFileSystem } from '../testing/fakes';

const GIT_DIR = '/repo/.git';

describe('RepoStateReader', () => {
  it('repo bình thường trả activity none', async () => {
    const reader = new RepoStateReader(new FakeFileSystem());
    expect(await reader.read(GIT_DIR)).toEqual({ activity: 'none' });
  });

  it('MERGE_HEAD → merging kèm message tự điền từ MERGE_MSG (ui-analysis D2)', async () => {
    const fs = new FakeFileSystem()
      .set(`${GIT_DIR}/MERGE_HEAD`, 'abc123')
      .set(`${GIT_DIR}/MERGE_MSG`, "Merge remote-tracking branch 'origin/main'\n");

    const state = await new RepoStateReader(fs).read(GIT_DIR);

    expect(state.activity).toBe('merging');
    expect(state.message).toBe("Merge remote-tracking branch 'origin/main'");
  });

  it('rebase-merge/ → rebasing (backend merge)', async () => {
    const fs = new FakeFileSystem().set(`${GIT_DIR}/rebase-merge`);
    expect((await new RepoStateReader(fs).read(GIT_DIR)).activity).toBe('rebasing');
  });

  it('rebase-apply/ → rebasing (backend apply)', async () => {
    const fs = new FakeFileSystem().set(`${GIT_DIR}/rebase-apply`);
    expect((await new RepoStateReader(fs).read(GIT_DIR)).activity).toBe('rebasing');
  });

  it('rebase có ưu tiên cao hơn merge (rebase dở cũng tạo MERGE_MSG)', async () => {
    const fs = new FakeFileSystem()
      .set(`${GIT_DIR}/rebase-merge`)
      .set(`${GIT_DIR}/MERGE_HEAD`, 'abc');

    expect((await new RepoStateReader(fs).read(GIT_DIR)).activity).toBe('rebasing');
  });

  it('CHERRY_PICK_HEAD → cherry-picking', async () => {
    const fs = new FakeFileSystem().set(`${GIT_DIR}/CHERRY_PICK_HEAD`, 'abc');
    expect((await new RepoStateReader(fs).read(GIT_DIR)).activity).toBe('cherry-picking');
  });

  it('MERGE_MSG rỗng/không có → message undefined', async () => {
    const fs = new FakeFileSystem().set(`${GIT_DIR}/MERGE_HEAD`, 'abc');
    const state = await new RepoStateReader(fs).read(GIT_DIR);
    expect(state.message).toBeUndefined();
  });
});
