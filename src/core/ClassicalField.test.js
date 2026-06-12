import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ClassicalField } from './ClassicalField.js';

describe('ClassicalField · 物理正确性', () => {
  const half = new THREE.Vector3(1.6, 1.0, 1.0);

  it('粒子数受性能分级上限约束', () => {
    expect(new ClassicalField({ tier: 'high', halfExtents: half }).count).toBe(500);
    expect(new ClassicalField({ tier: 'mid', halfExtents: half }).count).toBe(350);
    expect(new ClassicalField({ tier: 'low', halfExtents: half }).count).toBe(200);
    expect(new ClassicalField({ count: 120, tier: 'high', halfExtents: half }).count).toBe(120);
  });

  it('演化多帧后所有粒子始终在盒内', () => {
    const field = new ClassicalField({ tier: 'mid', halfExtents: half });
    const r = field.radius;
    // 位置存于 Float32Array，钳位边界经 float32 舍入引入 ~1e-7 误差，
    // 故容差取 float32 精度量级；真实穿墙为宏观量级（≥1e-2），仍可捕获。
    const eps = 1e-4;
    for (let step = 0; step < 300; step++) field.update(0.03);
    for (let i = 0; i < field.count; i++) {
      const i3 = i * 3;
      expect(Math.abs(field.pos[i3])).toBeLessThanOrEqual(half.x - r + eps);
      expect(Math.abs(field.pos[i3 + 1])).toBeLessThanOrEqual(half.y - r + eps);
      expect(Math.abs(field.pos[i3 + 2])).toBeLessThanOrEqual(half.z - r + eps);
    }
  });

  it('弹性碰撞：每个粒子速率守恒（动能守恒）', () => {
    const field = new ClassicalField({ tier: 'low', halfExtents: half });
    const speedOf = (i) => {
      const i3 = i * 3;
      return Math.hypot(field.vel[i3], field.vel[i3 + 1], field.vel[i3 + 2]);
    };
    const before = Array.from({ length: field.count }, (_, i) => speedOf(i));
    // 演化足够久，确保多数粒子至少撞墙一次
    for (let step = 0; step < 400; step++) field.update(0.04);
    for (let i = 0; i < field.count; i++) {
      expect(speedOf(i)).toBeCloseTo(before[i], 10);
    }
  });

  it('pickEscapee 返回有效粒子并标记逃逸', () => {
    const field = new ClassicalField({ tier: 'low', halfExtents: half });
    const r = field.pickEscapee();
    expect(r).not.toBeNull();
    expect(r.index).toBeGreaterThanOrEqual(0);
    expect(field._escaped[r.index]).toBe(1);
    expect(r.localPosition).toBeInstanceOf(THREE.Vector3);
  });

  it('逃逸粒子不再参与位置更新', () => {
    const field = new ClassicalField({ tier: 'low', halfExtents: half });
    const { index } = field.pickEscapee();
    const i3 = index * 3;
    const snapshot = [field.pos[i3], field.pos[i3 + 1], field.pos[i3 + 2]];
    for (let step = 0; step < 50; step++) field.update(0.03);
    expect(field.pos[i3]).toBe(snapshot[0]);
    expect(field.pos[i3 + 1]).toBe(snapshot[1]);
    expect(field.pos[i3 + 2]).toBe(snapshot[2]);
  });

  it('dispose 释放几何体与材质不报错', () => {
    const field = new ClassicalField({ tier: 'low', halfExtents: half });
    expect(() => field.dispose()).not.toThrow();
  });
});
