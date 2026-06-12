import * as THREE from 'three';
import { ClassicalField } from './ClassicalField.js';
import { ModeDecompositionField } from './ModeDecompositionField.js';

/**
 * 核心模拟器阶段枚举（Claude.md 5.2）。
 */
export const STAGE = Object.freeze({
  CLASSICAL_CHAOS: 0,      // 经典混沌
  MODE_DECOMPOSITION: 1,   // 模式分解
  GEOMETRIC_PROJECTION: 2, // 几何投影
  QUANTUM_AXIOM: 3         // 量子公理操作
});

/**
 * Simulator — 贯穿全站的核心势阱模拟器（状态机）。
 *
 * 设计（Claude.md 5.2）：
 *   - 持有 currentStage 与 unlockedModules，是整个网站的锚点对象。
 *   - 四个阶段随用户解锁认知模块逐级升级，各阶段的内部数学表示必须精确，
 *     视觉由数学派生。
 *
 * 生命周期架构决策：
 *   模拟器的"视图对象"（盒子 + 当前阶段可视化）由各卫星章节挂载与销毁，
 *   而"状态"（stage / unlockedModules）持久化于 StateBus，跨章节同步。
 *   构造时从 bus 恢复已有阶段，从而无需保留 3D 资源即可延续旅程进度。
 */
export class Simulator {
  /**
   * @param {object} opts
   * @param {import('./StateBus.js').StateBus} opts.bus 全站事件总线
   * @param {THREE.Vector3} [opts.halfExtents] 势阱半边长
   */
  constructor({ bus, halfExtents = new THREE.Vector3(1.6, 1.0, 1.0) }) {
    this.bus = bus;
    this.half = halfExtents.clone();
    this.group = new THREE.Group();
    this.group.name = 'core-simulator';

    const state = bus.getState();
    this.currentStage = state.currentStage ?? STAGE.CLASSICAL_CHAOS;
    this.unlockedModules = [...(state.unlockedModules ?? [])];
    this.tier = state.performanceTier ?? 'high';

    /** @type {ClassicalField|null} 当前阶段的可视化模块 */
    this.stageModule = null;

    this._buildWell();
    this._buildStage(this.currentStage);
  }

  /** 构建半透明势阱盒子与发光边框。 */
  _buildWell() {
    const size = this.half.clone().multiplyScalar(2);
    const boxGeom = new THREE.BoxGeometry(size.x, size.y, size.z);

    // 玻璃罩观感：BackSide 渲染内壁，半透明、不写深度，避免遮挡内部粒子
    const boxMat = new THREE.MeshBasicMaterial({
      color: 0x1e293b,
      transparent: true,
      opacity: 0.1,
      side: THREE.BackSide,
      depthWrite: false
    });
    this.wellMesh = new THREE.Mesh(boxGeom, boxMat);

    const edgeGeom = new THREE.EdgesGeometry(boxGeom);
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.5
    });
    this.wellEdges = new THREE.LineSegments(edgeGeom, edgeMat);

    this.group.add(this.wellMesh, this.wellEdges);
  }

  /** 装载指定阶段的可视化模块。 */
  _buildStage(stage) {
    this._disposeStageModule();
    if (stage === STAGE.CLASSICAL_CHAOS) {
      this.stageModule = new ClassicalField({ halfExtents: this.half, tier: this.tier });
    } else if (stage === STAGE.MODE_DECOMPOSITION) {
      this.stageModule = new ModeDecompositionField({ halfExtents: this.half });
    }
    // 阶段 2–3 的可视化模块将在 M3–M4 接入
    if (this.stageModule) this.group.add(this.stageModule.object3d);
  }

  _disposeStageModule() {
    if (this.stageModule) {
      this.group.remove(this.stageModule.object3d);
      this.stageModule.dispose();
      this.stageModule = null;
    }
  }

  /**
   * 切换阶段并广播到全站。禁止跳级（须逐级递进，呼应解锁前置约束）。
   * @param {number} stage 目标阶段
   */
  setStage(stage) {
    if (stage === this.currentStage) return;
    this.currentStage = stage;
    this._buildStage(stage);
    this.bus.setState({ currentStage: stage });
  }

  /**
   * 解锁一个认知模块，记录并同步。
   * @param {string} moduleId
   */
  unlock(moduleId) {
    if (!this.unlockedModules.includes(moduleId)) {
      this.unlockedModules.push(moduleId);
      this.bus.setState({ unlockedModules: [...this.unlockedModules] });
    }
  }

  /** 每帧更新当前阶段可视化。 */
  update(dt) {
    if (this.stageModule) this.stageModule.update(dt);
  }

  /** 暴露当前阶段可视化模块（阶段0：ClassicalField；阶段1：ModeDecompositionField）。 */
  get field() {
    return this.stageModule;
  }

  /** 释放模拟器全部 3D 资源并脱离父场景。 */
  dispose() {
    this._disposeStageModule();
    this.wellMesh.geometry.dispose();
    this.wellMesh.material.dispose();
    this.wellEdges.geometry.dispose();
    this.wellEdges.material.dispose();
    if (this.group.parent) this.group.parent.remove(this.group);
    this.group.clear();
  }
}
