import { createGame, tick, makeRng, type GameState, type Rng } from '@shopflow/sim';
import * as A from '@shopflow/sim';

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
  buyRetail: (...a) => A.buyRetail(state!, ...(a as [string, number, string])),
  buyBundle: (...a) => A.buyBundle(state!, ...(a as [string, string, string, string?])),
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
    if (msg.save) {
      try {
        const { seed, state: saved } = JSON.parse(msg.save);
        // Resume re-derives the rng from seed + completedOrders — an approximate
        // replay position, acceptable for M1.
        state = saved; rng = makeRng(seed + (saved.completedOrders ?? 0));
        startLoop(); post(); return;
      } catch { /* save hỏng → chơi mới */ }
    }
    (self as any).postMessage({ type: 'nosave' });
  }
  if (msg.type === 'start') {
    state = createGame(msg.seed, msg.industryId);
    rng = makeRng(msg.seed);
    startLoop(); post();
  }
  if (msg.type === 'setPaused') { paused = msg.paused; }
  if (msg.type === 'action' && state && ACTIONS[msg.name]) {
    state = ACTIONS[msg.name](...(msg.args ?? []));
    post();
  }
};
