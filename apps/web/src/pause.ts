// apps/web/src/pause.ts — máy trạng thái tạm dừng, tách khỏi store để test được.
//
// Ba nguồn tạm dừng độc lập, worker chỉ chạy khi **cả ba** đều không giữ:
// - `userPaused`  — người chơi tự bấm ⏸ (phải giữ nguyên khi quay lại tab).
// - `modalPaused` — một modal (vd. báo cáo cuối ngày) đang mở.
// - `offlineSummary` — tóm tắt "Chào mừng trở lại" đang chờ bấm Nhận
//   (worker đã tự pause khi gửi tóm tắt; resume lúc này sẽ tua đè lên).

/** Vắng ≥ ngưỡng này thì worker gửi tóm tắt "Chào mừng trở lại"; dưới ngưỡng thì tua âm thầm. */
export const OFFLINE_NOTICE_MS = 60_000;

export interface PauseFlags {
  userPaused: boolean;
  modalPaused: boolean;
  offlineSummary: unknown;
}

/** Worker được phép chạy hay không: không nguồn tạm dừng nào đang giữ. */
export const canRun = (f: PauseFlags): boolean =>
  !f.userPaused && !f.modalPaused && !f.offlineSummary;

export interface VisibleInput extends PauseFlags {
  hasGame: boolean;
  /** Thời gian tab bị ẩn (ms). */
  elapsedMs: number;
  /** Ngưỡng worker gửi tóm tắt offline thay vì tua âm thầm. */
  noticeMs: number;
}

export interface VisibleDecision {
  /** Có gửi `resume` (tua bù) cho worker không. */
  resume: boolean;
  /** Có cho worker chạy tiếp (bỏ tạm dừng) không. */
  unpause: boolean;
}

/**
 * Quyết định khi tab hiện lại.
 * - Chưa có game (vd. đang ở màn chọn ngành) → không làm gì.
 * - Có tóm tắt offline đang chờ → không tua nữa (worker là nguồn sự thật).
 * - Người chơi tự dừng → vẫn **không** tua và **không** tự chạy lại: sếp đã bấm ⏸.
 * - Vắng ≥ `noticeMs` → tua, nhưng worker sẽ gửi tóm tắt và tự dừng chờ bấm Nhận.
 */
export function onVisible(i: VisibleInput): VisibleDecision {
  if (!i.hasGame) return { resume: false, unpause: false };
  if (i.offlineSummary) return { resume: false, unpause: false };
  if (i.userPaused) return { resume: false, unpause: false };
  return { resume: true, unpause: i.elapsedMs < i.noticeMs && canRun(i) };
}
