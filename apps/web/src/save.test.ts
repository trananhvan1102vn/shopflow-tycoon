import { describe, it, expect } from 'vitest';
import { SAVE_VERSION, validateSave } from './save';

const goodState = { money: 100000, packAccum: 0, orders: [], tutorial: { step: 0, done: false, rewarded: false }, questsDone: [], activeRandomEvents: [], priceMult: {}, priceWarsWon: 0 };
const blob = (o: any) => JSON.stringify(o);

describe('validateSave', () => {
  it('save hợp lệ → {seed, state}', () => {
    const v = validateSave(blob({ seed: 42, version: SAVE_VERSION, state: goodState }));
    expect(v).not.toBeNull();
    expect(v!.seed).toBe(42);
    expect(v!.state.money).toBe(100000);
  });
  it('JSON hỏng → null', () => {
    expect(validateSave('{ "seed": 42, ')).toBeNull();
    expect(validateSave('not json at all')).toBeNull();
  });
  it('thiếu version (save cũ) → null', () => {
    expect(validateSave(blob({ seed: 42, state: goodState }))).toBeNull();
  });
  it('sai version → null', () => {
    expect(validateSave(blob({ seed: 42, version: SAVE_VERSION + 1, state: goodState }))).toBeNull();
  });
  it('thiếu packAccum (state cũ → NaN brick) → null', () => {
    const { packAccum, ...rest } = goodState;
    expect(validateSave(blob({ seed: 42, version: SAVE_VERSION, state: rest }))).toBeNull();
  });
  it('thiếu orders / money / state → null', () => {
    expect(validateSave(blob({ seed: 42, version: SAVE_VERSION, state: { money: 1, packAccum: 0 } }))).toBeNull();
    expect(validateSave(blob({ seed: 42, version: SAVE_VERSION, state: { packAccum: 0, orders: [] } }))).toBeNull();
    expect(validateSave(blob({ seed: 42, version: SAVE_VERSION, state: null }))).toBeNull();
  });
  it('null / rỗng → null', () => {
    expect(validateSave(null)).toBeNull();
    expect(validateSave('')).toBeNull();
  });
  it('v2: thiếu tutorial hoặc questsDone → null', () => {
    const { tutorial, ...noTut } = goodState;
    expect(validateSave(blob({ seed: 42, version: SAVE_VERSION, state: noTut }))).toBeNull();
    const { questsDone, ...noQ } = goodState;
    expect(validateSave(blob({ seed: 42, version: SAVE_VERSION, state: noQ }))).toBeNull();
  });
  it('v3: thiếu activeRandomEvents → null', () => {
    const { activeRandomEvents, ...noEvents } = goodState;
    expect(validateSave(blob({ seed: 42, version: SAVE_VERSION, state: noEvents }))).toBeNull();
  });
  it('v3: priceMult không phải object thuần → null (priceMultOf sẽ ném TypeError trong worker)', () => {
    const { priceMult, ...noPm } = goodState;
    expect(validateSave(blob({ seed: 42, version: SAVE_VERSION, state: noPm }))).toBeNull();
    expect(validateSave(blob({ seed: 42, version: SAVE_VERSION, state: { ...goodState, priceMult: null } }))).toBeNull();
    expect(validateSave(blob({ seed: 42, version: SAVE_VERSION, state: { ...goodState, priceMult: [] } }))).toBeNull();
    expect(validateSave(blob({ seed: 42, version: SAVE_VERSION, state: { ...goodState, priceMult: 'x' } }))).toBeNull();
  });
  it('v3: priceWarsWon không phải số hữu hạn → null (priceWarsWon++ sẽ ra NaN)', () => {
    const { priceWarsWon, ...noPw } = goodState;
    expect(validateSave(blob({ seed: 42, version: SAVE_VERSION, state: noPw }))).toBeNull();
    expect(validateSave(blob({ seed: 42, version: SAVE_VERSION, state: { ...goodState, priceWarsWon: null } }))).toBeNull();
    expect(validateSave(blob({ seed: 42, version: SAVE_VERSION, state: { ...goodState, priceWarsWon: '3' } }))).toBeNull();
  });
  it('savedAt được trả về (null nếu thiếu / không phải số)', () => {
    expect(validateSave(blob({ seed: 42, version: SAVE_VERSION, state: goodState }))!.savedAt).toBeNull();
    expect(validateSave(blob({ seed: 42, version: SAVE_VERSION, savedAt: 1700000000000, state: goodState }))!.savedAt).toBe(1700000000000);
    expect(validateSave(blob({ seed: 42, version: SAVE_VERSION, savedAt: 'x', state: goodState }))!.savedAt).toBeNull();
  });
});
