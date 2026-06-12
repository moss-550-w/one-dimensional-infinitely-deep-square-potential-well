import * as THREE from 'three';
import gsap from 'gsap';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SceneBase } from '../../shared/utils/SceneBase.js';
import { Simulator, STAGE } from '../../core/Simulator.js';
import { WaveCanvas } from '../../shared/utils/WaveCanvas.js';
import { createGlassPanel, createButton } from '../../shared/components/ui.js';
import { createKnob } from '../../shared/components/Knob.js';
import {
  eigenEnergy,
  energyProbabilities,
  collapseToEigenstate,
  isCoefficientSetNormalized,
  gaussianPacket,
  gaussianMomentumStd,
  momentumDensity,
  weightedStd
} from '../../core/QuantumMath.js';

const AXIS_COLORS = ['#3b82f6', '#8b5cf6', '#22d3ee'];
const MOMENTUM_P = 140; // 动量轴半幅 [-P, P]

/**
 * 第四章：微观的实在——量子公理剧场（Claude.md 六·4 / design.md 第四章）。
 *
 * 幕A「公理剧场」：核心模拟器升级到阶段3。拖拽希尔伯特矢量制备态 ψ=Σcₙψₙ，
 *   盒中实时演化复波函数与概率密度云；点「测量」按 |cₙ|² 概率坍缩到某本征态——
 *   一次性、不可逆，唯有「重置」可回到制备态。这是量子公理最赤裸的操作。
 * 幕B「动量与不确定性」：切到动量表象（位置波函数的傅里叶变换）。压缩位置波包，
 *   动量谱自动展宽，定量显示 Δx·Δp ≥ ħ/2——海森堡下界。
 */
export class Chapter4Scene extends SceneBase {
  constructor() {
    super('chapter4');
    this._panels = [];
    this._phase = 'theater'; // 'theater' | 'momentum'
    this._dragging = false;
    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._collapsed = false;
    this._sigma = 0.07;
    this._posWave = null;
    this._momWave = null;
    this._knob = null;
  }

  onInit(ctx) {
    const { camera, renderer, bus } = ctx;
    this.bus = bus;
    this.renderer = renderer;

    // 核心模拟器 → 阶段3（量子公理）。解锁测量假设并持久化进度。
    this.simulator = new Simulator({ bus });
    this.group.add(this.simulator.group);
    this.simulator.unlock('measurement');
    this.simulator.setStage(STAGE.QUANTUM_AXIOM);
    this.field = this.simulator.field; // QuantumAxiomField
    this._activeProj = this.field.projection;

    // 相机：俯观盒中波函数与上方制备矢量，允许旋转
    camera.position.set(0, 0.4, 5);
    camera.lookAt(0, 0.2, 0);
    this.controls = this.track(new OrbitControls(camera, renderer.domElement));
    this.controls.target.set(0, 0.2, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 10;

    this._bindPointer();
    this._buildTheaterUI();

    // 阶段2→3 转场：矢量与波函数从无到有"生长"出来
    this.simulator.group.scale.setScalar(0.6);
    this.simulator.group.position.y = -0.3;
    gsap.to(this.simulator.group.scale, { x: 1, y: 1, z: 1, duration: 1.0, ease: 'power2.out' });
    gsap.to(this.simulator.group.position, { y: 0, duration: 1.0, ease: 'power2.out' });

    // 端点把手脉冲提示，引导拖拽制备
    this._pulse = gsap.to(this.field.projection.handle.scale, {
      x: 1.5,
      y: 1.5,
      z: 1.5,
      duration: 0.85,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut'
    });
  }

  onUpdate(dt) {
    this.controls.update();
    this.simulator.update(dt);
  }

  onDispose() {
    for (const p of this._panels) p.remove();
    this._panels.length = 0;
    this._pulse?.kill();
    this._knob?.dispose();
    this.simulator.dispose();
    this._posWave?.dispose();
    this._momWave?.dispose();
    gsap.killTweensOf(this.ctx?.camera?.position ?? {});
    if (this.simulator?.group) {
      gsap.killTweensOf(this.simulator.group.scale);
      gsap.killTweensOf(this.simulator.group.position);
    }
  }

  /* ---------- 指针交互：拖拽制备矢量（坍缩后锁定，呼应不可逆） ---------- */

  _bindPointer() {
    const el = this.renderer.domElement;
    this.listen(el, 'pointerdown', (e) => this._onPointerDown(e));
    this.listen(el, 'pointermove', (e) => this._onPointerMove(e));
    this.listen(el, 'pointerup', () => this._onPointerUp());
    this.listen(el, 'pointercancel', () => this._onPointerUp());
  }

  _setNdc(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._ndc, this.ctx.camera);
  }

