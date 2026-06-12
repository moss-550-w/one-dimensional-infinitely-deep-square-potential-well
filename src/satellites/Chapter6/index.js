import * as THREE from 'three';
import gsap from 'gsap';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SceneBase } from '../../shared/utils/SceneBase.js';
import { Simulator, STAGE } from '../../core/Simulator.js';
import { createGlassPanel, createButton } from '../../shared/components/ui.js';

/**
 * 第六章：理性的边界——一份未完成的答卷（Claude.md 六·6 / design.md 第六章）。
 *
 * 回到阶段3的核心模拟器：粒子（波函数）仍在盒中按量子规则演化。界面多出一个
 * **灰暗、不可点击**的按钮「同时知道确切位置和动量」——它的禁用本身就是答案。
 * 三个开放式问题以 GSAP 缓入逐句浮现，只提问、不给答案，**不以句号收尾**（design.md）。
 */
const QUESTIONS = [
  '我们发明了希尔伯特空间，却发现它正好适用于量子世界。这是为什么？',
  '波函数是物理实在的完整清单，还是我们认知的边界？',
  '如果数学本身就有无法证明的真命题，我们又该如何理解物理理论里的"未解之谜"'
];

export class Chapter6Scene extends SceneBase {
  constructor() {
    super('chapter6');
    this._panels = [];
    this._tweens = [];
  }

  onInit(ctx) {
    const { camera, renderer, bus } = ctx;
    this.bus = bus;
    this.renderer = renderer;

    // 回到阶段3：完整量子模拟器，波函数持续演化（不可被"完全认识"）
    this.simulator = new Simulator({ bus });
    this.group.add(this.simulator.group);
    if (this.simulator.currentStage !== STAGE.QUANTUM_AXIOM) {
      this.simulator.setStage(STAGE.QUANTUM_AXIOM);
    }
    this.field = this.simulator.field;
    // 制备一个温和的叠加态，让 |ψ|² 持续干涉流动
    this.field.prepare([0.6, 0.55, 0.58]);

    camera.position.set(0, 0.3, 5.2);
    camera.lookAt(0, 0.1, 0);
    this.controls = this.track(new OrbitControls(camera, renderer.domElement));
    this.controls.target.set(0, 0.1, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 3.5;
    this.controls.maxDistance = 9;

    this._buildUI();
  }

  onUpdate(dt) {
    this.simulator.update(dt);
    this.controls.update();
  }

  onDispose() {
    for (const t of this._tweens) t.kill();
    this._tweens.length = 0;
    for (const p of this._panels) p.remove();
    this._panels.length = 0;
    this.simulator.dispose();
    gsap.killTweensOf(this.ctx?.camera?.position ?? {});
  }

  _buildUI() {
    // 顶部章节标记
    const head = createGlassPanel({
      className: 'ch6-head',
      html: `
        <div style="max-width:340px">
          <p style="font-size:13px;letter-spacing:2px;color:#94a3b8;margin-bottom:8px">第六章 · 理性的边界</p>
          <h1 style="font-size:21px;font-weight:600">一份未完成的答卷</h1>
        </div>`,
      style: { position: 'fixed', left: '24px', top: '24px', opacity: '0' }
    });
    this._panels.push(head);
    this._tweens.push(gsap.to(head, { opacity: 1, duration: 1.4, ease: 'power2.out' }));

    // 灰暗禁用按钮：不可点击，禁用即答案（Claude.md 六·6）
    const forbiddenWrap = createGlassPanel({
      className: 'ch6-forbidden',
      style: { position: 'fixed', right: '24px', top: '28px', padding: '14px 18px', opacity: '0' }
    });
    this._panels.push(forbiddenWrap);
    const forbidden = createButton({ label: '同时知道确切位置和动量', onClick: null });
    forbidden.disabled = true;
    Object.assign(forbidden.style, {
      cursor: 'not-allowed',
      color: '#475569',
      borderColor: 'rgba(71,85,105,0.4)',
      background: 'rgba(30,41,59,0.4)'
    });
    // 覆盖 hover 高亮，确保它保持灰暗
    forbidden.onmouseenter = null;
    forbidden.addEventListener('mouseenter', (e) => e.stopPropagation(), true);
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:11px;color:#64748b;margin-top:6px;text-align:center';
    hint.textContent = '这个按钮永远不会亮起';
    forbiddenWrap.append(forbidden, hint);
    this._tweens.push(gsap.to(forbiddenWrap, { opacity: 1, duration: 1.4, delay: 0.6, ease: 'power2.out' }));

    // 中央开放式问题：逐句缓入，最后一句无句号收尾
    const qPanel = createGlassPanel({
      className: 'ch6-questions',
      style: {
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%,-50%)',
        width: 'min(640px,90vw)',
        textAlign: 'center',
        background: 'rgba(15,23,42,0.35)'
      }
    });
    this._panels.push(qPanel);

    QUESTIONS.forEach((q, i) => {
      const line = document.createElement('p');
      line.textContent = q;
      Object.assign(line.style, {
        fontSize: '18px',
        lineHeight: '1.8',
        color: '#e2e8f0',
        margin: '0 0 22px',
        opacity: '0',
        transform: 'translateY(10px)'
      });
      qPanel.appendChild(line);
      this._tweens.push(
        gsap.to(line, {
          opacity: 1,
          y: 0,
          duration: 1.6,
          delay: 1.2 + i * 1.8,
          ease: 'power2.out'
        })
      );
    });

    // 收束语：无句号（design.md 六·结尾）
    const coda = document.createElement('p');
    coda.innerHTML = '盒中的粒子仍在演化，等待下一个思想者';
    Object.assign(coda.style, {
      fontSize: '14px',
      color: '#64748b',
      marginTop: '8px',
      opacity: '0'
    });
    qPanel.appendChild(coda);
    this._tweens.push(
      gsap.to(coda, { opacity: 1, duration: 2.0, delay: 1.2 + QUESTIONS.length * 1.8, ease: 'power2.out' })
    );

    // 重新开始入口（缓现，不打断沉思）
    const restartWrap = createGlassPanel({
      className: 'ch6-restart',
      style: { position: 'fixed', left: '50%', bottom: '4vh', transform: 'translateX(-50%)', padding: '12px 16px', opacity: '0' }
    });
    this._panels.push(restartWrap);
    const restart = createButton({
      label: '↻ 从起点再走一遍',
      onClick: () => this.bus.emit('navigate', { to: 1 })
    });
    restartWrap.appendChild(restart);
    this._tweens.push(
      gsap.to(restartWrap, { opacity: 1, duration: 1.6, delay: 2.0 + QUESTIONS.length * 1.8, ease: 'power2.out' })
    );
  }
}
