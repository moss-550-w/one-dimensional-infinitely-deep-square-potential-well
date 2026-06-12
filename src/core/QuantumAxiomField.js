import * as THREE from 'three';
import { HilbertProjection } from './HilbertProjection.js';
import { superposeComplex, probabilityDensity } from './QuantumMath.js';

/**
 * QuantumAxiomField — 核心模拟器阶段3「量子公理操作」（Claude.md 5.2 阶段3 / design.md 阶段3）。
 *
 * 整合前序全部模块的最终形态：上方是希尔伯特投影矢量（制备态控制器，拖拽即制备
 * ψ=Σcₙψₙ），盒中实时呈现含时复波函数与概率密度云。用户可执行**概率性测量坍缩**
 * ——矢量按 |cₙ|² 坍缩到某条本征轴，波函数瞬间变为纯 ψₙ（不可逆，唯有 reset 复原）。
 *
 * 物理表示（精确，视觉派生）：
 *   - 制备态 ψ(x,t)=Σ cₙ ψₙ(x)·exp(−iEₙt/ħ)，由 QuantumMath.superposeComplex 计算。
 *   - 概率密度 |ψ(x,t)|² 由 probabilityDensity 计算，含时演化下积分守恒（归一化不破坏）。
 *   - 坍缩抽样的随机性与不可逆性由场景层（第四章）按 collapseToEigenstate 驱动。
 *
 * 简化标注（Claude.md 九·5）：时间以 timeScale 放慢，仅为让干涉演化在画面中可观察，
 *   不改变任何物理关系；放慢的是"观察速度"，非物理时间尺度。
 */

const RE_COLOR = 0xffffff; // Re ψ：白
const IM_COLOR = 0x22d3ee; // Im ψ：青
const DENSITY_COLOR = 0x3b82f6; // |ψ|²：量子蓝填充

export class QuantumAxiomField {
  /**
   * @param {object} opts
   * @param {THREE.Vector3} opts.halfExtents 盒子半边长
   * @param {number[]} [opts.coeffs] 初始制备态系数（3 维，自动归一化）
   * @param {number} [opts.pointCount=160] 波形采样点数
   * @param {number} [opts.timeScale=0.16] 可视化时间缩放
   */
  constructor({ halfExtents, coeffs = [0.6, 0.5, 0.62], pointCount = 160, timeScale = 0.16 }) {
    this.half = halfExtents.clone();
    this.L = 1; // 本征函数定义域 [0,L]
    this.pointCount = pointCount;
    this.timeScale = timeScale;
    this._t = 0;
    this._evolving = true;

    this.group = new THREE.Group();
    this.group.name = 'quantum-axiom-field';

    // 波形几何参数：以盒中略偏下的基线承托概率密度云，Re/Im 曲线叠加其上
    this._baseY = -this.half.y * 0.18;
    this._ampScale = this.half.y * 0.34; // Re/Im 振幅可视高度
    this._densScale = this.half.y * 0.17; // |ψ|² 可视高度（峰值约 2~4）
    this._xSpan = this.half.x * 0.9;

    // 上方：制备态投影矢量（3 维希尔伯特类比，拖拽即制备）
    this.proj = new HilbertProjection({
      radius: Math.min(this.half.y, this.half.z) * 0.6,
      coeffs,
      onChange: (c) => this._onPrepare(c)
    });
    this.proj.group.position.set(0, this.half.y * 1.35, 0);
    this.group.add(this.proj.group);

    /** @type {number[]} 当前制备态系数（坍缩后为纯本征态） */
    this.coeffs = this.proj.getCoefficients();
    /** @type {number[]} 最近一次"制备"的系数，供 reset 复原 */
    this._prepared = [...this.coeffs];
    this.collapsed = false;

    // 概率密度填充云（三角带：基线 → |ψ|²）
    this._buildDensityMesh();
    // 实部 / 虚部曲线
    this.reLine = this._makeLine(RE_COLOR, 0.95);
    this.imLine = this._makeLine(IM_COLOR, 0.6);
    this.imLine.material.transparent = true;
    this.group.add(this.reLine, this.imLine);

    // 基线参考（盒中 y=baseline）
    this._buildBaseline();

    this._writeWave();
  }

