import * as THREE from 'three';

/**
 * ClassicalField — 核心模拟器阶段0「经典混沌」的粒子场。
 *
 * 物理模型（Claude.md 5.2 阶段0 / 六·1）：
 *   纯牛顿力学，随机初始条件，与盒壁发生弹性碰撞（速率守恒）。
 *   本阶段不涉及任何量子/波函数计算 —— 它刻意呈现"无规律的混沌"，
 *   为后续"混沌是秩序的叠加"埋下认知反差。
 *
 * 性能（Claude.md 七）：全部粒子用单个 InstancedMesh 渲染（一次 draw call），
 *   数量按性能分级下调，几何分段按分级简化。
 */

// 粒子配色：量子蓝→希尔伯特紫→冷白，制造发光群感
const PALETTE = [0x3b82f6, 0x60a5fa, 0x8b5cf6, 0xa78bfa, 0xbfdbfe, 0xe0e7ff];

const TIER_COUNT = { high: 500, mid: 350, low: 200 };

export class ClassicalField {
  /**
   * @param {object} [opts]
   * @param {number} [opts.count=500] 期望粒子数（受性能分级上限约束）
   * @param {THREE.Vector3} [opts.halfExtents] 盒子半边长（粒子活动范围）
   * @param {'high'|'mid'|'low'} [opts.tier='high'] 性能分级
   * @param {number} [opts.speed=1.6] 基准速率
   */
  constructor({
    count = 500,
    halfExtents = new THREE.Vector3(1.6, 1.0, 1.0),
    tier = 'high',
    speed = 1.6
  } = {}) {
    this.half = halfExtents.clone();
    this.speed = speed;
    this.radius = 0.035;
    this.count = Math.min(count, TIER_COUNT[tier] ?? 500);

    const seg = tier === 'low' ? 6 : 8;
    const geom = new THREE.SphereGeometry(this.radius, seg, seg);
    // 自发光观感：MeshBasicMaterial 不受光照影响，toneMapped:false 提升亮度
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geom, mat, this.count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; // 实例分布于盒内，关闭整体视锥剔除避免误剔
    this.mesh.name = 'classical-field';

    this.pos = new Float32Array(this.count * 3);
    this.vel = new Float32Array(this.count * 3);
    this._escaped = new Uint8Array(this.count); // 逃逸后置1，停止参与模拟
    this._dummy = new THREE.Object3D();
    this._color = new THREE.Color();

    this._initParticles();
  }

  /** 随机初始化位置（盒内）、速度（随机方向、速率有分布）与颜色。 */
  _initParticles() {
    const margin = this.radius * 1.5;
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      this.pos[i3] = rand(-this.half.x + margin, this.half.x - margin);
      this.pos[i3 + 1] = rand(-this.half.y + margin, this.half.y - margin);
      this.pos[i3 + 2] = rand(-this.half.z + margin, this.half.z - margin);

      // 均匀球面采样得到随机方向，速率在 0.7–1.3 倍基准间分布
      const dir = randomUnitVector();
      const v = this.speed * rand(0.7, 1.3);
      this.vel[i3] = dir.x * v;
      this.vel[i3 + 1] = dir.y * v;
      this.vel[i3 + 2] = dir.z * v;

      this._color.setHex(PALETTE[(Math.random() * PALETTE.length) | 0]);
      this.mesh.setColorAt(i, this._color);
    }
    this.mesh.instanceColor.needsUpdate = true;
    this._writeMatrices();
  }

  /**
   * 推进一帧：牛顿匀速直线运动 + 盒壁弹性反射。
   * @param {number} dt 帧间隔（秒）
   */
  update(dt) {
    // 钳制 dt，避免卡顿后单步位移过大导致穿墙
    const h = Math.min(dt, 0.05);
    const limX = this.half.x - this.radius;
    const limY = this.half.y - this.radius;
    const limZ = this.half.z - this.radius;

    for (let i = 0; i < this.count; i++) {
      if (this._escaped[i]) continue;
      const i3 = i * 3;
      let x = this.pos[i3] + this.vel[i3] * h;
      let y = this.pos[i3 + 1] + this.vel[i3 + 1] * h;
      let z = this.pos[i3 + 2] + this.vel[i3 + 2] * h;

      // 弹性碰撞：越界则钳回边界并反转该轴速度（速率守恒 → 动能守恒）
      if (x > limX) { x = limX; this.vel[i3] = -this.vel[i3]; }
      else if (x < -limX) { x = -limX; this.vel[i3] = -this.vel[i3]; }
      if (y > limY) { y = limY; this.vel[i3 + 1] = -this.vel[i3 + 1]; }
      else if (y < -limY) { y = -limY; this.vel[i3 + 1] = -this.vel[i3 + 1]; }
      if (z > limZ) { z = limZ; this.vel[i3 + 2] = -this.vel[i3 + 2]; }
      else if (z < -limZ) { z = -limZ; this.vel[i3 + 2] = -this.vel[i3 + 2]; }

      this.pos[i3] = x;
      this.pos[i3 + 1] = y;
      this.pos[i3 + 2] = z;
    }
    this._writeMatrices();
  }

  /** 将 pos 数组写入实例矩阵。逃逸粒子缩为0隐藏。 */
  _writeMatrices() {
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      this._dummy.position.set(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2]);
      if (this._escaped[i]) this._dummy.scale.setScalar(0);
      else this._dummy.scale.setScalar(1);
      this._dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this._dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * 选取一个尚未逃逸的粒子并标记其逃逸（隐藏实例）。
   * @returns {{index:number, localPosition:THREE.Vector3}|null} 该粒子的局部坐标
   */
  pickEscapee() {
    for (let i = 0; i < this.count; i++) {
      if (!this._escaped[i]) {
        const i3 = i * 3;
        const localPosition = new THREE.Vector3(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2]);
        this._escaped[i] = 1;
        this._writeMatrices();
        return { index: i, localPosition };
      }
    }
    return null;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

/* ---- 工具 ---- */
function rand(min, max) {
  return min + Math.random() * (max - min);
}

/** 均匀球面方向采样（避免极点聚集）。 */
function randomUnitVector() {
  const u = Math.random() * 2 - 1; // cosθ ∈ [-1,1]
  const phi = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return new THREE.Vector3(s * Math.cos(phi), s * Math.sin(phi), u);
}
