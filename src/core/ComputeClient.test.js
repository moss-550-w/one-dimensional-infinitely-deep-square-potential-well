import { describe, it, expect } from 'vitest';
import { ComputeClient } from './ComputeClient.js';

// node 单测环境无 Worker 全局 → 自动同步降级，覆盖回退路径。

describe('ComputeClient · 同步降级路径', () => {
  it('node 环境（无 Worker）自动进入 sync 模式', () => {
    const client = new ComputeClient();
    expect(client.mode).toBe('sync');
    client.dispose();
  });

  it('forceSync 强制同步', () => {
    const client = new ComputeClient({ forceSync: true });
    expect(client.mode).toBe('sync');
    client.dispose();
  });

  it('run 调用纯内核并返回正确结果', async () => {
    const client = new ComputeClient({ forceSync: true });
    const r = await client.run('momentumSpectrum', { sigma: 0.06, momentumSamples: 60 });
    expect(r.momentumDensity).toBeInstanceOf(Float64Array);
    expect(r.dx).toBeGreaterThan(0);
    expect(r.dp).toBeGreaterThan(0);
    client.dispose();
  });

  it('未知 kernel 以 reject 结算', async () => {
    const client = new ComputeClient({ forceSync: true });
    await expect(client.run('nope', {})).rejects.toThrow(/未知 kernel/);
    client.dispose();
  });

  it('内核内部抛错经 Promise reject 透出', async () => {
    const client = new ComputeClient({ forceSync: true });
    await expect(client.run('momentumSpectrum', { sigma: -1 })).rejects.toThrow(RangeError);
    client.dispose();
  });

  it('dispose 幂等且不报错', () => {
    const client = new ComputeClient({ forceSync: true });
    expect(() => {
      client.dispose();
      client.dispose();
    }).not.toThrow();
  });

  it('反复构建/销毁无异常（生命周期审计）', () => {
    expect(() => {
      for (let i = 0; i < 50; i++) {
        const c = new ComputeClient({ forceSync: true });
        c.dispose();
      }
    }).not.toThrow();
  });
});
