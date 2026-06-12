/**
 * ForceLayout — 3D 力导向布局引擎（纯计算，不依赖 THREE）。
 *
 * 用于第五章「思想的长河」知识图谱（Claude.md 六·5 / design.md 第五章）：
 * 节点稳定布局、可拖拽探索。布局算法只产出坐标，渲染层（Chapter5）派生可视化，
 * 单测可独立验证收敛与确定性（plan.md 二·M5 验收：节点稳定布局）。
 *
 * 力模型（经典 Fruchterman–Reingold 变体 + 库仑斥力 + 向心约束）：
 *   - 斥力：任意两节点间 F = repulsion / d²，沿连线方向相互推开。
 *   - 弹簧：每条边以理想长度 linkDistance 的胡克力把两端拉近/推远。
 *   - 向心力：所有节点被一个弱中心力拉向原点，避免整体漂散。
 *   - 阻尼：速度每步乘以 damping，并随时间冷却（cooling），保证收敛到静态。
 *
 * 确定性：初始坐标由「黄金角球面螺旋」按节点索引解析生成（无 Math.random），
 *   因此同一图在任意环境（含 node 单测）布局完全可复现（plan.md 风险：可复现）。
 */
export class ForceLayout {
  /**
   * @param {object} opts
   * @param {Array<{id:string}>} opts.nodes 节点（需含唯一 id）
   * @param {Array<{source:string, target:string}>} opts.links 边（以 id 引用）
   * @param {number} [opts.repulsion=1.2] 库仑斥力强度
   * @param {number} [opts.linkDistance=2.2] 弹簧理想长度
   * @param {number} [opts.linkStrength=0.06] 弹簧劲度
   * @param {number} [opts.centerStrength=0.012] 向心力强度
   * @param {number} [opts.damping=0.82] 速度阻尼
   * @param {number} [opts.radius=4] 初始球面半径
   */
  constructor({
    nodes,
    links,
    repulsion = 1.2,
    linkDistance = 2.2,
    linkStrength = 0.06,
    centerStrength = 0.012,
    damping = 0.82,
    radius = 4
  }) {
    this.repulsion = repulsion;
    this.linkDistance = linkDistance;
    this.linkStrength = linkStrength;
    this.centerStrength = centerStrength;
    this.damping = damping;
    this._cooling = 1;

    this._index = new Map();
    this.nodes = nodes.map((n, i) => {
      const p = seedPosition(i, nodes.length, radius);
      this._index.set(n.id, i);
      return {
        id: n.id,
        ref: n,
        x: p.x,
        y: p.y,
        z: p.z,
        vx: 0,
        vy: 0,
        vz: 0,
        pinned: false
      };
    });

    // 边以节点下标缓存，避免每步查表
    this.links = links
      .map((l) => ({
        source: this._index.get(l.source),
        target: this._index.get(l.target),
        ref: l
      }))
      .filter((l) => l.source !== undefined && l.target !== undefined);
  }

  /** 取节点下标。 */
  indexOf(id) {
    return this._index.get(id);
  }

  /** 取节点（含坐标），按 id。 */
  getNode(id) {
    const i = this._index.get(id);
    return i === undefined ? null : this.nodes[i];
  }

  /**
   * 推进一步模拟。
   * @param {number} [cool=0.995] 每步冷却系数（<1 使系统逐渐静止）
   */
  step(cool = 0.995) {
    const n = this.nodes.length;
    const fx = new Float64Array(n);
    const fy = new Float64Array(n);
    const fz = new Float64Array(n);

    // 1) 两两库仑斥力 O(n²)（节点数 ~13，开销可忽略）
    for (let i = 0; i < n; i++) {
      const a = this.nodes[i];
      for (let j = i + 1; j < n; j++) {
        const b = this.nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dz = a.z - b.z;
        let d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 1e-4) {
          // 重合时给一个由下标决定的确定性微扰，避免除零且保持可复现
          dx = (i - j) * 1e-3 + 1e-3;
          dy = 1e-3;
          dz = (j - i) * 1e-3;
          d2 = dx * dx + dy * dy + dz * dz;
        }
        const d = Math.sqrt(d2);
        const f = this.repulsion / d2;
        const ux = dx / d;
        const uy = dy / d;
        const uz = dz / d;
        fx[i] += ux * f;
        fy[i] += uy * f;
        fz[i] += uz * f;
        fx[j] -= ux * f;
        fy[j] -= uy * f;
        fz[j] -= uz * f;
      }
    }

    // 2) 弹簧（胡克力）把每条边拉向理想长度
    for (const l of this.links) {
      const a = this.nodes[l.source];
      const b = this.nodes[l.target];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dz = b.z - a.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-3;
      const f = (d - this.linkDistance) * this.linkStrength;
      const ux = dx / d;
      const uy = dy / d;
      const uz = dz / d;
      fx[l.source] += ux * f;
      fy[l.source] += uy * f;
      fz[l.source] += uz * f;
      fx[l.target] -= ux * f;
      fy[l.target] -= uy * f;
      fz[l.target] -= uz * f;
    }

    // 3) 向心力 + 4) 积分（半隐式欧拉 + 阻尼 + 冷却）
    for (let i = 0; i < n; i++) {
      const node = this.nodes[i];
      if (node.pinned) {
        node.vx = node.vy = node.vz = 0;
        continue;
      }
      fx[i] -= node.x * this.centerStrength;
      fy[i] -= node.y * this.centerStrength;
      fz[i] -= node.z * this.centerStrength;

      node.vx = (node.vx + fx[i]) * this.damping * this._cooling;
      node.vy = (node.vy + fy[i]) * this.damping * this._cooling;
      node.vz = (node.vz + fz[i]) * this.damping * this._cooling;

      node.x += node.vx;
      node.y += node.vy;
      node.z += node.vz;
    }

    this._cooling *= cool;
  }

  /**
   * 预热：连续步进 iterations 次以达到近稳态（用于初次进入即呈现稳定布局）。
   * @param {number} [iterations=300]
   */
  warmup(iterations = 300) {
    for (let i = 0; i < iterations; i++) this.step();
  }

  /** 固定/释放某节点（拖拽时固定，松手后释放参与布局）。 */
  setPinned(id, flag) {
    const node = this.getNode(id);
    if (node) node.pinned = flag;
  }

  /** 直接设定某节点坐标（拖拽实时跟手）。 */
  setPosition(id, x, y, z) {
    const node = this.getNode(id);
    if (node) {
      node.x = x;
      node.y = y;
      node.z = z;
      node.vx = node.vy = node.vz = 0;
    }
  }

  /** 系统总动能，用于判断是否收敛。 */
  kineticEnergy() {
    let e = 0;
    for (const n of this.nodes) e += n.vx * n.vx + n.vy * n.vy + n.vz * n.vz;
    return e;
  }
}

/**
 * 黄金角球面螺旋：按索引解析地把点均匀铺在球面上（确定性，无随机）。
 * @returns {{x:number,y:number,z:number}}
 */
function seedPosition(i, total, radius) {
  const golden = Math.PI * (3 - Math.sqrt(5)); // ≈2.39996 黄金角
  const y = total <= 1 ? 0 : 1 - (i / (total - 1)) * 2; // y ∈ [1,-1]
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = golden * i;
  return {
    x: Math.cos(theta) * r * radius,
    y: y * radius,
    z: Math.sin(theta) * r * radius
  };
}
