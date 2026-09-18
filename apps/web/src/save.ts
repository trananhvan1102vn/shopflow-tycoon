/** Định dạng save có version — bump khi shape của GameState đổi (save cũ bị bỏ, chơi mới). */
export const SAVE_VERSION = 3;

export interface SaveBlob {
  seed: number;
  version: number;
  savedAt?: number;
  state: any;
}

/**
 * Parse + kiểm tra một blob save thô. Trả về null nếu hỏng / sai version / sai shape,
 * để cả store lẫn worker cùng rơi về "chơi mới" thay vì crash hoặc NaN-brick.
 */
export function validateSave(raw: string | null): { seed: number; state: any; savedAt: number | null } | null {
  if (!raw) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.version !== SAVE_VERSION) return null;
  if (typeof parsed.seed !== 'number' || !Number.isFinite(parsed.seed)) return null;
  const state = parsed.state;
  if (!state || typeof state !== 'object') return null;
  if (typeof state.money !== 'number') return null;
  if (typeof state.packAccum !== 'number') return null;
  if (!Array.isArray(state.orders)) return null;
  if (!state.tutorial || typeof state.tutorial.step !== 'number') return null;
  if (!Array.isArray(state.questsDone)) return null;
  if (!Array.isArray(state.activeRandomEvents)) return null;
  const savedAt = typeof parsed.savedAt === 'number' && Number.isFinite(parsed.savedAt) ? parsed.savedAt : null;
  return { seed: parsed.seed, state, savedAt };
}
