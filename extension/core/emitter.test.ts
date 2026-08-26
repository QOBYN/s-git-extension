import { describe, expect, it } from 'vitest';
import { Emitter } from './emitter';

describe('Emitter', () => {
  it('fire gửi sự kiện tới mọi listener đang đăng ký', () => {
    const emitter = new Emitter<number>();
    const received: number[] = [];
    emitter.event((n) => received.push(n));
    emitter.event((n) => received.push(n * 10));

    emitter.fire(7);

    expect(received).toEqual([7, 70]);
  });

  it('dispose của subscription huỷ đăng ký listener đó', () => {
    const emitter = new Emitter<string>();
    const received: string[] = [];
    const sub = emitter.event((s) => received.push(s));

    emitter.fire('a');
    sub.dispose();
    emitter.fire('b');

    expect(received).toEqual(['a']);
  });

  it('listener tự huỷ đăng ký trong callback không phá vòng fire hiện tại', () => {
    const emitter = new Emitter<void>();
    const order: string[] = [];
    const sub = emitter.event(() => {
      order.push('self-removing');
      sub.dispose();
    });
    emitter.event(() => order.push('other'));

    emitter.fire();
    emitter.fire();

    // Lần fire 1: cả hai chạy; lần 2: listener đã tự huỷ không chạy nữa.
    expect(order).toEqual(['self-removing', 'other', 'other']);
  });

  it('sau khi emitter dispose, fire không gọi ai và subscribe mới vô hiệu', () => {
    const emitter = new Emitter<void>();
    let count = 0;
    emitter.event(() => count++);

    emitter.dispose();
    emitter.event(() => count++);
    emitter.fire();

    expect(count).toBe(0);
  });
});