  _onPointerDown(e) {
    if (this._phase !== 'theater' || !this._activeProj) return;
    // 已坍缩：测量不可逆，禁止再拖拽制备，须先重置
    if (this._collapsed) return;
    this._setNdc(e);
    const hit = this._raycaster.intersectObject(this._activeProj.handle, false);
    if (hit.length > 0) {
      this._dragging = true;
      this.controls.enabled = false;
      this._pulse?.kill();
      this._activeProj.handle.scale.setScalar(1);
    }
  }

  _onPointerMove(e) {
    if (!this._dragging || !this._activeProj) return;
    this._setNdc(e);
    this._activeProj.dragToRay(this._raycaster);
    this._refreshTheaterReadout();
  }

  _onPointerUp() {
    if (this._dragging) {
      this._dragging = false;
      this.controls.enabled = true;
    }
  }

  /* ---------- 幕A：量子公理剧场 UI ---------- */

  _buildTheaterUI() {
    const title = createGlassPanel({
      className: 'ch4-title',
      html: `
        <div style="max-width:340px">
          <p style="font-size:13px;letter-spacing:2px;color:#94a3b8;margin-bottom:8px">第四章 · 微观的实在</p>
          <h1 style="font-size:22px;font-weight:600;margin-bottom:8px">量子公理剧场</h1>
          <p style="font-size:13px;color:#cbd5e1;line-height:1.6">
            拖动上方矢量，即制备一个量子态。盒中白线是 Re ψ，青线是 Im ψ，
            蓝色云是概率密度 |ψ|²，它随时间干涉、流动。
          </p>
        </div>`,
      style: { position: 'fixed', left: '24px', top: '24px' }
    });
    this._panels.push(title);

    const panel = createGlassPanel({
      className: 'ch4-control',
      style: {
        position: 'fixed',
        right: '24px',
        top: '50%',
        transform: 'translateY(-50%)',
        width: '330px',
        maxHeight: '88vh',
        overflowY: 'auto'
      }
    });
    this._panels.push(panel);
    panel.innerHTML = `
      <h2 style="font-size:15px;font-weight:600;margin-bottom:8px;color:#c4b5fd">制备态 ψ = Σ cₙ ψₙ</h2>
      <div id="ch4-coeff" class="font-mono" style="padding:10px;border-radius:10px;
        background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.25);
        font-size:13px;line-height:1.7;margin-bottom:12px"></div>
      <h2 style="font-size:14px;font-weight:600;margin-bottom:6px;color:#e2e8f0">能量测量的概率 Pₙ = |cₙ|²</h2>
      <div id="ch4-prob" style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px"></div>
      <div id="ch4-result" class="font-mono" style="min-height:42px;padding:10px;border-radius:10px;
        background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.22);
        font-size:13px;line-height:1.5;margin-bottom:12px;color:#fca5a5">
        尚未测量。测量是一次性的、不可逆的概率坍缩。
      </div>
      <div id="ch4-actions" style="display:flex;gap:10px;flex-wrap:wrap"></div>
    `;
    this._coeffEl = panel.querySelector('#ch4-coeff');
    this._probEl = panel.querySelector('#ch4-prob');
    this._resultEl = panel.querySelector('#ch4-result');

    // 概率条（n=1,2,3）
    this._probBars = [0, 1, 2].map((i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px';
      const tag = document.createElement('span');
      tag.className = 'font-mono';
      tag.textContent = `n=${i + 1}`;
      tag.style.cssText = `font-size:12px;color:${AXIS_COLORS[i]};width:34px`;
      const track = document.createElement('div');
      track.style.cssText =
        'flex:1;height:10px;border-radius:6px;background:rgba(148,163,184,0.15);overflow:hidden';
      const fill = document.createElement('div');
      fill.style.cssText = `height:100%;width:0%;background:${AXIS_COLORS[i]};transition:width 0.25s ease`;
      track.appendChild(fill);
      const val = document.createElement('span');
      val.className = 'font-mono';
      val.style.cssText = 'font-size:12px;color:#94a3b8;width:46px;text-align:right';
      row.append(tag, track, val);
      this._probEl.appendChild(row);
      return { fill, val };
    });

    // 操作按钮：测量 / 重置 / 暂停演化 / 进入动量实验室
    const actions = panel.querySelector('#ch4-actions');
    this._measureBtn = createButton({ label: '测量（能量）', onClick: () => this._measure() });
    Object.assign(this._measureBtn.style, {
      borderColor: 'rgba(239,68,68,0.5)',
      background: 'rgba(239,68,68,0.14)'
    });
    this._resetBtn = createButton({ label: '重置', onClick: () => this._reset() });
    this._resetBtn.disabled = true;
    this._resetBtn.style.opacity = '0.45';

    let evolving = true;
    this._evolveBtn = createButton({
      label: '⏸ 暂停演化',
      onClick: () => {
        evolving = !evolving;
        this.field.setEvolving(evolving);
        this._evolveBtn.textContent = evolving ? '⏸ 暂停演化' : '▶ 继续演化';
      }
    });
    actions.append(this._measureBtn, this._resetBtn, this._evolveBtn);

    const nextWrap = createGlassPanel({
      className: 'ch4-next',
      style: {
        position: 'fixed',
        left: '50%',
        bottom: '4vh',
        transform: 'translateX(-50%)',
        padding: '12px 16px'
      }
    });
    this._panels.push(nextWrap);
    const next = createButton({
      label: '换一种问法：动量与不确定性 →',
      onClick: () => this._enterMomentumLab()
    });
    nextWrap.appendChild(next);

    this._refreshTheaterReadout();
  }

