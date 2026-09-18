import { describe, it, expect } from 'vitest';
import { createGame, setPrice } from '@shopflow/sim';
import { estOrdersPer10s } from './promoView';

const g = () => {
  const s = createGame(1, 'electronics');
  s.stage = 4;
  s.inventory = { phone_case: 5, cable: 5 };
  return s;
};

describe('estOrdersPer10s', () => {
  it('null khi ngành chưa có tồn kho, và null với ngành không tồn tại', () => {
    const s = g(); s.inventory = {};
    expect(estOrdersPer10s(s, 'electronics')).toBeNull();
    expect(estOrdersPer10s(g(), 'nope')).toBeNull();
  });
  it('cộng dồn theo từng sản phẩm còn tồn (bỏ qua hàng chưa mở khoá)', () => {
    const s = g();
    const two = estOrdersPer10s(s, 'electronics')!;
    const one = estOrdersPer10s({ ...s, inventory: { phone_case: 5 } }, 'electronics')!;
    expect(two).toBeCloseTo(one * 2); // phone_case và cable cùng giá niêm yết ×1
  });
  it('ước tính GIẢM khi một sản phẩm còn tồn bị nâng giá (trước đây bỏ qua priceMult)', () => {
    const base = estOrdersPer10s(g(), 'electronics')!;
    const dearer = estOrdersPer10s(setPrice(g(), 'phone_case', 1.3), 'electronics')!;
    expect(dearer).toBeLessThan(base);
  });
});
