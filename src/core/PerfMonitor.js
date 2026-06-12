/**
 * PerfMonitor — 运行时帧率监测与自动降级（Claude.md 七 / plan.md M6）。
 *
 * 纯逻辑模块（不触碰 THREE/DOM），每帧喂入 dt，以滑动窗口估计平均 FPS。
 * 当平均 FPS 持续低于阈值达到判定时长，则下调性能分级 high→mid→low，
 * 通过回调通知上层（由主循环写入 StateBus，全站可读做降级策略）。
 *
 * 设计要点：
 *   - 只降不升：避免在临界点反复抖动（升档需重载页面或显式重置）。
 *   - 需"持续"低帧（holdSeconds）才降级：躲开 GC/切场景造成的瞬时尖刺。
 *   - 起步预热（warmupFrames）：跳过首帧资源加载抖动，不误判。
 */

export const TIERS = ['high', 'mid', 'low'];

export class PerfMonitor {
  /**
   * @param {object} [opts]
   * @param {'high'|'mid'|'low'} [opts.tier='high'] 初始分级
   * @param {number} [opts.sampleWindow=60] 滑动窗口帧数（约 1s @60fps）
   * @param {number} [opts.lowFps=32] 低于此平均 FPS 视为吃力（设计门槛 30fps）
   * @param {number} [opts.holdSeconds=2.5] 持续低帧多久后降级
   * @param {number} [opts.warmupFrames=45] 预热帧数（期间不判定）
   * @param {(tier:string, fps:number)=>void} [opts.onDowngrade] 降级回调
   */
  constructor({
    tier = 'high',
    sampleWindow = 60,
    lowFps = 32,
    holdSeconds = 2.5,
    warmupFrames = 45,
    onDowngrade = null
  } = {}) {
    this.tier = TIERS.includes(tier) ? tier : 'high';
    this.sampleWindow = sampleWindow;
    this.lowFps = lowFps;
    this.holdSeconds = holdSeconds;
    this.warmupFrames = warmupFrames;
    this.onDowngrade = onDowngrade;

    this._samples = []; // 最近若干帧的 dt（秒）
    this._sum = 0; // 窗口 dt 之和，O(1) 维护均值
    this._lowElapsed = 0; // 持续低帧累计时长
    this._frames = 0;
  }

  /** 当前窗口平均 FPS（样本不足时返回 null）。 */
  get fps() {
    if (this._samples.length === 0) return null;
    const avgDt = this._sum / this._samples.length;
    return avgDt > 0 ? 1 / avgDt : null;
  }

  /** 是否已到最低档（无法再降）。 */
  get atFloor() {
    return this.tier === 'low';
  }

  /**
   * 喂入一帧间隔，更新统计并按需降级。
   * @param {number} dt 帧间隔（秒）
   * @returns {boolean} 本帧是否触发了降级
   */
  sample(dt) {
    this._frames++;
    // 钳制异常 dt（切后台/断点）避免污染均值
    const d = Math.min(Math.max(dt, 1 / 240), 0.5);

    this._samples.push(d);
    this._sum += d;
    if (this._samples.length > this.sampleWindow) {
      this._sum -= this._samples.shift();
    }

    // 预热期 / 窗口未填满 / 已到底：不判定
    if (this._frames < this.warmupFrames || this._samples.length < this.sampleWindow || this.atFloor) {
      return false;
    }

    const fps = this.fps;
    if (fps !== null && fps < this.lowFps) {
      this._lowElapsed += d;
      if (this._lowElapsed >= this.holdSeconds) {
        return this._downgrade(fps);
      }
    } else {
      // 帧率恢复，清零持续计时（迟滞，避免抖动）
      this._lowElapsed = 0;
    }
    return false;
  }

  _downgrade(fps) {
    const idx = TIERS.indexOf(this.tier);
    if (idx >= TIERS.length - 1) return false;
    this.tier = TIERS[idx + 1];
    this._lowElapsed = 0;
    this._samples.length = 0; // 重置窗口，给新档位重新评估的机会
    this._sum = 0;
    this._frames = 0; // 重新预热，防止降级瞬间连环触发
    this.onDowngrade?.(this.tier, fps);
    return true;
  }
}
