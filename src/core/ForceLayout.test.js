import { describe, it, expect } from 'vitest';
import { ForceLayout } from './ForceLayout.js';

/** 小型测试图：三角 + 一个悬挂节点。 */
function makeLayout(overrides = {}) {
  const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const links = [
    { source: 'a', target: 'b' },
    { source: 'b', target: 'c' },
    { source: 'c', target: 'a' }
  ];
  return new ForceLayout({ nodes, links, ...overrides });
}

const allFinite = (layout) =>
  layout.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.z));

describe('ForceLayout · 初始化', () => {
  it('节点按 id 建立索引，坐标确定性生成（无随机）', () => {
    const l1 = makeLayout();
    const l2 = makeLayout();
    // 两次构造结果逐分量一致 → 完全可复现
    for (let i = 0; i < l1.nodes.length; i++) {
      expect(l1.nodes[i].x).toBe(l2.nodes[i].x);
      expect(l1.nodes[i].y).toBe(l2.nodes[i].y);
      expect(l1.nodes[i].z).toBe(l2.nodes[i].z);
    }
    expect(l1.indexOf('c')).toBe(2);
    expect(l1.getNode('a').id).toBe('a');
  });

  it('初始种子分布在半径球面附近（黄金角螺旋）', () => {
    const layout = makeLayout({ radius: 4 });
    for (const n of layout.nodes) {
      const r = Math.hypot(n.x, n.y, n.z);
      expect(r).toBeCloseTo(4, 6);
    }
  });

  it('过滤引用不存在节点的边', () => {
    const layout = new ForceLayout({
      nodes: [{ id: 'a' }, { id: 'b' }],
      links: [
        { source: 'a', target: 'b' },
        { source: 'a', target: 'ghost' } // 应被剔除
      ]
    });
    expect(layout.links).toHaveLength(1);
  });
});

describe('ForceLayout · 模拟稳定性', () => {
  it('多步模拟后坐标始终有限，无 NaN/Infinity', () => {
    const layout = makeLayout();
    for (let i = 0; i < 500; i++) layout.step();
    expect(allFinite(layout)).toBe(true);
  });

  it('系统随冷却收敛：动能单调趋于 0', () => {
    const layout = makeLayout();
    layout.warmup(50);
    const eMid = layout.kineticEnergy();
    layout.warmup(400);
    const eEnd = layout.kineticEnergy();
    expect(eEnd).toBeLessThan(eMid);
    expect(eEnd).toBeLessThan(1e-3);
  });

  it('warmup 后相连节点间距趋近 linkDistance（弹簧生效）', () => {
    // 用强弹簧/弱斥力凸显胡克力：平衡间距应贴近理想长度，
    // 验证弹簧定律本身（视觉默认参数下斥力会把间距撑大，属正常物理）。
    const layout = makeLayout({ linkDistance: 2.2, linkStrength: 0.3, repulsion: 0.3 });
    layout.warmup(800);
    const a = layout.getNode('a');
    const b = layout.getNode('b');
    const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    expect(d).toBeGreaterThan(1.6);
    expect(d).toBeLessThan(3.0);
  });

  it('斥力使非相连节点不重合', () => {
    const layout = makeLayout();
    layout.warmup(400);
    for (let i = 0; i < layout.nodes.length; i++) {
      for (let j = i + 1; j < layout.nodes.length; j++) {
        const a = layout.nodes[i];
        const b = layout.nodes[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        expect(d).toBeGreaterThan(0.3);
      }
    }
  });
});

describe('ForceLayout · 交互（pin / setPosition）', () => {
  it('pin 固定的节点在模拟中坐标不变', () => {
    const layout = makeLayout();
    layout.setPosition('a', 1, 2, 3);
    layout.setPinned('a', true);
    const snap = { ...layout.getNode('a') };
    layout.warmup(200);
    const a = layout.getNode('a');
    expect(a.x).toBe(snap.x);
    expect(a.y).toBe(snap.y);
    expect(a.z).toBe(snap.z);
  });

  it('setPosition 立即生效并清零速度', () => {
    const layout = makeLayout();
    layout.setPosition('b', -5, 0, 5);
    const b = layout.getNode('b');
    expect([b.x, b.y, b.z]).toEqual([-5, 0, 5]);
    expect(b.vx).toBe(0);
  });

  it('释放 pin 后节点重新参与布局', () => {
    const layout = makeLayout();
    layout.setPosition('a', 8, 8, 8);
    layout.setPinned('a', true);
    layout.warmup(50);
    layout.setPinned('a', false);
    const before = { ...layout.getNode('a') };
    layout.warmup(100);
    const after = layout.getNode('a');
    // 远离群体的节点被拉回，坐标发生改变
    const moved = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
    expect(moved).toBeGreaterThan(1e-3);
  });
});
