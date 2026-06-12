import * as THREE from 'three';

/**
 * WaveCanvas — 2D 波形绘制器，输出可贴到 3D 平面的 CanvasTexture。
 *
 * 用于第二章傅里叶合成器：在 2D Canvas 上以高精度绘制目标方波、实时叠加曲线
 * 与吉布斯过冲标注（Claude.md 六·2「作为纹理贴到3D平面，方便2D精度观测」）。
 *
 * 坐标系：数据空间 (x∈xRange, y∈yRange) → 像素空间，含内边距。
 */
export class WaveCanvas {
  /**
   * @param {object} [opts]
   * @param {number} [opts.width=1024]
   * @param {number} [opts.height=512]
   * @param {[number,number]} [opts.xRange=[0,1]]
   * @param {[number,number]} [opts.yRange=[-0.5,1.5]] 预留过冲与负向振荡空间
   * @param {number} [opts.pad=48]
   */
  constructor({
    width = 1024,
    height = 512,
    xRange = [0, 1],
    yRange = [-0.5, 1.5],
    pad = 48
  } = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');
    this.W = width;
    this.H = height;
    this.pad = pad;
    this.xRange = xRange;
    this.yRange = yRange;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
  }

  xToPx(x) {
    const [x0, x1] = this.xRange;
    return this.pad + ((x - x0) / (x1 - x0)) * (this.W - 2 * this.pad);
  }

  yToPx(y) {
    const [y0, y1] = this.yRange;
    return this.H - this.pad - ((y - y0) / (y1 - y0)) * (this.H - 2 * this.pad);
  }

  /** 清屏并填充深空蓝半透明底。 */
  clear() {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.fillStyle = 'rgba(15,23,42,0.85)';
    ctx.fillRect(0, 0, this.W, this.H);
  }

  /** 网格与坐标参考线（y=0 与 y=1 的收敛参考）。 */
  drawGrid() {
    const { ctx } = this;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(148,163,184,0.15)';
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) {
      const x = this.xToPx(this.xRange[0] + (i / 10) * (this.xRange[1] - this.xRange[0]));
      ctx.moveTo(x, this.pad);
      ctx.lineTo(x, this.H - this.pad);
    }
    ctx.stroke();

    // y=0 与 y=1 强调线
    for (const [y, label, color] of [
      [0, '0', 'rgba(148,163,184,0.5)'],
      [1, '1', 'rgba(96,165,250,0.6)']
    ]) {
      const py = this.yToPx(y);
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(this.pad, py);
      ctx.lineTo(this.W - this.pad, py);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = '20px JetBrains Mono, monospace';
      ctx.fillText(label, this.pad - 28, py + 6);
    }
  }

  /** 目标方波参考：在 (x0,x1) 内 y=1，端点跳变到 0（虚线）。 */
  drawReferenceSquare() {
    const { ctx } = this;
    ctx.save();
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(226,232,240,0.55)';
    const [x0, x1] = this.xRange;
    const y0 = this.yToPx(0);
    const y1 = this.yToPx(1);
    ctx.beginPath();
    ctx.moveTo(this.xToPx(x0), y0);
    ctx.lineTo(this.xToPx(x0), y1);
    ctx.lineTo(this.xToPx(x1), y1);
    ctx.lineTo(this.xToPx(x1), y0);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * 绘制曲线 y=fn(x)。
   * @param {(x:number)=>number} fn
   * @param {object} [style]
   */
  drawCurve(fn, { color = '#3b82f6', width = 3, samples = 600 } = {}) {
    const { ctx } = this;
    const [x0, x1] = this.xRange;
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= samples; i++) {
      const x = x0 + (i / samples) * (x1 - x0);
      const px = this.xToPx(x);
      const py = this.yToPx(fn(x));
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  /** 在 (x,y) 处标注一个高亮点与文字（用于吉布斯峰）。 */
  drawMarker(x, y, label, { color = '#ef4444' } = {}) {
    const { ctx } = this;
    const px = this.xToPx(x);
    const py = this.yToPx(y);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();
    // 竖向引线到 y=1
    ctx.strokeStyle = color;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, this.yToPx(1));
    ctx.stroke();
    ctx.setLineDash([]);
    // 文字
    ctx.fillStyle = color;
    ctx.font = 'bold 22px JetBrains Mono, monospace';
    ctx.fillText(label, px + 12, py - 8);
  }

  /**
   * 填充曲线与 y=0 之间的区域，正/负值用不同颜色（用于正交性演示的"正负面积相消"）。
   * @param {(x:number)=>number} fn
   * @param {object} [opts]
   * @param {number} [opts.upper] 仅填充到该 x（扫描动画），默认整段
   */
  drawFilledCurve(
    fn,
    {
      posColor = 'rgba(34,197,94,0.35)',
      negColor = 'rgba(239,68,68,0.35)',
      samples = 500,
      upper = null
    } = {}
  ) {
    const { ctx } = this;
    const [x0, x1] = this.xRange;
    const top = upper ?? x1;
    const y0px = this.yToPx(0);
    for (let i = 0; i < samples; i++) {
      const xa = x0 + (i / samples) * (top - x0);
      const xb = x0 + ((i + 1) / samples) * (top - x0);
      const ya = fn(xa);
      const yb = fn(xb);
      ctx.fillStyle = (ya + yb) / 2 >= 0 ? posColor : negColor;
      ctx.beginPath();
      ctx.moveTo(this.xToPx(xa), y0px);
      ctx.lineTo(this.xToPx(xa), this.yToPx(ya));
      ctx.lineTo(this.xToPx(xb), this.yToPx(yb));
      ctx.lineTo(this.xToPx(xb), y0px);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** 提交本帧绘制到 GPU 纹理。 */
  commit() {
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
  }
}