  /** 刷新制备态系数读数、归一化校验与概率条。 */
  _refreshTheaterReadout() {
    const c = this.field.getCoefficients();
    const sumSq = c.reduce((a, v) => a + v * v, 0);
    const normalized = isCoefficientSetNormalized(c);
    this._coeffEl.innerHTML = `
      c₁=<b style="color:${AXIS_COLORS[0]}">${c[0].toFixed(3)}</b>
      c₂=<b style="color:${AXIS_COLORS[1]}">${c[1].toFixed(3)}</b>
      c₃=<b style="color:${AXIS_COLORS[2]}">${c[2].toFixed(3)}</b><br/>
      Σ|cₙ|² = <b>${sumSq.toFixed(6)}</b>
      <span style="color:${normalized ? '#22c55e' : '#f59e0b'}">${normalized ? '✓ 已归一' : '✗'}</span>`;

    const probs = energyProbabilities(c);
    this._probBars.forEach((bar, i) => {
      const p = probs[i] ?? 0;
      bar.fill.style.width = `${(p * 100).toFixed(1)}%`;
      bar.val.textContent = `${(p * 100).toFixed(1)}%`;
    });
  }

  /** 概率性测量坍缩（不可逆，Claude.md 六·4 红线）。 */
  _measure() {
    if (this._collapsed) return;
    const c = this.field.getCoefficients();
    const idx = collapseToEigenstate(c); // 按 |cₙ|² 加权随机
    this.field.collapse(idx);
    this._collapsed = true;
    this._pulse?.kill();
    this._activeProj.handle.scale.setScalar(1);

    const n = idx + 1;
    const E = eigenEnergy(n);
    this._resultEl.style.color = '#bbf7d0';
    this._resultEl.innerHTML = `
      坍缩 → 本征态 <b style="color:${AXIS_COLORS[idx]}">ψ${sub(n)}</b><br/>
      测得能量 Eₙ = n²π²ħ²/2mL² = <b>${E.toFixed(3)}</b><br/>
      <span style="color:#94a3b8">态已变为纯 ψ${sub(n)}（不可逆）。重置可回到制备态。</span>`;

    // 概率条更新为坍缩后的纯态分布（100% 集中）
    this._refreshTheaterReadout();
    // 锁定测量，开放重置
    this._measureBtn.disabled = true;
    this._measureBtn.style.opacity = '0.45';
    this._resetBtn.disabled = false;
    this._resetBtn.style.opacity = '1';
  }

