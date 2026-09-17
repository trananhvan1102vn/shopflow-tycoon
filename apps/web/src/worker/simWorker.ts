import { createGame, tick, makeRng, fastForward, type GameState, type Rng, type PurchaseOpts } from '@shopflow/sim';
import * as A from '@shopflow/sim';
import { validateSave } from '../save';

const OFFLINE_NOTICE_MS = 60_000; // dưới 1 phút: tua âm thầm, không hiện "Chào mừng trở lại"

let state: GameState | null = null;
let rng: Rng | null = null;
let paused = false;
let speed: 1 | 2 = 1;
let timer: ReturnType<typeof setInterval> | null = null;

const post = (extra: Record<string, unknown> = {}) => state && (self as any).postMessage({ type: 'state', state, ...extra });

function startLoop() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    if (paused || !state || !rng) return;
    for (let i = 0; i < speed; i++) state = tick(state, 4, rng);
    post();
  }, 1000);
}

/** Tua bù thời gian vắng mặt; ≥ 1 phút thì kèm tóm tắt và tự tạm dừng chờ người chơi bấm Nhận. */
function resume(elapsedMs: number) {
  if (!state || !rng) return;
  const ticks = Math.floor(Math.max(0, elapsedMs) / 1000);
  if (ticks <= 0) { post(); return; }
  const r = fastForward(state, ticks, rng);
  state = r.state;
  if (elapsedMs >= OFFLINE_NOTICE_MS) { paused = true; post({ offline: r.summary }); }
  else post();
}

const ACTIONS: Record<string, (...a: any[]) => GameState> = {
  buyRetail: (...a) => A.buyRetail(state!, ...(a as [string, number, PurchaseOpts])),
  buyBundle: (...a) => A.buyBundle(state!, ...(a as [string, string, PurchaseOpts])),
  placeEquipment: (...a) => A.placeEquipment(state!, ...(a as [number, 'shelf' | 'packer' | 'robot'])),
  upgradeEquipment: (...a) => A.upgradeEquipment(state!, ...(a as [number])),
  removeEquipment: (...a) => A.removeEquipment(state!, ...(a as [number])),
  expandGrid: () => A.expandGrid(state!),
  openChannel: (...a) => A.openChannel(state!, ...(a as [string])),
  upgradeChannel: (...a) => A.upgradeChannel(state!, ...(a as [string])),
  setChannelOpen: (...a) => A.setChannelOpen(state!, ...(a as [string, boolean])),
  buySeo: (...a) => A.buySeo(state!, ...(a as [string])),
  buyUpgrade: (...a) => A.buyUpgrade(state!, ...(a as [string])),
  chooseIndustry: (...a) => A.chooseIndustry(state!, ...(a as [string])),
  advanceStage: () => A.advanceStage(state!),
  expediteDelivery: (...a) => A.expediteDelivery(state!, ...(a as [string])),
  tutorialAdvance: () => A.tutorialAdvance(state!),
  tutorialSkip: () => A.tutorialSkip(state!),
  tutorialClaim: () => A.tutorialClaim(state!),
  tutorialReset: () => A.tutorialReset(state!),
};

self.onmessage = (ev: MessageEvent) => {
  const msg = ev.data;
  if (msg.type === 'init') {
    const valid = validateSave(msg.save ?? null);
    if (valid) {
      state = valid.state;
      rng = makeRng(valid.seed + (valid.state.completedOrders ?? 0));
      startLoop();
      resume(msg.elapsedMs ?? 0);
      return;
    }
    if (msg.save) console.warn('[simWorker] save không hợp lệ (hỏng hoặc sai version) → chơi mới');
    (self as any).postMessage({ type: 'nosave' });
    return;
  }
  if (msg.type === 'start') {
    state = createGame(msg.seed, msg.industryId);
    rng = makeRng(msg.seed);
    paused = false; speed = 1;
    startLoop(); post();
  }
  if (msg.type === 'setPaused') paused = msg.paused;
  if (msg.type === 'setSpeed') speed = msg.speed === 2 ? 2 : 1;
  if (msg.type === 'resume') resume(msg.elapsedMs ?? 0);
  if (msg.type === 'action') {
    if (!ACTIONS[msg.name]) { console.warn('[simWorker] action không tồn tại:', msg.name); return; }
    if (!state) return;
    state = ACTIONS[msg.name](...(msg.args ?? []));
    post();
  }
};
