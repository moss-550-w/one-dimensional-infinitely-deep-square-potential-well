import { describe, it, expect } from 'vitest';
import { PerfMonitor, TIERS } from './PerfMonitor.js';

/** 连续喂 n 帧、每帧间隔 dt 秒。 */
function feed(monitor, n, dt) {
  let downgrades = 0;
  for (let i = 0; i < n; i++) if (monitor.sample(dt)) downgrades++;
  return downgrades;
}

describe('PerfMonitor · 帧率统计', () => {
  it('稳定 60fps 时平均 FPS≈60', () => {
    const m = new PerfMonitor();
    feed(m, 60, 1 / 60);
    expect(m.fps).toBeCloseTo(60, 0);
  });

  it('样本不足时 fps 为 null', () => {
    const m = new PerfMonitor();
    expect(m.fps).toBeNull();
  });
});

describe('PerfMonitor · 自动降级', () => {
  it('持续高帧不降级', () => {
    const m = new PerfMonitor({ tier: 'high' });
    const d = feed(m, 600, 1 / 60);
    expect(d).toBe(0);
    expect(m.tier).toBe('high');
  });

  it('持续低帧触发 high→mid 降级并回调', () => {
    const events = [];
    const m = new PerfMonitor({ onDowngrade: (t, fps) => events.push({ t, fps }) });
    // ~12fps，远低于阈值；喂 150 帧 ≈ 一个判定周期（预热60 + 持续2.5s≈30帧），触发一次降级
    feed(m, 150, 1 / 12);
    expect(m.tier).toBe('mid');
    expect(events).toHaveLength(1);
    expect(events[0].t).toBe('mid');
    expect(events[0].fps).toBeLessThan(32);
  });

  it('分级逐级递进 high→mid→low，不跨级', () => {
    const seq = [];
    const m = new PerfMonitor({ onDowngrade: (t) => seq.push(t) });
    feed(m, 2000, 1 / 10);
    expect(seq).toEqual(['mid', 'low']);
    expect(m.tier).toBe('low');
    expect(m.atFloor).toBe(true);
  });

  it('到达 low 后不再降级（地板）', () => {
    const m = new PerfMonitor({ tier: 'low' });
    const d = feed(m, 1000, 1 / 5);
    expect(d).toBe(0);
    expect(m.tier).toBe('low');
  });

  it('瞬时尖刺（短暂卡顿后恢复）不误降级', () => {
    const m = new PerfMonitor();
    feed(m, 120, 1 / 60); // 正常
    feed(m, 20, 1 / 8); // 短暂卡顿 ~0.33s，小于 holdSeconds=2.5
    feed(m, 120, 1 / 60); // 恢复
    expect(m.tier).toBe('high');
  });

  it('降级后重新预热，避免一次连环降两级', () => {
    const seq = [];
    const m = new PerfMonitor({ onDowngrade: (t) => seq.push(t), holdSeconds: 2.5, warmupFrames: 45 });
    // 恰好触发一次降级所需：预热45 + 窗口60 + 持续2.5s@~12fps(约30帧)
    feed(m, 135, 1 / 12);
    // 第一次降级后 _frames 归零，需再次预热，单批不应连降两级
    expect(seq.length).toBeLessThanOrEqual(1);
  });

  it('TIERS 顺序为 high→mid→low', () => {
    expect(TIERS).toEqual(['high', 'mid', 'low']);
  });
});
