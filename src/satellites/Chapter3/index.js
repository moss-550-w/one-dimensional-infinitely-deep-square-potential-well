import * as THREE from 'three';
import gsap from 'gsap';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SceneBase } from '../../shared/utils/SceneBase.js';
import { Simulator, STAGE } from '../../core/Simulator.js';
import { HilbertProjection } from '../../core/HilbertProjection.js';
import { WaveCanvas } from '../../shared/utils/WaveCanvas.js';
import { createGlassPanel, createButton } from '../../shared/components/ui.js';
import {
  basisFunction,
  basisProduct,
  innerProduct,
  partialInnerProduct
} from '../../core/QuantumMath.js';

/**
 * 第三章：无限的几何——希尔伯特空间投影（Claude.md 六·3 / design.md 第三章）。
 *
 * 幕A「类比模型」：永久标注"三维类比：函数即向量"。用户拖动矢量（端点严格约束在
 *   单位球面 = 归一化），看三分量即傅里叶系数；选两个基观察其乘积积分如何相消为 0
 *   （正交性）；第4/5维以折叠螺旋出现，明示类比的边界。
 * 幕B「带回核心」：解锁 hilbert 模块，核心模拟器升级阶段2，矢量↔波形实时对应。
 */
export class Chapter3Scene extends SceneBase {
  constructor() {
    super('chapter3');
    this._panels = [];
    this._phase = 'lab'; // 'lab' | 'core'
    this._dragging = false;
    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._activeProj = null;
    this._orthoTween = null;
  }

