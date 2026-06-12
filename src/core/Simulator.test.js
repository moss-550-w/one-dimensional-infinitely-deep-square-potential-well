import { describe, it, expect } from 'vitest';
import { StateBus } from './StateBus.js';
import { Simulator, STAGE } from './Simulator.js';

describe('Simulator · 状态机', () => {
  it('构造默认进入阶段0并装载经典粒子场', () => {
    const bus = new StateBus();
    const sim = new Simulator({ bus });
    expect(sim.currentStage).toBe(STAGE.CLASSICAL_CHAOS);
    expect(sim.field).not.toBeNull();
    expect(sim.field.mesh.name).toBe('classical-field');
    sim.dispose();
  });

  it('从 StateBus 恢复已有阶段进度', () => {
    const bus = new StateBus();
    bus.setState({ currentStage: STAGE.MODE_DECOMPOSITION, unlockedModules: ['fourier'] });
    const sim = new Simulator({ bus });
    expect(sim.currentStage).toBe(STAGE.MODE_DECOMPOSITION);
    expect(sim.unlockedModules).toContain('fourier');
    sim.dispose();
  });

  it('setStage 切换阶段并同步到 StateBus', () => {
    const bus = new StateBus();
    const sim = new Simulator({ bus });
    sim.setStage(STAGE.MODE_DECOMPOSITION);
    expect(sim.currentStage).toBe(STAGE.MODE_DECOMPOSITION);
    expect(bus.getState().currentStage).toBe(STAGE.MODE_DECOMPOSITION);
    // 阶段0粒子场应已卸载，换装为阶段1模式分解模块
    expect(sim.field).not.toBeNull();
    expect(sim.field.object3d.name).toBe('mode-decomposition');
    sim.dispose();
  });

  it('阶段1模式分解模块可演化与展开而不报错', () => {
    const bus = new StateBus();
    const sim = new Simulator({ bus });
    sim.setStage(STAGE.MODE_DECOMPOSITION);
    expect(() => {
      sim.update(0.016);
      sim.field.setExploded(true);
      sim.update(0.016);
    }).not.toThrow();
    sim.dispose();
  });

  it('阶段2装载几何投影并隐藏盒子', () => {
    const bus = new StateBus();
    const sim = new Simulator({ bus });
    sim.setStage(STAGE.GEOMETRIC_PROJECTION);
    expect(sim.field.object3d.name).toBe('hilbert-projection-field');
    expect(sim.wellMesh.visible).toBe(false);
    expect(sim.wellEdges.visible).toBe(false);
    // 投影可拖拽并联动波形而不报错
    expect(() => {
      sim.field.projection.setCoefficients([0.3, 0.4, 0.5]);
    }).not.toThrow();
    // 系数严格归一化（单位球面约束）
    const c = sim.field.projection.getCoefficients();
    expect(Math.hypot(c[0], c[1], c[2])).toBeCloseTo(1, 10);
    sim.dispose();
  });

  it('从阶段2切回非投影阶段时盒子恢复可见', () => {
    const bus = new StateBus();
    const sim = new Simulator({ bus });
    sim.setStage(STAGE.GEOMETRIC_PROJECTION);
    sim.setStage(STAGE.MODE_DECOMPOSITION);
    expect(sim.wellMesh.visible).toBe(true);
    sim.dispose();
  });

  it('阶段3装载量子公理场，盒子可见', () => {
    const bus = new StateBus();
    const sim = new Simulator({ bus });
    sim.setStage(STAGE.QUANTUM_AXIOM);
    expect(sim.field.object3d.name).toBe('quantum-axiom-field');
    // 阶段3回到盒中观察波函数，盒子重新可见
    expect(sim.wellMesh.visible).toBe(true);
    sim.dispose();
  });

  it('阶段3可演化、制备、坍缩、重置而不报错', () => {
    const bus = new StateBus();
    const sim = new Simulator({ bus });
    sim.setStage(STAGE.QUANTUM_AXIOM);
    const field = sim.field;
    expect(() => {
      sim.update(0.016);
      field.prepare([0.5, 0.5, 0.7]);
      sim.update(0.016);
      field.collapse(1);
      sim.update(0.016);
      field.reset();
    }).not.toThrow();
    sim.dispose();
  });

  it('阶段3制备态系数严格归一化（单位球面约束）', () => {
    const bus = new StateBus();
    const sim = new Simulator({ bus });
    sim.setStage(STAGE.QUANTUM_AXIOM);
    sim.field.prepare([0.3, 0.4, 0.5]);
    const c = sim.field.getCoefficients();
    expect(Math.hypot(c[0], c[1], c[2])).toBeCloseTo(1, 10);
    sim.dispose();
  });

  it('阶段3坍缩为纯本征态（不可逆，单分量为 1）', () => {
    const bus = new StateBus();
    const sim = new Simulator({ bus });
    sim.setStage(STAGE.QUANTUM_AXIOM);
    sim.field.prepare([0.5, 0.5, 0.7]);
    sim.field.collapse(2);
    const c = sim.field.getCoefficients();
    expect(c[2]).toBeCloseTo(1, 10);
    expect(c[0]).toBeCloseTo(0, 10);
    expect(c[1]).toBeCloseTo(0, 10);
    expect(sim.field.collapsed).toBe(true);
    sim.dispose();
  });

  it('setStage 到当前阶段为幂等空操作', () => {
    const bus = new StateBus();
    const sim = new Simulator({ bus });
    const fieldRef = sim.field;
    sim.setStage(STAGE.CLASSICAL_CHAOS);
    expect(sim.field).toBe(fieldRef); // 未重建
    sim.dispose();
  });

  it('unlock 记录模块并同步、去重', () => {
    const bus = new StateBus();
    const sim = new Simulator({ bus });
    sim.unlock('fourier');
    sim.unlock('fourier');
    expect(sim.unlockedModules).toEqual(['fourier']);
    expect(bus.getState().unlockedModules).toEqual(['fourier']);
    sim.dispose();
  });

  it('dispose 幂等且不报错', () => {
    const bus = new StateBus();
    const sim = new Simulator({ bus });
    expect(() => {
      sim.dispose();
      sim.dispose();
    }).not.toThrow();
  });
});
