import * as THREE from 'three';
import { makeTextSprite } from '../shared/utils/textSprite.js';

/**
 * HilbertProjection — 希尔伯特空间的「三维类比」投影组件（Claude.md 六·3）。
 *
 * 将无限深势阱波函数类比为向量：三个正交轴对应基函数 sin(πx/L)、sin(2πx/L)、
 * sin(3πx/L)，向量的三个分量 (c1,c2,c3) 即傅里叶系数。
 *
 * 不可妥协的约束（Claude.md 六·3）：
 *   - 矢量端点拖拽严格约束在单位球面上（满足归一化 c1²+c2²+c3²=1）—— dragToRay 实现。
 *   - 第4、5维以「折叠」螺旋形式出现，不可展开成清晰欧氏轴，强化类比边界。
 *   - "这是类比"的永久标签由使用方（第三章场景）在 UI 层常驻呈现。
 */

const AXIS_COLORS = [0x3b82f6, 0x8b5cf6, 0x22d3ee];
const AXIS_LABELS = ['sin(πx/L)', 'sin(2πx/L)', 'sin(3πx/L)'];

export class HilbertProjection {
  /**
   * @param {object} [opts]
   * @param {number} [opts.radius=1.5] 单位球半径（矢量可视长度）
   * @param {number[]} [opts.coeffs] 初始系数（自动归一化）
   * @param {(c:number[])=>void} [opts.onChange] 系数变化回调
   */
  constructor({ radius = 1.5, coeffs = [0.6, 0.5, 0.62], onChange = null } = {}) {
    this.radius = radius;
    this.onChange = onChange;
    this.coeffs = normalize3(coeffs);

    this.group = new THREE.Group();
    this.group.name = 'hilbert-projection';

    this._build();
    this._applyCoeffs();
  }

  _build() {
    // 单位球面（wireframe，半透明），体现归一化约束面
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0x8b5cf6,
      wireframe: true,
      transparent: true,
      opacity: 0.12
    });
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(this.radius, 28, 18), sphereMat);
    this.group.add(this.sphere);

    // 三正交轴（正向箭头 + 负向延伸线 + 文字标注）
    const dirs = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1)
    ];
    const len = this.radius * 1.25;
    dirs.forEach((d, i) => {
      const arrow = new THREE.ArrowHelper(d, ORIGIN, len, AXIS_COLORS[i], 0.12, 0.07);
      const negLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([ORIGIN, d.clone().multiplyScalar(-len)]),
        new THREE.LineBasicMaterial({ color: AXIS_COLORS[i], transparent: true, opacity: 0.3 })
      );
      const label = makeTextSprite(AXIS_LABELS[i], { color: hex(AXIS_COLORS[i]) });
      label.position.copy(d.clone().multiplyScalar(len + 0.2));
      this.group.add(arrow, negLine, label);
    });

    // 状态矢量（原点 → 端点）
    this.vector = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), ORIGIN, this.radius, 0xffffff, 0.16, 0.1);
    this.group.add(this.vector);

    // 端点把手（可拖拽命中目标）
    this.handle = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    this.handle.name = 'hilbert-handle';
    this.group.add(this.handle);

    // 三投影线（端点 → 各轴投影点，虚线）
    this.projLines = AXIS_COLORS.map((c) => {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([ORIGIN.clone(), ORIGIN.clone()]),
        new THREE.LineDashedMaterial({
          color: c,
          dashSize: 0.07,
          gapSize: 0.05,
          transparent: true,
          opacity: 0.65
        })
      );
      this.group.add(line);
      return line;
    });

    this._buildFoldedAxes();
  }

  /** 第4/5维：卷曲螺旋，刻意"无法展开"，强化无限维类比的边界。 */
  _buildFoldedAxes() {
    const make = (origin, label) => {
      const pts = [];
      for (let t = 0; t <= 1; t += 0.02) {
        const ang = t * Math.PI * 6;
        const r = 0.16 * (1 - t * 0.4);
        pts.push(new THREE.Vector3(origin.x + Math.cos(ang) * r, origin.y + t * 0.45, origin.z + Math.sin(ang) * r));
      }
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.45 })
      );
      const lab = makeTextSprite(label, { color: '#64748b', fontSize: 30, worldHeight: 0.12 });
      lab.position.set(origin.x, origin.y + 0.58, origin.z);
      this.group.add(line, lab);
    };
    make(new THREE.Vector3(-0.95, -0.95, 0.95), '第4维·折叠');
    make(new THREE.Vector3(0.95, -0.95, -0.95), '第5维·折叠');
  }

  /** 依据当前系数刷新矢量、把手与投影线。 */
  _applyCoeffs() {
    const [a, b, c] = this.coeffs;
    const dir = new THREE.Vector3(a, b, c);
    const end = dir.clone().multiplyScalar(this.radius);

    this.vector.setDirection(dir.clone().normalize());
    this.vector.setLength(this.radius, 0.16, 0.1);
    this.handle.position.copy(end);

    const targets = [
      new THREE.Vector3(end.x, 0, 0),
      new THREE.Vector3(0, end.y, 0),
      new THREE.Vector3(0, 0, end.z)
    ];
    this.projLines.forEach((line, i) => {
      line.geometry.setFromPoints([end, targets[i]]);
      line.computeLineDistances();
    });
  }

  setCoefficients(c) {
    this.coeffs = normalize3(c);
    this._applyCoeffs();
    this.onChange?.(this.coeffs);
  }

  getCoefficients() {
    return [...this.coeffs];
  }

  /**
   * 球坐标约束算法：将相机射线约束到单位球面，取球面方向为新系数，
   * 端点恒在单位球面（严格满足归一化）。
   *
   * 球心取本组件的世界坐标（getWorldPosition），因此组件被父级平移到任意位置
   * （如阶段3矢量上浮到盒顶）后，拖拽仍精确命中球面，不产生偏移。
   * @param {THREE.Raycaster} raycaster 已 setFromCamera 的射线投射器
   */
  dragToRay(raycaster) {
    // 将射线平移到「以球心为原点」的坐标系：方向不变，仅原点减去球心
    const center = this.group.getWorldPosition(new THREE.Vector3());
    const o = raycaster.ray.origin.clone().sub(center);
    const d = raycaster.ray.direction;
    const b = o.dot(d);
    const c = o.dot(o) - this.radius * this.radius;
    const disc = b * b - c;

    let point;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      let t = -b - s; // 近交点
      if (t < 0) t = -b + s;
      point = o.clone().add(d.clone().multiplyScalar(t));
    } else {
      // 射线未命中球：取离球心最近点，投影回球面
      point = o.clone().add(d.clone().multiplyScalar(-b));
    }
    const dir = point.normalize();
    this.setCoefficients([dir.x, dir.y, dir.z]);
  }

  get object3d() {
    return this.group;
  }

  dispose() {
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
    });
  }
}

const ORIGIN = new THREE.Vector3(0, 0, 0);

function normalize3([a, b, c]) {
  const s = Math.hypot(a, b, c) || 1;
  return [a / s, b / s, c / s];
}

function hex(n) {
  return '#' + n.toString(16).padStart(6, '0');
}
