import { create } from 'zustand';
import type { GameState } from '@shopflow/sim';

const SAVE_KEY = 'shopflow-save';

interface GameStore {
  game: GameState | null;
  paused: boolean;
  booted: boolean;   // worker đã trả lời init
  hasSave: boolean;
  seed: number;
  dispatch: (name: string, ...args: unknown[]) => void;
  start: (industryId: string) => void;
  setPaused: (p: boolean) => void;
}

let worker: Worker | null = null;

export const useGame = create<GameStore>((set, get) => {
  const w = new Worker(new URL('./worker/simWorker.ts', import.meta.url), { type: 'module' });
  worker = w;
  const savedRaw = localStorage.getItem(SAVE_KEY);
  // UI shell code: performance.now() only seeds the UI; the sim only ever sees the numeric seed.
  const seed = savedRaw ? JSON.parse(savedRaw).seed : (Math.floor(performance.now() * 1000) % 2 ** 31 || 1);
  w.onmessage = (ev) => {
    if (ev.data.type === 'state') set({ game: ev.data.state, booted: true, hasSave: true });
    if (ev.data.type === 'nosave') set({ booted: true, hasSave: false });
  };
  w.postMessage({ type: 'init', save: savedRaw });

  const save = () => {
    const g = get().game;
    if (g) localStorage.setItem(SAVE_KEY, JSON.stringify({ seed: get().seed, state: g }));
  };
  setInterval(save, 60_000);
  document.addEventListener('visibilitychange', () => document.hidden && save());

  return {
    game: null, paused: false, booted: false, hasSave: !!savedRaw, seed,
    dispatch: (name, ...args) => w.postMessage({ type: 'action', name, args }),
    start: (industryId) => w.postMessage({ type: 'start', seed: get().seed, industryId }),
    setPaused: (paused) => { set({ paused }); w.postMessage({ type: 'setPaused', paused }); },
  };
});