  /** 重置到制备态——测量不可逆的唯一例外。 */
  _reset() {
    if (!this._collapsed) return;
    this.field.reset();
    this._collapsed = false;
    this._resultEl.style.color = '#fca5a5';
    this._resultEl.innerHTML = '已重置到制备态。可重新拖拽矢量，或再次测量。';
    this._refreshTheaterReadout();
    this._measureBtn.disabled = false;
    this._measureBtn.style.opacity = '1';
    this._resetBtn.disabled = true;
    this._resetBtn.style.opacity = '0.45';
  }

  /* ---------- 幕B：动量表象与不确定性 ---------- */

  _enterMomentumLab() {
    if (this._phase === 'momentum') return;
    this._phase = 'momentum';
    this._pulse?.kill();

    // 淡出剧场 UI 与核心 3D
    for (const p of this._panels) {
      gsap.to(p, { opacity: 0, duration: 0.45, ease: 'power2.in', onComplete: () => p.remove() });
    }
    this._panels = [];
    gsap.to(this.simulator.group.scale, {
      x: 0.01,
      y: 0.01,
      z: 0.01,
      duration: 0.5,
      ease: 'power2.in',
      onComplete: () => {
        this.simulator.group.visible = false;
        this._buildMomentumUI();
      }
    });
  }

  _buildMomentumUI() {
    const title = createGlassPanel({
      className: 'ch4-mom-title',
      html: `
        <div style="max-width:360px">
          <p style="font-size:13px;letter-spacing:2px;color:#94a3b8;margin-bottom:8px">第四章 · 动量表象</p>
          <h1 style="font-size:21px;font-weight:600;margin-bottom:8px">同一个态，两种语言</h1>
          <p style="font-size:13px;color:#cbd5e1;line-height:1.6">
            动量表象，就是位置波函数的<b style="color:#fff">傅里叶变换</b>
            φ(p)=∫ψ(x)e<sup>−ipx/ħ</sup>dx。<br/>
            压缩位置波包，看动量谱如何被迫展宽。
          </p>
        </div>`,
      style: { position: 'fixed', left: '24px', top: '24px', opacity: '0' }
    });
    this._panels.push(title);

    const panel = createGlassPanel({
      className: 'ch4-mom',
      style: {
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%,-50%)',
        width: 'min(680px,92vw)',
        opacity: '0'
      }
    });
    this._panels.push(panel);
    panel.innerHTML = `
      <div style="display:flex;gap:18px;flex-wrap:wrap;justify-content:center">
        <div style="flex:1;min-width:280px">
          <div style="font-size:12px;color:#93c5fd;margin-bottom:4px">位置空间 |ψ(x)|²</div>
          <div id="ch4-pos-wrap" style="border-radius:10px;overflow:hidden"></div>
        </div>
        <div style="flex:1;min-width:280px">
          <div style="font-size:12px;color:#c4b5fd;margin-bottom:4px">动量空间 |φ(p)|²（数值傅里叶变换）</div>
          <div id="ch4-mom-wrap" style="border-radius:10px;overflow:hidden"></div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:24px;margin-top:14px;flex-wrap:wrap;justify-content:center">
        <div id="ch4-sigma"></div>
        <div id="ch4-uncertainty" class="font-mono" style="font-size:13px;line-height:1.8"></div>
      </div>
    `;

    // 双谱画布
    this._posWave = new WaveCanvas({ width: 420, height: 240, xRange: [0, 1], yRange: [0, 1.2], pad: 28 });
    this._momWave = new WaveCanvas({
      width: 420,
      height: 240,
      xRange: [-MOMENTUM_P, MOMENTUM_P],
      yRange: [0, 1.2],
      pad: 28
    });
    for (const [w, id] of [
      [this._posWave, '#ch4-pos-wrap'],
      [this._momWave, '#ch4-mom-wrap']
    ]) {
      w.canvas.style.cssText = 'width:100%;display:block';
      panel.querySelector(id).appendChild(w.canvas);
    }
    this._uncertEl = panel.querySelector('#ch4-uncertainty');

    // σ 旋钮：压缩/展宽位置波包
    this._knob = createKnob({
      label: 'Δx 宽度 σ',
      min: 0.03,
      max: 0.14,
      value: this._sigma,
      color: '#3b82f6',
      format: (v) => v.toFixed(3),
      onChange: (v) => {
        this._sigma = v;
        this._drawMomentumLab();
      }
    });
    panel.querySelector('#ch4-sigma').appendChild(this._knob.element);

