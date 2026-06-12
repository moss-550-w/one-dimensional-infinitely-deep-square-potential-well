import * as THREE from 'three';

/**
 * SceneBase — 卫星场景生命周期基类。
 *
 * 约束（Claude.md 四·4 / 七）：离开任一卫星空间时必须完全释放其 3D 资源，
 * 杜绝 geometry/material/texture 泄漏与事件监听器残留。子类不得绕过此契约。
 *
 * 子类约定：
 *   - 重写 onInit(ctx)：构建本场景的对象，挂载到 this.group。
 *   - 重写 onUpdate(dt, elapsed)：每帧逻辑。
 *   - 重写 onDispose()：释放子类自管理的非 Object3D 资源（Worker、纹理画布等）。
 *   - 用 this.track(disposable) / this.listen(...) 登记资源，dispose 时自动回收。
 */
export class SceneBase {
  /**
   * @param {string} name 场景标识，用于日志与调试
   */
  constructor(name = 'unnamed-scene') {
    this.name = name;
    /** 本场景所有 3D 对象的根容器，便于整体挂载/卸载 */
    this.group = new THREE.Group();
    this.group.name = `scene:${name}`;
    /** @type {Array<{dispose:Function}>} 需手动释放的资源（材质/纹理/控制器等） */
    this._disposables = [];
    /** @type {Array<{target:EventTarget, type:string, handler:Function}>} 登记的监听器 */
    this._listeners = [];
    this._initialized = false;
    this._disposed = false;
  }

  /**
   * 初始化场景并挂载到父级。仅执行一次。
   * @param {{scene:THREE.Scene, camera:THREE.Camera, renderer:THREE.WebGLRenderer, bus:object}} ctx 渲染上下文
   */
  init(ctx) {
    if (this._initialized) return;
    this.ctx = ctx;
    ctx.scene.add(this.group);
    this.onInit(ctx);
    this._initialized = true;
  }

  /** 每帧更新入口，由场景管理器驱动。 */
  update(dt, elapsed) {
    if (!this._initialized || this._disposed) return;
    this.onUpdate(dt, elapsed);
  }

  /**
   * 销毁场景：递归释放 group 下所有几何体/材质/纹理，
   * 释放登记的 disposable 与监听器，并从父场景移除。
   */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;

    this.onDispose();

    // 递归释放 group 内所有 Object3D 持有的 GPU 资源
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) disposeMaterial(obj.material);
    });

    // 释放显式登记的资源（控制器、独立纹理、render target 等）
    for (const d of this._disposables) {
      try {
        d.dispose();
      } catch (err) {
        console.error(`[SceneBase:${this.name}] disposable 释放异常:`, err);
      }
    }
    this._disposables.length = 0;

    // 移除事件监听
    for (const { target, type, handler } of this._listeners) {
      target.removeEventListener(type, handler);
    }
    this._listeners.length = 0;

    // 从父场景脱离
    if (this.group.parent) this.group.parent.remove(this.group);
    this.group.clear();
  }

  /**
   * 登记一个需要手动释放的资源（须有 dispose 方法）。
   * @template {{dispose:Function}} T
   * @param {T} disposable
   * @returns {T} 原样返回，便于链式赋值
   */
  track(disposable) {
    this._disposables.push(disposable);
    return disposable;
  }

  /**
   * 登记事件监听，dispose 时自动移除。
   * @param {EventTarget} target
   * @param {string} type
   * @param {Function} handler
   * @param {boolean|AddEventListenerOptions} [options]
   */
  listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    this._listeners.push({ target, type, handler });
  }

  /* ---- 子类钩子（默认空实现） ---- */
  onInit(_ctx) {}
  onUpdate(_dt, _elapsed) {}
  onDispose() {}
}

/** 释放材质（含数组材质）及其引用的纹理。 */
function disposeMaterial(material) {
  const materials = Array.isArray(material) ? material : [material];
  for (const mat of materials) {
    // 释放材质上挂载的所有贴图（map/normalMap/...）
    for (const value of Object.values(mat)) {
      if (value && value.isTexture) value.dispose();
    }
    mat.dispose();
  }
}
