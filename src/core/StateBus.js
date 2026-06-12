/**
 * StateBus — 全站事件总线与共享状态容器。
 *
 * 职责：
 *   1. PubSub：跨卫星章节与核心模拟器解耦通信（on/once/off/emit）。
 *   2. 共享状态：集中保存模拟器阶段、已解锁模块、性能分级等全站可读状态，
 *      状态变更时通过 'state:change' 事件广播，避免各处轮询。
 *
 * 设计约束（Claude.md 5.2 / 七）：
 *   - 所有计算密集任务（Worker）只做纯计算，状态同步统一经由此处收口。
 */
export class StateBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} 事件名 → 处理器集合 */
    this._handlers = new Map();
    /** @type {Record<string, any>} 全站共享状态快照 */
    this._state = {
      currentStage: 0,        // 核心模拟器阶段 0–3
      unlockedModules: [],    // 已解锁认知模块标识
      performanceTier: null,  // 'high' | 'mid' | 'low'，由性能探测写入
      isMobile: false
    };
  }

  /**
   * 订阅事件。
   * @param {string} event 事件名
   * @param {Function} handler 处理器
   * @returns {Function} 退订函数，调用即移除该订阅
   */
  on(event, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('StateBus.on: handler 必须是函数');
    }
    if (!this._handlers.has(event)) {
      this._handlers.set(event, new Set());
    }
    this._handlers.get(event).add(handler);
    return () => this.off(event, handler);
  }

  /**
   * 订阅一次性事件，触发后自动退订。
   * @param {string} event 事件名
   * @param {Function} handler 处理器
   * @returns {Function} 退订函数
   */
  once(event, handler) {
    const wrapper = (payload) => {
      this.off(event, wrapper);
      handler(payload);
    };
    return this.on(event, wrapper);
  }

  /**
   * 退订事件。未传 handler 时清空该事件全部订阅。
   * @param {string} event 事件名
   * @param {Function} [handler] 指定处理器
   */
  off(event, handler) {
    const set = this._handlers.get(event);
    if (!set) return;
    if (handler) {
      set.delete(handler);
      if (set.size === 0) this._handlers.delete(event);
    } else {
      this._handlers.delete(event);
    }
  }

  /**
   * 派发事件。处理器异常被隔离，不影响其余订阅者。
   * @param {string} event 事件名
   * @param {any} [payload] 负载
   */
  emit(event, payload) {
    const set = this._handlers.get(event);
    if (!set) return;
    // 复制一份，允许处理器在回调中安全退订
    for (const handler of [...set]) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[StateBus] 事件 "${event}" 处理器异常:`, err);
      }
    }
  }

  /**
   * 读取共享状态快照（浅拷贝，防止外部直接篡改）。
   * @returns {Record<string, any>}
   */
  getState() {
    return { ...this._state };
  }

  /**
   * 合并更新共享状态，并广播 'state:change'。
   * @param {Record<string, any>} patch 局部状态
   */
  setState(patch) {
    this._state = { ...this._state, ...patch };
    this.emit('state:change', this.getState());
  }

  /** 移除所有订阅（测试与全站销毁时使用）。 */
  clear() {
    this._handlers.clear();
  }
}

// 全站单例：核心模拟器状态跨章节同步的唯一入口
export const stateBus = new StateBus();