  _makeLine(color, opacity) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pointCount * 3), 3));
    return new THREE.Line(geom, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  }

  _buildBaseline() {
    const pts = [
      new THREE.Vector3(-this._xSpan, this._baseY, 0),
      new THREE.Vector3(this._xSpan, this._baseY, 0)
    ];
    this.baseline = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.4 })
    );
    this.group.add(this.baseline);
  }

  /** 概率密度填充：每个采样点贡献基线与 |ψ|² 顶点，连成三角带。 */
  _buildDensityMesh() {
    const n = this.pointCount;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    const index = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      index.push(a, b, c, b, d, c); // 两三角形成一段
    }
    geom.setIndex(index);
    const mat = new THREE.MeshBasicMaterial({
      color: DENSITY_COLOR,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.densityMesh = new THREE.Mesh(geom, mat);
    this.group.add(this.densityMesh);
  }

  /** x∈[0,L] → 盒内 x 坐标。 */
  _boxX(x) {
    return (x / this.L) * 2 * this._xSpan - this._xSpan;
  }

  /** 依据当前系数与时间重算波形（Re/Im 曲线 + 概率密度云）。 */
  _writeWave() {
    const n = this.pointCount;
    const re = this.reLine.geometry.attributes.position.array;
    const im = this.imLine.geometry.attributes.position.array;
    const dens = this.densityMesh.geometry.attributes.position.array;

    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * this.L;
      const bx = this._boxX(x);
      const psi = superposeComplex(this.coeffs, x, this._t);
      const p = psi.re * psi.re + psi.im * psi.im;

      re[i * 3] = bx;
      re[i * 3 + 1] = this._baseY + psi.re * this._ampScale;
      re[i * 3 + 2] = 0;

      im[i * 3] = bx;
      im[i * 3 + 1] = this._baseY + psi.im * this._ampScale;
      im[i * 3 + 2] = 0;

      // 密度三角带：底点（基线）+ 顶点（|ψ|²）
      const base = i * 6;
      dens[base] = bx;
      dens[base + 1] = this._baseY;
      dens[base + 2] = -0.01;
      dens[base + 3] = bx;
      dens[base + 4] = this._baseY + p * this._densScale;
      dens[base + 5] = -0.01;
    }

    this.reLine.geometry.attributes.position.needsUpdate = true;
    this.imLine.geometry.attributes.position.needsUpdate = true;
    this.densityMesh.geometry.attributes.position.needsUpdate = true;
    this.reLine.geometry.computeBoundingSphere();
    this.imLine.geometry.computeBoundingSphere();
    this.densityMesh.geometry.computeBoundingSphere();
  }

  /** 投影矢量拖拽回调：更新制备态系数并刷新波形。 */
  _onPrepare(coeffs) {
    this.coeffs = [...coeffs];
    if (!this.collapsed) this._prepared = [...coeffs];
    this._writeWave();
  }

  /**
   * 显式制备一个态（归一化由 HilbertProjection 保证）。
   * @param {number[]} coeffs 3 维系数
   */
  prepare(coeffs) {
    this.collapsed = false;
    this._t = 0;
    this.proj.setCoefficients(coeffs); // 触发 _onPrepare
  }

  /**
   * 概率性测量坍缩：将态投影到第 index 个本征态（不可逆，Claude.md 六·4）。
   * 抽样由场景层完成并传入结果索引；此处只负责"坍缩后"的确定性呈现：
   * 矢量跳到对应本征轴，波函数变为纯 ψₙ（定态，|ψ|² 不再随时间变化）。
   * @param {number} index 坍缩到的本征态索引（0..2）
   */
  collapse(index) {
    const pure = [0, 0, 0];
    pure[index] = 1;
    this.collapsed = true;
    this._t = 0; // 纯本征态为定态，相位不影响 |ψ|²
    this.proj.setCoefficients(pure); // 触发 _onPrepare 刷新波形与矢量
    this.coeffs = this.proj.getCoefficients();
  }

  /** 重置到最近一次制备态（测量不可逆的唯一例外，Claude.md 六·4）。 */
  reset() {
    this.collapsed = false;
    this._t = 0;
    this.proj.setCoefficients(this._prepared);
  }

  /** 暂停/恢复时间演化（坍缩后的纯态演化无视觉变化，可由场景层控制）。 */
  setEvolving(flag) {
    this._evolving = flag;
  }

  /** 暴露投影组件，供第四章拖拽制备。 */
  get projection() {
    return this.proj;
  }

  /** 当前系数快照。 */
  getCoefficients() {
    return [...this.coeffs];
  }

  update(dt) {
    if (this._evolving) {
      this._t += dt * this.timeScale;
      this._writeWave();
    }
  }

  get object3d() {
    return this.group;
  }

  dispose() {
    this.proj.dispose();
    for (const obj of [this.reLine, this.imLine, this.baseline, this.densityMesh]) {
      obj.geometry.dispose();
      obj.material.dispose();
    }
  }
}
