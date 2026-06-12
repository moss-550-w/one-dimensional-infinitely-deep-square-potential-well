import { KERNELS } from './computeKernels.js';

/**
 * ComputeClient — 计算任务客户端，统一 Worker 异步与主线程同步两条路径（Claude.md 七 / plan.md M6）。
 *
 * 设计目标：
 *   - 高端环境：把动量谱等重计算丢给 Web Worker，主线程保持流畅（不掉帧）。
 *   - 低端/降级/无 Worker/单测（node）环境：自动回退到同步调用同一套纯内核，
 *     行为完全一致，仅失去并行——杜绝"两路实现漂移"（共用 computeKernels.KERNELS）。
 *   - 统一 Promise RPC 接口：调用方无需关心底层是 Worker 还是同步。
 *
 * 降级判定（构造时一次性决策，运行期不抖动）：
 *   - 显式 opts.forceSync=true（测试/低端）→ 同步。
 *   - 运行环境无 Worker 构造器（node 单测）→ 同步。
 *   - Worker 实例化抛错（CSP/旧浏览器）→ 同步兜底。
 */
export class ComputeClient {
  /**
   * @param {object} [opts]
   * @param {boolean} [opts.forceSync=false] 强制同步（低端分级或测试）
   */
  constructor({ forceSync = false } = {}) {
    this._seq = 0;
    this._pending = new Map(); // id → {resolve, reject}
    this._worker = null;
    this._mode = 'sync';

    const canUseWorker = !forceSync && typeof Worker !== 'undefined' && typeof URL !== 'undefined';
    if (canUseWorker) {
      try {
        // Vite 识别此写法并将 worker 单独打包（不进主 chunk）
        this._worker = new Worker(new URL('./compute.worker.js', import.meta.url), { type: 'module' });
        this._worker.onmessage = (e) => this._onMessage(e.data);
        this._worker.onerror = () => this._fallbackAllPending();
        this._mode = 'worker';
      } catch {
        this._worker = null;
        this._mode = 'sync';
      }
    }
  }

  /** 当前实际运行模式：'worker' | 'sync'（供调试与单测断言）。 */
  get mode() {
    return this._mode;
  }

  /**
   * 执行一个计算内核，返回结果 Promise。
   * @param {string} kernel 内核名（须在 computeKernels.KERNELS 中登记）
   * @param {object} params 内核参数
   * @returns {Promise<object>}
   */
  run(kernel, params) {
    const fn = KERNELS[kernel];
    if (!fn) return Promise.reject(new Error(`未知 kernel: ${kernel}`));

    if (this._mode !== 'worker' || !this._worker) {
      // 同步路径：直接调用纯内核（异步包装以保持接口一致）
      try {
        return Promise.resolve(fn(params));
      } catch (err) {
        return Promise.reject(err);
      }
    }

    const id = ++this._seq;
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject, kernel, params });
      this._worker.postMessage({ id, kernel, params });
    });
  }

  _onMessage(data) {
    const { id, result, error } = data;
    const entry = this._pending.get(id);
    if (!entry) return;
    this._pending.delete(id);
    if (error) entry.reject(new Error(error));
    else entry.resolve(result);
  }

  /** Worker 整体失效时，把在途请求降级为同步执行，保证调用方不会永远挂起。 */
  _fallbackAllPending() {
    this._mode = 'sync';
    for (const [, entry] of this._pending) {
      try {
        entry.resolve(KERNELS[entry.kernel](entry.params));
      } catch (err) {
        entry.reject(err);
      }
    }
    this._pending.clear();
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
  }

  /** 释放 Worker 与在途请求（场景 dispose 时调用，杜绝泄漏）。 */
  dispose() {
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
    // 在途请求以取消错误结算，避免悬挂的 Promise
    for (const [, entry] of this._pending) {
      entry.reject(new Error('ComputeClient 已销毁'));
    }
    this._pending.clear();
  }
}
