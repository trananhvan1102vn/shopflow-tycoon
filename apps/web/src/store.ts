import { create } from 'zustand';
import type { GameState, OfflineSummary } from '@shopflow/sim';
import { SAVE_VERSION, validateSave } from './save';
import { canRun, onVisible, OFFLINE_NOTICE_MS } from './pause';
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
  saveInvalid: boolean;   // có bản lưu nhưng hỏng / sai version → đã bỏ, chơi lại từ đầu
  seed: number;
  offlineSummary: OfflineSummary | null;
  supplierId: string; grade: 'A' | 'B' | 'C';
  visited: Tab[];
  dispatch: (name: string, ...args: unknown[]) => void;
  start: (industryId: string) => void;
  skipDay: () => void;
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
    if (ev.data.type === 'nosave') set({ booted: true, hasSave: false, saveInvalid: ev.data.reason === 'invalid' });
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
  /** Đồng bộ worker với ba cờ tạm dừng: chỉ chạy khi không cờ nào đang giữ (xem pause.ts). */
  const syncWorker = () => pauseWorker(!canRun(get()));
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
    const d = onVisible({ ...get(), hasGame: get().game !== null, elapsedMs: elapsed, noticeMs: OFFLINE_NOTICE_MS });
    if (d.resume) w.postMessage({ type: 'resume', elapsedMs: elapsed });
    if (d.unpause) pauseWorker(false);
  });
  window.addEventListener('pagehide', save);

  return {
    game: null, paused: false, userPaused: false, modalPaused: false, speed: 1, booted: false,
    hasSave: saved !== null, saveInvalid: false, seed,
    offlineSummary: null, supplierId: 'local', grade: 'B', visited: [],
    dispatch: (name, ...args) => w.postMessage({ type: 'action', name, args }),
    start: (industryId) => w.postMessage({ type: 'start', seed: get().seed, industryId }),
    skipDay: () => w.postMessage({ type: 'skipDay' }),
    setPaused: (paused) => { set({ userPaused: paused }); syncWorker(); },
    setModalPaused: (paused) => { set({ modalPaused: paused }); syncWorker(); },
    setSpeed: (speed) => { set({ speed }); w.postMessage({ type: 'setSpeed', speed }); },
    dismissOffline: () => { set({ offlineSummary: null }); syncWorker(); },
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
