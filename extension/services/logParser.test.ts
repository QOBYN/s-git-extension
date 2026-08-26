import { describe, expect, it } from 'vitest';
import { parseLog } from './logParser';

const F = '\x1f'; // field separator — khớp LOG_FORMAT
const R = '\x1e'; // record separator

/** Dựng 1 record đúng format git sinh ra từ LOG_FORMAT. */
function record(fields: {
  oid: string;
  parents?: string;
  author?: string;
  email?: string;
  date?: string;
  refs?: string;
  subject?: string;
}): string {
  return [
    fields.oid,
    fields.parents ?? '',
    fields.author ?? 'Alice',
    fields.email ?? 'alice@example.com',
    fields.date ?? '2026-08-26T09:00:00+07:00',
    fields.refs ?? '',
    fields.subject ?? 'subject',
  ].join(F);
}

describe('parseLog', () => {
  it('parse commit thường và merge commit (2 parent)', () => {
    // git nối các record bằng "\n" (do format kết thúc bằng %x1e)
    const out = [
      record({ oid: 'aaa', parents: 'p1', subject: 'feat: one' }),
      record({ oid: 'bbb', parents: 'p1 p2', subject: "Merge branch 'dev'" }),
    ].join(`${R}\n`) + R;

    const commits = parseLog(out);

    expect(commits).toHaveLength(2);
    expect(commits[0]).toMatchObject({ oid: 'aaa', parents: ['p1'], subject: 'feat: one' });
    expect(commits[1].parents).toEqual(['p1', 'p2']);
  });

  it('commit gốc (không parent) trả parents rỗng', () => {
    const commits = parseLog(record({ oid: 'root', parents: '' }) + R);
    expect(commits[0].parents).toEqual([]);
  });

  it('parse refs: HEAD ->, remote branch, tag — giữ nguyên văn', () => {
    const out = record({ oid: 'aaa', refs: 'HEAD -> main, origin/main, tag: v1.0' }) + R;
    expect(parseLog(out)[0].refs).toEqual(['HEAD -> main', 'origin/main', 'tag: v1.0']);
  });

  it('commit không có ref trả refs rỗng', () => {
    expect(parseLog(record({ oid: 'aaa' }) + R)[0].refs).toEqual([]);
  });

  it('subject unicode + tiếng Việt giữ nguyên', () => {
    const subject = 'fix(ci): trạng thái review sống ở THREAD, không ở note (D-268) 🚀';
    expect(parseLog(record({ oid: 'aaa', subject }) + R)[0].subject).toBe(subject);
  });

  it('date là ISO 8601 từ %aI', () => {
    const out = record({ oid: 'aaa', date: '2026-08-26T09:00:00+07:00' }) + R;
    expect(parseLog(out)[0].date).toBe('2026-08-26T09:00:00+07:00');
  });

  it('input rỗng trả mảng rỗng (repo trống)', () => {
    expect(parseLog('')).toEqual([]);
  });

  it('record hỏng bị bỏ qua, các record lành vẫn parse được', () => {
    const out = ['garbage-without-separators', record({ oid: 'good' })].join(`${R}\n`) + R;
    const commits = parseLog(out);
    expect(commits).toHaveLength(1);
    expect(commits[0].oid).toBe('good');
  });
});
