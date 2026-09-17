// Hướng dẫn 8 bước (spec C3). Sim chỉ giữ tiến độ + thưởng; điều kiện từng bước do web đánh giá.
import { stages as ST } from '@shopflow/data';
import type { GameState } from './types.js';

export const TUTORIAL_STEPS = 8;
const ok = (s: GameState): GameState => ({ ...s, lastReject: null });
const reject = (s: GameState, msg: string): GameState => ({ ...s, lastReject: msg });

export const tutorialAdvance = (s: GameState): GameState =>
  ok({ ...s, tutorial: { ...s.tutorial, step: Math.min(TUTORIAL_STEPS, s.tutorial.step + 1) } });

export const tutorialSkip = (s: GameState): GameState =>
  ok({ ...s, tutorial: { ...s.tutorial, done: true } });

export function tutorialClaim(s: GameState): GameState {
  if (s.tutorial.step < TUTORIAL_STEPS) return reject(s, 'Chưa hoàn thành hướng dẫn');
  if (s.tutorial.rewarded) return reject(s, 'Đã nhận thưởng hướng dẫn');
  return ok({ ...s, money: s.money + ST.tutorialReward, tutorial: { step: TUTORIAL_STEPS, done: true, rewarded: true } });
}

export const tutorialReset = (s: GameState): GameState =>
  ok({ ...s, tutorial: { ...s.tutorial, step: 0, done: false } });
