import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GitRunner, GitRunOptions } from './gitRunner';
import { MediaExporter } from './mediaExporter';

/** Runner ghi file thật (MediaExporter kiểm tra tồn tại bằng fs) — đếm số lần xuất. */
class DiskWritingRunner implements GitRunner {
  exportCount = 0;

  constructor(private readonly blobs: Record<string, string>) {}

  async run(_cwd: string, args: string[], _opts?: GitRunOptions): Promise<string> {
    if (args[0] === 'rev-parse') {
      return `oid-of(${args[1]})\n`;
    }
    throw new Error(`lệnh ngoài dự kiến: ${args.join(' ')}`);
  }

  async runToFile(_cwd: string, args: string[], outFile: string): Promise<void> {
    expect(args.slice(0, 2)).toEqual(['cat-file', 'blob']);
    this.exportCount++;
    const { writeFile } = await import('node:fs/promises');
    await writeFile(outFile, this.blobs[args[2]] ?? '');
  }
}

describe('MediaExporter', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 's-git-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('xuất blob ra file <oid><ext> và trả đường dẫn tuyệt đối', async () => {
    const runner = new DiskWritingRunner({ 'oid-of(abc:clip.ogv)': 'video-bytes' });
    const exporter = new MediaExporter(runner, dir);

    const path = await exporter.exportBlob('/repo', 'abc:clip.ogv', '.ogv');

    expect(path).toBe(join(dir, 'oid-of(abc:clip.ogv).ogv'));
    expect(await readFile(path, 'utf8')).toBe('video-bytes');
    // Không để sót file .part sau khi rename.
    await expect(stat(`${path}.part`)).rejects.toThrow();
  });

  it('cache theo oid blob — cùng nội dung chỉ xuất 1 lần, kể cả gọi song song', async () => {
    const runner = new DiskWritingRunner({ 'oid-of(abc:clip.ogv)': 'video-bytes' });
    const exporter = new MediaExporter(runner, dir);

    const [a, b] = await Promise.all([
      exporter.exportBlob('/repo', 'abc:clip.ogv', '.ogv'),
      exporter.exportBlob('/repo', 'abc:clip.ogv', '.ogv'),
    ]);
    await exporter.exportBlob('/repo', 'abc:clip.ogv', '.ogv'); // lần 3, tuần tự

    expect(a).toBe(b);
    expect(runner.exportCount).toBe(1);
  });

  it('dispose xoá cả thư mục tạm', async () => {
    const runner = new DiskWritingRunner({ 'oid-of(abc:clip.ogv)': 'x' });
    const exporter = new MediaExporter(runner, dir);
    await exporter.exportBlob('/repo', 'abc:clip.ogv', '.ogv');

    await exporter.dispose();

    await expect(stat(dir)).rejects.toThrow();
  });
});
