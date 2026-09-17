import { create } from 'zustand';
import type { GameState, OfflineSummary } from '@shopflow/sim';
import { SAVE_VERSION, validateSave } from './save';
import type { Tab } from './components/TabBar';

const SAVE_KEY = 'shopflow-save';

interface GameStore {
  game: GameState | null;
  paused: boolean;        // trạng thái worker thực tế (người chơi bấm, hoặc tự dừng khi ẩn tab / chờ Nhận)
  userPaused: boolean;    // người chơi tự bấm ⏸ — không tự chạy lại khi quay về tab
  modalPaused: boolean;   // một modal (vd. báo cáo cuối ngày) đang mở — không tự chạy lại khi quay về tab
  speed: 1 | 2;
  booted: boolean;
  hasSave: boolean;
  seed: number;
  offlineSummary: OfflineSummary | null;
  supplierId: string; grade: 'A' | 'B' | 'C';
  visited: Tab[];
  dispatch: (name: string, ...args: unknown[]) => void;
  start: (industryId: string) => void;
  setPaused: (p: boolean) => void;
  setModalPaused: (p: boolean) => void;
  setSpeed: (n: 1 | 2) => void;
  dismissOffline: () => void;
  setSupplier: (id: string) => void; setGrade: (g: 'A' | 'B' | 'C') => void;
  markVisited: (t: Tab) => void;
  newGame: () => void;
}

export const useGame = create<GameStore>((set, get) => {
  const w = new Worker(new URL('./worker/simWorker.ts', import.meta.url), { type: 'module' });
  const savedRaw = localStorage.getItem(SAVE_KEY);
  const saved = validateSave(savedRaw);
  // UI shell code: performance.now() only seeds the UI; the sim only ever sees the numeric seed.
  const seed = saved?.seed ?? (Math.floor(performance.now() * 1000) % 2 ** 31 || 1);
  const elapsedMs = saved?.savedAt ? Math.max(0, Date.now() - saved.savedAt) : 0;

  w.onmessage = (ev) => {
    if (ev.data.type === 'state') {
      const offline: OfflineSummary | undefined = ev.data.offline;
      set({ game: ev.data.state, booted: true, hasSave: true,
        ...(offline ? { offlineSummary: offline, paused: true } : {}) });
    }
    if (ev.data.type === 'nosave') set({ booted: true, hasSave: false });
  };
  w.postMessage({ type: 'init', save: savedRaw, elapsedMs });

  // `newGame` xoá save rồi reload trang, nhưng `pagehide`/`visibilitychange`
  // (đăng ký bên dưới, vẫn cần chạy cho autosave-khi-ẩn-tab bình thường) sẽ
  // bắn ra đúng lúc unload với `game` vẫn còn — nếu không có cờ này, `save()`
  // của chúng sẽ ghi lại save vừa xoá trước khi trang kịp reload.
  let resetting = false;

  const save = () => {
    if (resetting) return;
    const g = get().game;
    if (g) localStorage.setItem(SAVE_KEY, JSON.stringify({ seed: get().seed, version: SAVE_VERSION, savedAt: Date.now(), state: g }));
  };
  const saveTimer = setInterval(save, 60_000);

  const pauseWorker = (paused: boolean) => { set({ paused }); w.postMessage({ type: 'setPaused', paused }); };
  let hiddenAt: number | null = null;
  document.addEventListener('visibilitychange', () => {
    if (resetting) return;
    if (document.hidden) {
      save();
      hiddenAt = Date.now();
      // Chưa có game (vd. đang ở màn chọn ngành) → không có gì để tạm dừng;
      // tránh việc worker bị kẹt paused=true khi `start` chạy sau khi quay lại.
      if (get().game) pauseWorker(true);
      return;
    }
    const elapsed = hiddenAt ? Date.now() - hiddenAt : 0; hiddenAt = null;
    if (!get().game) return;
    // Đã có tóm tắt offline đang chờ người chơi bấm Nhận → nó vẫn là nguồn sự thật
    // (worker đã tự pause khi gửi tóm tắt); không gửi resume nữa kẻo tua đè lên.
    if (get().offlineSummary) return;
    w.postMessage({ type: 'resume', elapsedMs: elapsed });
    // Dưới 1 phút worker không gửi tóm tắt → tự chạy lại, trừ khi người chơi tự dừng
    // hoặc một modal (vd. báo cáo cuối ngày) đang mở.
    if (elapsed < 60_000 && !get().userPaused && !get().modalPaused) pauseWorker(false);
  });
  window.addEventListener('pagehide', save);

  return {
    game: null, paused: false, userPaused: false, modalPaused: false, speed: 1, booted: false, hasSave: saved !== null, seed,
    offlineSummary: null, supplierId: 'local', grade: 'B', visited: [],
    dispatch: (name, ...args) => w.postMessage({ type: 'action', name, args }),
    start: (industryId) => w.postMessage({ type: 'start', seed: get().seed, industryId }),
    setPaused: (paused) => { set({ userPaused: paused }); pauseWorker(paused); },
    setModalPaused: (paused) => { set({ modalPaused: paused }); pauseWorker(paused); },
    setSpeed: (speed) => { set({ speed }); w.postMessage({ type: 'setSpeed', speed }); },
    dismissOffline: () => {
      set({ offlineSummary: null });
      if (!get().userPaused && !get().modalPaused) pauseWorker(false);
    },
    setSupplier: (supplierId) => set({ supplierId }),
    setGrade: (grade) => set({ grade }),
    markVisited: (t) => { if (!get().visited.includes(t)) set({ visited: [...get().visited, t] }); },
    newGame: () => {
      resetting = true;
      clearInterval(saveTimer);
      set({ game: null });
      localStorage.removeItem(SAVE_KEY);
      w.terminate();
      location.reload();
    },
  };
});
