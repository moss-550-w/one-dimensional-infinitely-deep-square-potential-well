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
    // 阶段0粒子场应已被卸载
    expect(sim.field).toBeNull();
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
