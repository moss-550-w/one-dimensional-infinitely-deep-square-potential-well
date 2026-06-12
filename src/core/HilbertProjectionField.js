import * as THREE from 'three';
import { HilbertProjection } from './HilbertProjection.js';
import { eigenFunction } from './QuantumMath.js';

/**
 * HilbertProjectionField — 核心模拟器阶段2「几何投影」（Claude.md 5.2 阶段2 / design.md 阶段2）。
 *
 * 那条复杂的波动曲线，此刻被表示为希尔伯特空间中的一个矢量：矢量在三个基轴上的
 * 投影长度，正是波函数 ψ(x)=Σ cₙψₙ(x) 的展开系数。拖动矢量（约束于单位球面）即
 * 改变系数，底部波形随之实时变化 —— "函数即向量，分解即投影"。
 *
 * 物理表示：t=0 的制备态（实值，无时间演化）；时间相位演化留待阶段3。
 */
export class HilbertProjectionField {
  /**
   * @param {object} opts
   * @param {THREE.Vector3} opts.halfExtents
   * @param {number[]} [opts.coeffs]
   * @param {number} [opts.pointCount=160]
   */
  constructor({ halfExtents, coeffs = [0.6, 0.5, 0.62], pointCount = 160 }) {
    this.half = halfExtents.clone();
    this.L = 1;
    this.pointCount = pointCount;

    this.group = new THREE.Group();
    this.group.name = 'hilbert-projection-field';

    const radius = Math.min(this.half.y, this.half.z) * 1.05;
    this.proj = new HilbertProjection({
      radius,
      coeffs,
      onChange: (c) => this._updateWave(c)
    });
    this.proj.group.position.set(0, 0.2, 0); // 略上移，底部留给联动波形
    this.group.add(this.proj.group);

    // 联动波形：矢量对应的 ψ(x)
    this.waveLine = this._makeLine(0xffffff);
    this.waveLine.position.y = -this.half.y * 0.75;
    this.group.add(this.waveLine);

    this._updateWave(this.proj.getCoefficients());
  }

  _makeLine(color) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pointCount * 3), 3));
    return new THREE.Line(geom, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  }

  /** 按矢量系数刷新底部波形 ψ(x)=Σ cₙψₙ(x)。 */
  _updateWave(coeffs) {
    const arr = this.waveLine.geometry.attributes.position.array;
    const n = this.pointCount;
    const yScale = this.half.y * 0.32;
    const xSpan = this.half.x * 0.9;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * this.L;
      let psi = 0;
      for (let k = 0; k < coeffs.length; k++) psi += coeffs[k] * eigenFunction(k + 1, x);
      arr[i * 3] = (x * 2 - 1) * xSpan;
      arr[i * 3 + 1] = psi * yScale;
      arr[i * 3 + 2] = 0;
    }
    this.waveLine.geometry.attributes.position.needsUpdate = true;
    this.waveLine.geometry.computeBoundingSphere();
  }

  /** 暴露投影组件，供第三章交互（拖拽矢量）。 */
  get projection() {
    return this.proj;
  }

  // 阶段2为静态几何对应（t=0 制备态），无逐帧演化
  update() {}

  get object3d() {
    return this.group;
  }

  dispose() {
    this.proj.dispose();
    this.waveLine.geometry.dispose();
    this.waveLine.material.dispose();
  }
}