    // 结语 + 通往第五章
    const outro = createGlassPanel({
      className: 'ch4-outro',
      style: {
        position: 'fixed',
        left: '50%',
        bottom: '4vh',
        transform: 'translateX(-50%)',
        padding: '12px 16px',
        opacity: '0'
      }
    });
    this._panels.push(outro);
    const next = createButton({
      label: '下一程：思想的长河 →',
      onClick: () => this.bus.emit('navigate', { to: 5 })
    });
    outro.appendChild(next);

    this._drawMomentumLab();
    for (const p of [title, panel, outro]) {
      gsap.to(p, { opacity: 1, duration: 0.9, ease: 'power2.out' });
    }
  }

  /** 重绘双谱并计算 Δx·Δp。 */
  _drawMomentumLab() {
    const sigma = this._sigma;
    const x0 = 0.5;
    const psi = (x) => gaussianPacket(x, x0, sigma);

    // 位置谱：|ψ(x)|²，归一到峰值=1 仅作形状展示
    let posMax = 0;
    for (let i = 0; i <= 200; i++) {
      const v = psi(i / 200) ** 2;
      if (v > posMax) posMax = v;
    }
    posMax = posMax || 1;
    const posFn = (x) => (psi(x) ** 2) / posMax;
    this._posWave.clear();
    this._posWave.drawFilledCurve(posFn, { posColor: 'rgba(59,130,246,0.30)', samples: 200 });
    this._posWave.drawCurve(posFn, { color: '#3b82f6', width: 2.5, samples: 200 });
    this._posWave.commit();

    // 动量谱：预采样 |φ(p)|²（数值傅里叶变换），插值绘制 + 求标准差
    const N = 120;
    const dens = new Float64Array(N + 1);
    const ps = new Array(N + 1);
    let momMax = 0;
    for (let i = 0; i <= N; i++) {
      const p = -MOMENTUM_P + (2 * MOMENTUM_P * i) / N;
      ps[i] = p;
      const d = momentumDensity(psi, p, 0, 1, { steps: 240 });
      dens[i] = d;
      if (d > momMax) momMax = d;
    }
    momMax = momMax || 1;
    const momFn = (p) => {
      const t = ((p + MOMENTUM_P) / (2 * MOMENTUM_P)) * N;
      const i = Math.max(0, Math.min(N - 1, Math.floor(t)));
      const f = t - i;
      return (dens[i] * (1 - f) + dens[i + 1] * f) / momMax;
    };
    this._momWave.clear();
    this._momWave.drawFilledCurve(momFn, { posColor: 'rgba(139,92,246,0.30)', samples: 240 });
    this._momWave.drawCurve(momFn, { color: '#8b5cf6', width: 2.5, samples: 240 });
    this._momWave.commit();

    // 数值不确定度：位置由 [0,1] 网格、动量由动量网格的加权标准差
    const xs = [];
    const wx = [];
    for (let i = 0; i <= 200; i++) {
      const x = i / 200;
      xs.push(x);
      wx.push(psi(x) ** 2);
    }
    const dx = weightedStd(xs, wx).std;
    const dp = weightedStd(ps, Array.from(dens)).std;
    const product = dx * dp;
    const theoryDp = gaussianMomentumStd(sigma); // ħ/(2σ)

    this._uncertEl.innerHTML = `
      Δx ≈ <b style="color:#93c5fd">${dx.toFixed(3)}</b> &nbsp;
      Δp ≈ <b style="color:#c4b5fd">${dp.toFixed(2)}</b><br/>
      Δx·Δp ≈ <b style="color:#fff">${product.toFixed(3)}</b>
      <span style="color:#94a3b8">（下界 ħ/2 = 0.5）</span><br/>
      <span style="font-size:11px;color:#64748b">理论 Δp=ħ/2σ=${theoryDp.toFixed(2)}；压缩 Δx 必使 Δp 增大。</span>`;
  }
}

/** 数字转下标字符（1→₁）。 */
function sub(n) {
  const map = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
  return String(n)
    .split('')
    .map((d) => map[d] ?? d)
    .join('');
}
