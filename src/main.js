import * as THREE from 'three';
import { stateBus } from './core/StateBus.js';
import { Chapter1Scene } from './satellites/Chapter1/index.js';
import './style.css';

/**
 * SceneManager — 卫星场景管理器。
 *
 * 维护单一 WebGL 上下文，按需加载/销毁卫星场景（SceneBase 实例）。
 * 切换场景时严格销毁上一场景，落实「离开即释放」（Claude.md 四·4）。
 */
class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    /** @type {import('./shared/utils/SceneBase.js').SceneBase | null} */
    this.activeScene = null;

    this._initRenderer();
    this._initSceneGraph();
    this._initResize();
    this._detectPerformance();

    this._tick = this._tick.bind(this);
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // 深空蓝背景（Claude.md 第八节）
    this.renderer.setClearColor(0x0f172a, 1);
  }

  _initSceneGraph() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(0, 0, 0);

    // 基础光照：柔和环境光 + 一束方向光，供后续实体场景使用
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
    keyLight.position.set(3, 5, 4);
    this.scene.add(keyLight);
  }

  _initResize() {
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
  }

  /** 设备性能与形态探测，结果写入全站状态供降级策略读取（Claude.md 七）。 */
  _detectPerformance() {
    const cores = navigator.hardwareConcurrency || 4;
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    let tier = 'high';
    if (isMobile) tier = 'low';
    else if (cores <= 4) tier = 'mid';
    stateBus.setState({ performanceTier: tier, isMobile });
    console.info(`[SceneManager] 性能分级: ${tier} (cores=${cores}, mobile=${isMobile})`);
  }

  /**
   * 加载新场景，销毁当前场景。
   * @param {import('./shared/utils/SceneBase.js').SceneBase} scene
   */
  load(scene) {
    if (this.activeScene) {
      this.activeScene.dispose();
      this.activeScene = null;
    }
    if (scene) {
      scene.init({
        scene: this.scene,
        camera: this.camera,
        renderer: this.renderer,
        bus: stateBus
      });
      this.activeScene = scene;
    }
  }

  start() {
    this.renderer.setAnimationLoop(this._tick);
  }

  _tick() {
    const dt = this.clock.getDelta();
    const elapsed = this.clock.elapsedTime;
    if (this.activeScene) this.activeScene.update(dt, elapsed);
    this.renderer.render(this.scene, this.camera);
  }
}

/* ---- 应用初始化 ---- */
const canvas = document.getElementById('app-canvas');
const manager = new SceneManager(canvas);
manager.start();

// 加载第一章（核心模拟器阶段0：经典混沌）
manager.load(new Chapter1Scene());

// 暴露到全局，便于开发期调试与后续章节挂载
window.__app = { manager, stateBus };

console.info('[main] 核心管线就绪 — 第一章「经典混沌」已加载。');
