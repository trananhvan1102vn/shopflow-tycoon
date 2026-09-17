import { describe, it, expect } from 'vitest';
import { canRun, onVisible, OFFLINE_NOTICE_MS, type PauseFlags, type VisibleInput } from './pause';

const flags = (f: Partial<PauseFlags> = {}): PauseFlags => ({
  userPaused: false, modalPaused: false, offlineSummary: null, ...f,
});
const visible = (f: Partial<VisibleInput> = {}) =>
  onVisible({ ...flags(), hasGame: true, elapsedMs: 5_000, noticeMs: OFFLINE_NOTICE_MS, ...f });

describe('canRun', () => {
  it('chỉ chạy khi không cờ nào giữ', () => {
    expect(canRun(flags())).toBe(true);
    expect(canRun(flags({ userPaused: true }))).toBe(false);
    expect(canRun(flags({ modalPaused: true }))).toBe(false);
    expect(canRun(flags({ offlineSummary: { ticks: 10 } }))).toBe(false);
  });
});

describe('onVisible', () => {
  it('người chơi tự dừng rồi ẩn/hiện tab: không tua, không tự chạy lại', () => {
    expect(visible({ userPaused: true })).toEqual({ resume: false, unpause: false });
    // kể cả khi vắng lâu
    expect(visible({ userPaused: true, elapsedMs: 10 * 60_000 })).toEqual({ resume: false, unpause: false });
  });
  it('modal đang mở, ẩn/hiện ngắn: tua bù nhưng vẫn giữ tạm dừng', () => {
    expect(visible({ modalPaused: true })).toEqual({ resume: true, unpause: false });
  });
  it('tóm tắt offline đang chờ bấm Nhận: không tua, không tự chạy lại', () => {
    expect(visible({ offlineSummary: { ticks: 120 } })).toEqual({ resume: false, unpause: false });
  });
  it('vắng ngắn bình thường: tua và chạy lại', () => {
    expect(visible({ elapsedMs: 0 })).toEqual({ resume: true, unpause: true });
    expect(visible({ elapsedMs: OFFLINE_NOTICE_MS - 1 })).toEqual({ resume: true, unpause: true });
  });
  it('vắng lâu: tua, nhưng chờ worker gửi tóm tắt nên không tự chạy lại', () => {
    expect(visible({ elapsedMs: OFFLINE_NOTICE_MS })).toEqual({ resume: true, unpause: false });
    expect(visible({ elapsedMs: 8 * 60 * 60_000 })).toEqual({ resume: true, unpause: false });
  });
  it('chưa có game (màn chọn ngành): không làm gì', () => {
    expect(visible({ hasGame: false })).toEqual({ resume: false, unpause: false });
    expect(visible({ hasGame: false, elapsedMs: 10 * 60_000 })).toEqual({ resume: false, unpause: false });
  });
});
