import { describe, expect, it } from 'vitest';
import { CacheIndex } from './cacheIndex';
import { FakeStorage } from '../testing/fakes';
import type { CommitInfo } from '../../shared/types';

const COMMIT: CommitInfo = {
  oid: 'abc',
  parents: [],
  author: 'Alice',
  email: 'a@x.com',
  date: '2026-08-26T09:00:00+07:00',
  refs: ['HEAD -> main'],
  subject: 'feat: init',
};

const INPUT = { headOid: 'head1', refsSignature: 'sig1', hasMore: true, commits: [COMMIT] };

describe('CacheIndex', () => {
  it('save rồi load trả lại đúng dữ liệu (roundtrip)', async () => {
    const cache = new CacheIndex(new FakeStorage());

    await cache.save('/repo', INPUT);
    const loaded = await cache.load('/repo');

    expect(loaded).toMatchObject(INPUT);
  });

  it('chưa có cache trả null', async () => {
    expect(await new CacheIndex(new FakeStorage()).load('/repo')).toBeNull();
  });

  it('cache hỏng (JSON lỗi) trả null thay vì ném — UI không bao giờ sập vì cache', async () => {
    const storage = new FakeStorage();
    const cache = new CacheIndex(storage);
    await cache.save('/repo', INPUT);
    // Giả lập ghi dở/đĩa lỗi: sửa thẳng dữ liệu bên dưới thành JSON không hợp lệ.
    const key = [...storage.data.keys()][0];
    storage.data.set(key, '{broken json');

    expect(await cache.load('/repo')).toBeNull();
  });

  it('schema version cũ bị coi là không có cache (invalidate khi đổi cấu trúc)', async () => {
    const storage = new FakeStorage();
    const cache = new CacheIndex(storage);
    await cache.save('/repo', INPUT);
    const key = [...storage.data.keys()][0];
    const data = JSON.parse(storage.data.get(key)!);
    data.schemaVersion = 1;
    storage.data.set(key, JSON.stringify(data));

    expect(await cache.load('/repo')).toBeNull();
  });

  it('invalidate xoá cache của đúng repo', async () => {
    const cache = new CacheIndex(new FakeStorage());
    await cache.save('/repo-a', INPUT);
    await cache.save('/repo-b', { ...INPUT, headOid: 'h2' });

    await cache.invalidate('/repo-a');

    expect(await cache.load('/repo-a')).toBeNull();
    expect((await cache.load('/repo-b'))?.headOid).toBe('h2');
  });

  it('hai repo có path dễ đụng key không ghi đè nhau', async () => {
    const cache = new CacheIndex(new FakeStorage());
    await cache.save('/a/b', { ...INPUT, headOid: 'h1' });
    await cache.save('/a:b', { ...INPUT, headOid: 'h2' });

    expect((await cache.load('/a/b'))?.headOid).toBe('h1');
    expect((await cache.load('/a:b'))?.headOid).toBe('h2');
  });
});
