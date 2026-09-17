import { createGame, tick, makeRng, type GameState, type Rng } from '@shopflow/sim';
import * as A from '@shopflow/sim';
import { validateSave } from '../save';

let state: GameState | null = null;
let rng: Rng | null = null;
let paused = false;
let timer: ReturnType<typeof setInterval> | null = null;

const post = () => state && (self as any).postMessage({ type: 'state', state });

function startLoop() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    if (paused || !state || !rng) return;
    state = tick(state, 4, rng);
    post();
  }, 1000);
}

const ACTIONS: Record<string, (...a: any[]) => GameState> = {
  buyRetail: (...a) => A.buyRetail(state!, ...(a as [string, number, A.PurchaseOpts])),
  buyBundle: (...a) => A.buyBundle(state!, ...(a as [string, string, A.PurchaseOpts])),
  placeEquipment: (...a) => A.placeEquipment(state!, ...(a as [number, 'shelf' | 'packer' | 'robot'])),
  upgradeEquipment: (...a) => A.upgradeEquipment(state!, ...(a as [number])),
  removeEquipment: (...a) => A.removeEquipment(state!, ...(a as [number])),
  expandGrid: () => A.expandGrid(state!),
  openChannel: (...a) => A.openChannel(state!, ...(a as [string])),
  upgradeChannel: (...a) => A.upgradeChannel(state!, ...(a as [string])),
  setChannelOpen: (...a) => A.setChannelOpen(state!, ...(a as [string, boolean])),
  buySeo: (...a) => A.buySeo(state!, ...(a as [string])),
  chooseIndustry: (...a) => A.chooseIndustry(state!, ...(a as [string])),
  advanceStage: () => A.advanceStage(state!),
  expediteDelivery: (...a) => A.expediteDelivery(state!, ...(a as [string])),
};

self.onmessage = (ev: MessageEvent) => {
  const msg = ev.data;
  if (msg.type === 'init') {
    const valid = validateSave(msg.save ?? null);
    if (valid) {
      // Resume re-derives the rng from seed + completedOrders — an approximate
      // replay position, acceptable for M1.
      state = valid.state;
      rng = makeRng(valid.seed + (valid.state.completedOrders ?? 0));
      startLoop(); post(); return;
    }
    if (msg.save) console.warn('[simWorker] save không hợp lệ (hỏng hoặc sai version) → chơi mới');
    (self as any).postMessage({ type: 'nosave' });
    return;
  }
  if (msg.type === 'start') {
    state = createGame(msg.seed, msg.industryId);
    rng = makeRng(msg.seed);
    startLoop(); post();
  }
  if (msg.type === 'setPaused') { paused = msg.paused; }
  if (msg.type === 'action') {
    if (!ACTIONS[msg.name]) { console.warn('[simWorker] action không tồn tại:', msg.name); return; }
    if (!state) return;
    state = ACTIONS[msg.name](...(msg.args ?? []));
    post();
  }
};
