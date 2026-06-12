import * as THREE from 'three';
import { stateBus } from './core/StateBus.js';
import { PerfMonitor } from './core/PerfMonitor.js';
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

    // 运行时帧率监测：持续吃力则在静态探测基础上进一步降级，全站可读（plan.md M6）
    this.perf = new PerfMonitor({
      tier,
      onDowngrade: (newTier, fps) => {
        stateBus.setState({ performanceTier: newTier });
        console.warn(`[PerfMonitor] 帧率持续偏低(${fps.toFixed(0)}fps)，降级 → ${newTier}`);
      }
    });
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
    // 帧率监测与自动降级（结果经 StateBus 广播，场景下次构建即读到新分级）
    this.perf?.sample(dt);
    if (this.activeScene) this.activeScene.update(dt, elapsed);
    this.renderer.render(this.scene, this.camera);
  }
}

/* ---- 应用初始化 ---- */
const canvas = document.getElementById('app-canvas');
const manager = new SceneManager(canvas);
manager.start();

// 章节动态加载表：每章一个独立异步 chunk，进入时才下载（Claude.md 四·4 / plan.md M6）。
// 动态 import() 让首屏只加载第一章 + 核心，其余章节按需拉取，显著缩小首包。
const CHAPTER_LOADERS = {
  1: () => import('./satellites/Chapter1/index.js').then((m) => m.Chapter1Scene),
  2: () => import('./satellites/Chapter2/index.js').then((m) => m.Chapter2Scene),
  3: () => import('./satellites/Chapter3/index.js').then((m) => m.Chapter3Scene),
  4: () => import('./satellites/Chapter4/index.js').then((m) => m.Chapter4Scene),
  5: () => import('./satellites/Chapter5/index.js').then((m) => m.Chapter5Scene),
  6: () => import('./satellites/Chapter6/index.js').then((m) => m.Chapter6Scene)
};

// 导航代际计数：防止快速连点导致旧章节异步加载完成后覆盖新章节（竞态保护）。
let _navToken = 0;

/** 切换到指定章节：异步加载其 chunk，销毁当前场景并加载目标场景。 */
async function navigateTo(n) {
  const loader = CHAPTER_LOADERS[n];
  if (!loader) {
    console.warn(`[main] 第 ${n} 章尚未实现，导航忽略。`);
    return;
  }
  const token = ++_navToken;
  try {
    const Ctor = await loader();
    // 加载期间用户又点了别的章节 → 丢弃这次过期结果
    if (token !== _navToken) return;
    manager.load(new Ctor());
    stateBus.setState({ currentChapter: n });
    console.info(`[main] 已进入第 ${n} 章。`);
  } catch (err) {
    console.error(`[main] 第 ${n} 章加载失败:`, err);
  }
}

// 统一章节导航入口：任意场景通过 bus.emit('navigate', { to }) 请求切换
stateBus.on('navigate', ({ to }) => navigateTo(to));

// 从第一章启程
navigateTo(1);

// 暴露到全局，便于开发期调试与后续章节挂载
window.__app = { manager, stateBus, navigateTo };

console.info('[main] 核心管线就绪 — 思想之旅启程。');
