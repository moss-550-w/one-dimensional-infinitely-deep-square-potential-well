import * as THREE from 'three';
import { eigenFunction } from './QuantumMath.js';

/**
 * ModeDecompositionField — 核心模拟器阶段1「模式分解」可视化（Claude.md 5.2 阶段1）。
 *
 * 用户从第二章带回「傅里叶/模式分解」能力后，盒中不再是混沌粒子，而是一条
 * 随时间变化的波动曲线。它可被分解为若干简单、稳定的驻波本征态（design.md 阶段1：
 * 「混沌是秩序的叠加」）。
 *
 * 物理表示：实数驻波叠加 ψ(x,t) = Σ cₙ ψₙ(x)·cos(ωₙ t)。
 *   - ψₙ(x) 为无限深势阱本征函数（QuantumMath.eigenFunction，已单测归一化/正交）。
 *   - 这是定态的实数时间演化；完整的复相位 exp(−iEₙt/ħ) 形式在阶段3（第四章）引入。
 *   - 简化标注：ωₙ 为可视化缩放频率（∝n²，对应 Eₙ∝n²），非真实 ħ 单位下数值，
 *     仅为让高能态在画面中振荡更快、呈现"多频叠加"的直观（Claude.md 九·5）。
 */

const COMP_COLORS = [0x3b82f6, 0x8b5cf6, 0x22d3ee, 0xf59e0b, 0xec4899, 0x10b981];

export class ModeDecompositionField {
  /**
   * @param {object} opts
   * @param {THREE.Vector3} opts.halfExtents 盒子半边长
   * @param {number[]} [opts.coeffs] 各本征态展开系数（自动归一化）
   * @param {number} [opts.pointCount=180] 曲线采样点数
   */
  constructor({ halfExtents, coeffs = [0.65, 0.4, 0.5, 0.25, 0.32], pointCount = 180 }) {
    this.half = halfExtents.clone();
    this.L = 1; // 本征函数定义域 [0,L]，与 QuantumMath 默认一致
    this.coeffs = normalize(coeffs);
    this.pointCount = pointCount;
    this.yScale = this.half.y * 0.5;
    this.exploded = false;
    this._t = 0;

    this.group = new THREE.Group();
    this.group.name = 'mode-decomposition';

    this.mainLine = this._makeLine(0xffffff, 1);
    this.group.add(this.mainLine);

    this.componentLines = this.coeffs.map((_, i) => {
      const line = this._makeLine(COMP_COLORS[i % COMP_COLORS.length], 1);
      line.visible = false;
      this.group.add(line);
      return line;
    });

    this._writeGeometry();
  }

  _makeLine(color, opacity) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(this.pointCount * 3), 3)
    );
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    return new THREE.Line(geom, mat);
  }

  /** x∈[0,L] → 盒内 x 坐标 [-half.x, +half.x]。 */
  _boxX(x) {
    return (x / this.L) * 2 * this.half.x - this.half.x;
  }

  /** 可视化缩放角频率：∝n²（对应 Eₙ∝n²），非真实 ħ 单位。 */
  _omega(n) {
    return 0.6 * n * n;
  }

  /** 按当前时间重算主曲线与各分量曲线顶点。 */
  _writeGeometry() {
    const n = this.pointCount;
    const main = this.mainLine.geometry.attributes.position.array;
    const half = (this.coeffs.length - 1) / 2;

    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * this.L;
      const bx = this._boxX(x);
      let sum = 0;
      for (let k = 0; k < this.coeffs.length; k++) {
        const mode = k + 1;
        const val = this.coeffs[k] * eigenFunction(mode, x) * Math.cos(this._omega(mode) * this._t);
        sum += val;
        const comp = this.componentLines[k].geometry.attributes.position.array;
        const zOff = this.exploded ? (k - half) * (this.half.z * 0.5) : 0;
        comp[i * 3] = bx;
        comp[i * 3 + 1] = val * this.yScale;
        comp[i * 3 + 2] = zOff;
      }
      main[i * 3] = bx;
      main[i * 3 + 1] = sum * this.yScale;
      main[i * 3 + 2] = 0;
    }

    this.mainLine.geometry.attributes.position.needsUpdate = true;
    this.mainLine.geometry.computeBoundingSphere();
    for (const c of this.componentLines) {
      c.geometry.attributes.position.needsUpdate = true;
      c.geometry.computeBoundingSphere();
    }
  }

  /** 展开/合并分量：展开时各本征态沿深度排开，主曲线淡化以示"成分"。 */
  setExploded(flag) {
    this.exploded = flag;
    for (const c of this.componentLines) c.visible = flag;
    this.mainLine.material.opacity = flag ? 0.35 : 1;
    this._writeGeometry();
  }

  update(dt) {
    this._t += dt;
    this._writeGeometry();
  }

  get object3d() {
    return this.group;
  }

  dispose() {
    this.mainLine.geometry.dispose();
    this.mainLine.material.dispose();
    for (const c of this.componentLines) {
      c.geometry.dispose();
      c.material.dispose();
    }
  }
}

/** L2 归一化系数向量（Σ|cₙ|²=1）。 */
function normalize(c) {
  const s = Math.sqrt(c.reduce((a, v) => a + v * v, 0)) || 1;
  return c.map((v) => v / s);
}