  onInit(ctx) {
    const { camera, renderer, bus } = ctx;
    this.bus = bus;
    this.renderer = renderer;

    // 幕A 独立投影（教学交互）
    this.proj = new HilbertProjection({
      coeffs: [0.6, 0.5, 0.62],
      onChange: (c) => this._updateCoeffReadout(c)
    });
    this.group.add(this.proj.group);
    this._activeProj = this.proj;

    // 核心模拟器（幕B 才显形）
    this.simulator = new Simulator({ bus });
    this.simulator.group.visible = false;
    this.group.add(this.simulator.group);

    // 相机：透视观察投影，允许旋转
    camera.position.set(2.8, 1.9, 3.4);
    camera.lookAt(0, 0, 0);
    this.controls = this.track(new OrbitControls(camera, renderer.domElement));
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 2.5;
    this.controls.maxDistance = 9;

    this._buildPermanentLabel();
    this._buildLabUI();
    this._bindPointer();

    // 端点把手首次脉冲提示，引导拖拽
    this._pulse = gsap.to(this.proj.handle.scale, {
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
    if (this._phase === 'core') this.simulator.update(dt);
  }

  onDispose() {
    for (const p of this._panels) p.remove();
    this._panels.length = 0;
    this._pulse?.kill();
    this._orthoTween?.kill();
    if (this.proj) this.proj.dispose();
    this.simulator.dispose();
    if (this.orthoWave) this.orthoWave.dispose();
    gsap.killTweensOf(this.ctx?.camera?.position ?? {});
  }

  /* ---------- 指针交互（拖拽矢量，球面约束） ---------- */

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
    if (!this._activeProj) return;
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
  }

  _onPointerUp() {
    if (this._dragging) {
      this._dragging = false;
      this.controls.enabled = true;
    }
  }

  /* ---------- 永久标签（不可关闭） ---------- */

  _buildPermanentLabel() {
    const label = createGlassPanel({
      className: 'ch3-permalabel',
      html: `<div style="text-align:center">
        <span style="font-size:15px;color:#a78bfa;letter-spacing:1px">三维类比：</span>
        <span style="font-size:15px;color:#e2e8f0;font-weight:600">函数即向量</span>
      </div>`,
      style: {
        position: 'fixed',
        left: '50%',
        top: '18px',
        transform: 'translateX(-50%)',
        padding: '10px 22px'
      }
    });
    this._panels.push(label);
  }

  /* ---------- 幕A：实验室 UI ---------- */

  _buildLabUI() {
    const panel = createGlassPanel({
      className: 'ch3-lab',
      style: {
        position: 'fixed',
        left: '24px',
        top: '50%',
        transform: 'translateY(-50%)',
        width: '380px',
        maxHeight: '88vh',
        overflowY: 'auto'
      }
    });
    this._panels.push(panel);

    panel.innerHTML = `
      <p style="font-size:13px;letter-spacing:2px;color:#94a3b8;margin-bottom:8px">第三章 · 无限的几何</p>
      <h1 style="font-size:21px;font-weight:600;margin-bottom:10px">把波，看成一个向量</h1>
      <p style="font-size:13px;color:#cbd5e1;line-height:1.6;margin-bottom:14px">
        拖动白色端点（它始终贴在单位球面上——这就是归一化）。
        三个分量，正是 ψ 在 sin(nπx/L) 上的傅里叶系数。
      </p>
      <div id="coeff-readout" class="font-mono" style="padding:10px;border-radius:10px;
        background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.25);
        font-size:13px;line-height:1.7;margin-bottom:16px"></div>
      <hr style="border:none;border-top:1px solid rgba(148,163,184,0.15);margin:14px 0"/>
      <h2 style="font-size:15px;font-weight:600;margin-bottom:6px;color:#c4b5fd">正交性：为什么系数是唯一的</h2>
      <p style="font-size:12px;color:#94a3b8;line-height:1.5;margin-bottom:10px">
        选两个基，看它们乘积的积分。正负面积恰好相消 → 内积为 0 → 彼此独立。
      </p>
      <div id="ortho-controls" style="display:flex;gap:18px;margin-bottom:10px"></div>
      <div id="ortho-canvas-wrap" style="border-radius:10px;overflow:hidden;margin-bottom:8px"></div>
      <div id="ortho-result" class="font-mono" style="font-size:13px;color:#e2e8f0"></div>
    `;
    this._readoutEl = panel.querySelector('#coeff-readout');

    this._buildOrthoControls(panel.querySelector('#ortho-controls'));

    // 正交演示画布（直接以 2D Canvas 嵌入面板）
    this.orthoWave = new WaveCanvas({ width: 540, height: 260, yRange: [-1.2, 1.2], pad: 30 });
    this.orthoWave.canvas.style.width = '100%';
    this.orthoWave.canvas.style.display = 'block';
    panel.querySelector('#ortho-canvas-wrap').appendChild(this.orthoWave.canvas);
    this._resultEl = panel.querySelector('#ortho-result');

    // 底部完成按钮
    const done = createGlassPanel({
      className: 'ch3-done',
      style: {
        position: 'fixed',
        left: '50%',
        bottom: '5vh',
        transform: 'translateX(-50%)',
        padding: '14px 18px'
      }
    });
    this._panels.push(done);
    const btn = createButton({
      label: '把这套几何带回盒子 →',
      onClick: () => this._bringToCore()
    });
    done.appendChild(btn);

    this._updateCoeffReadout(this.proj.getCoefficients());
    this._orthoMN = [1, 2];
    this._runOrthogonalityDemo(1, 2);
  }

  _buildOrthoControls(host) {
    const mkGroup = (title, onPick) => {
      const wrap = document.createElement('div');
      wrap.innerHTML = `<div style="font-size:11px;color:#94a3b8;margin-bottom:4px">${title}</div>`;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px';
      const btns = [1, 2, 3].map((v) => {
        const b = createButton({ label: String(v), onClick: () => onPick(v, btns) });
        Object.assign(b.style, { padding: '6px 12px' });
        row.appendChild(b);
        return b;
      });
      wrap.appendChild(row);
      host.appendChild(wrap);
      return btns;
    };
    const refresh = () => this._runOrthogonalityDemo(this._orthoMN[0], this._orthoMN[1]);
    this._mBtns = mkGroup('基 m', (v) => {
      this._orthoMN[0] = v;
      refresh();
    });
    this._nBtns = mkGroup('基 n', (v) => {
      this._orthoMN[1] = v;
      refresh();
    });
  }

  _updateCoeffReadout(c) {
    const norm = Math.hypot(c[0], c[1], c[2]);
    this._readoutEl.innerHTML = `
      c₁ = <b style="color:#3b82f6">${c[0].toFixed(3)}</b>
      c₂ = <b style="color:#8b5cf6">${c[1].toFixed(3)}</b>
      c₃ = <b style="color:#22d3ee">${c[2].toFixed(3)}</b><br/>
      ‖ψ‖ = √(c₁²+c₂²+c₃²) = <b>${norm.toFixed(3)}</b> <span style="color:#64748b">(恒为 1)</span>`;
  }

  /* ---------- 正交性演示（乘积曲线 + 积分扫描归零动画） ---------- */

  _runOrthogonalityDemo(m, n) {
    this._orthoTween?.kill();
    const w = this.orthoWave;
    const productFn = (x) => basisProduct(m, n, x);

    const drawBase = (upper) => {
      w.clear();
      w.drawGrid();
      // 两个基函数（淡）
      w.drawCurve((x) => basisFunction(m, x), { color: 'rgba(59,130,246,0.45)', width: 2 });
      w.drawCurve((x) => basisFunction(n, x), { color: 'rgba(139,92,246,0.45)', width: 2 });
      // 乘积曲线与正负填充（扫描到 upper）
      w.drawFilledCurve(productFn, { upper });
      w.drawCurve(productFn, { color: '#ffffff', width: 2.5 });
      w.commit();
    };

    // 扫描动画：积分上限从 0 推进到 1，运行积分逐步结算
    const state = { u: 0 };
    drawBase(0.0001);
    this._orthoTween = gsap.to(state, {
      u: 1,
      duration: 1.8,
      ease: 'none',
      onUpdate: () => {
        drawBase(state.u);
        const running = partialInnerProduct(m, n, state.u);
        this._resultEl.innerHTML = `运行积分 (2/L)∫₀ˣ … = <b>${running.toFixed(3)}</b>`;
      },
      onComplete: () => {
        const result = innerProduct(m, n);
        const orthogonal = Math.abs(result) < 1e-3;
        this._resultEl.innerHTML = orthogonal
          ? `⟨${m}|${n}⟩ = <b style="color:#22c55e">0</b> — 正交！两个基彼此独立。`
          : `⟨${m}|${n}⟩ = <b style="color:#f59e0b">${result.toFixed(3)}</b> — 同一个基，内积为 1。`;
      }
    });
  }

  /* ---------- 幕B：带回核心阶段2 ---------- */

  _bringToCore() {
    if (this._phase === 'core') return;
    this._phase = 'core';
    this._pulse?.kill();
    this._orthoTween?.kill();

    this.simulator.unlock('hilbert');

    // 淡出实验室面板（保留顶部永久标签）
    const permaLabel = this._panels[0];
    for (const p of this._panels.slice(1)) {
      gsap.to(p, { opacity: 0, duration: 0.5, ease: 'power2.in', onComplete: () => p.remove() });
    }
    this._panels = [permaLabel];

    // 淡出独立投影 → 切换阶段2 → 显示核心投影+波形
    gsap.to(this.proj.group.scale, {
      x: 0.01,
      y: 0.01,
      z: 0.01,
      duration: 0.6,
      ease: 'power2.in',
      onComplete: () => {
        this.proj.dispose();
        this.group.remove(this.proj.group);
        this.proj = null;

        this.simulator.setStage(STAGE.GEOMETRIC_PROJECTION);
        this.simulator.group.visible = true;
        // 幕B 仍可拖拽：接管核心模拟器内的投影
        this._activeProj = this.simulator.field.projection;

        this._buildCoreUI();
      }
    });
  }

  _buildCoreUI() {
    const panel = createGlassPanel({
      className: 'ch3-core',
      html: `
        <div style="max-width:440px;text-align:center">
          <p style="font-size:13px;letter-spacing:2px;color:#8b5cf6;margin-bottom:8px">核心模拟器 · 阶段2 已解锁</p>
          <h2 style="font-size:20px;font-weight:600;margin-bottom:8px">几何的视角</h2>
          <p style="font-size:14px;color:#cbd5e1;line-height:1.7;margin-bottom:16px">
            拖动矢量，盒底的波形随之改变。<br/>
            <b style="color:#fff">函数即向量，分解即投影。</b><br/>
            <span style="font-size:12px;color:#64748b">但请记得——真正的空间有无穷多个轴，这只是路标。</span>
          </p>
        </div>`,
      style: {
        position: 'fixed',
        left: '50%',
        bottom: '5vh',
        transform: 'translateX(-50%)',
        opacity: '0'
      }
    });
    this._panels.push(panel);

    const next = createButton({
      label: '下一程：微观的实在 →',
      onClick: () => this.bus.emit('navigate', { to: 4 })
    });
    next.style.marginTop = '6px';
    panel.querySelector('div').appendChild(next);

    gsap.to(panel, { opacity: 1, duration: 1.2, ease: 'power2.out' });
  }
}
