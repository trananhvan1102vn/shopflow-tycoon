import { describe, it, expect } from 'vitest';
import { SAVE_VERSION, validateSave } from './save';

const goodState = { money: 100000, packAccum: 0, orders: [], tutorial: { step: 0, done: false, rewarded: false }, questsDone: [] };
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
  it('savedAt được trả về (null nếu thiếu / không phải số)', () => {
    expect(validateSave(blob({ seed: 42, version: SAVE_VERSION, state: goodState }))!.savedAt).toBeNull();
    expect(validateSave(blob({ seed: 42, version: SAVE_VERSION, savedAt: 1700000000000, state: goodState }))!.savedAt).toBe(1700000000000);
    expect(validateSave(blob({ seed: 42, version: SAVE_VERSION, savedAt: 'x', state: goodState }))!.savedAt).toBeNull();
  });
});
