import * as THREE from 'three';
import gsap from 'gsap';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SceneBase } from '../../shared/utils/SceneBase.js';
import { Simulator, STAGE } from '../../core/Simulator.js';
import { WaveCanvas } from '../../shared/utils/WaveCanvas.js';
import { createGlassPanel, createButton, uiLayer } from '../../shared/components/ui.js';
import { createKnob } from '../../shared/components/Knob.js';
import { squareWaveCoefficient, synthesizeHarmonics } from '../../core/QuantumMath.js';

const MAX_HARMONICS = 20;
const INITIAL_HARMONICS = 5;

/**
 * 第二章：波的语言——傅里叶合成器（Claude.md 六·2 / design.md 第二章）。
 *
 * 幕A「谐波工作台」：用户用至多 20 个可调（振幅/相位）谐波合成目标方波，
 *   实时观察叠加曲线如何逼近，并在跳变处看到吉布斯过冲——它永不消失。
 * 幕B「带回核心」：合成完成后解锁 fourier 模块，核心模拟器升级到阶段1，
 *   将"任意形状 = 基本波的叠加"的语言带回盒子（模式分解器）。
 */
export class Chapter2Scene extends SceneBase {
  constructor() {
    super('chapter2');
    this._knobs = [];
    this._panels = [];
    this._harmonics = [];
    this._phase = 'workbench'; // 'workbench' | 'core'
  }

  onInit(ctx) {
    const { camera, renderer, bus } = ctx;
    this.bus = bus;

    // 默认载入前 N 个奇谐波的理想方波系数
    this._setHarmonicCount(INITIAL_HARMONICS);

    // 合成曲线画布 → 贴到正对相机的 3D 平面
    this.wave = new WaveCanvas({ xRange: [0, 1], yRange: [-0.5, 1.55] });
    const planeMat = new THREE.MeshBasicMaterial({
      map: this.wave.texture,
      transparent: true,
      toneMapped: false
    });
    this.wavePlane = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), planeMat);
    this.group.add(this.wavePlane);

    // 核心模拟器（幕B 才显形）
    this.simulator = new Simulator({ bus });
    this.simulator.group.visible = false;
    this.group.add(this.simulator.group);

    // 相机：幕A 正对平面、锁定旋转（2D 精度观测）
    camera.position.set(0, 0, 4.2);
    camera.lookAt(0, 0, 0);
    this.controls = this.track(new OrbitControls(camera, renderer.domElement));
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.enableRotate = false;
    this.controls.enablePan = false;
    this.controls.enableZoom = false;

    this._buildWorkbenchUI();
    this._redraw();
  }

  onUpdate(dt) {
    this.controls.update();
    if (this._phase === 'core') this.simulator.update(dt);
  }

  onDispose() {
    this._disposeKnobs();
    for (const p of this._panels) p.remove();
    this._panels.length = 0;
    this.simulator.dispose();
    this.wavePlane.geometry.dispose();
    this.wavePlane.material.dispose();
    this.wave.dispose();
    gsap.killTweensOf(this.wavePlane.material);
  }

  /* ---------- 谐波数据 ---------- */

  /** 设定谐波数量，按理想方波系数填充新增项。 */
  _setHarmonicCount(count) {
    const next = [];
    for (let k = 1; k <= count; k++) {
      const existing = this._harmonics[k - 1];
      next.push(
        existing ?? { n: 2 * k - 1, amplitude: squareWaveCoefficient(k), phase: 0 }
      );
    }
    this._harmonics = next;
  }

  /** 数值扫描当前合成曲线在 (0, 0.5] 的过冲峰。 */
  _currentPeak() {
    let bestX = 0;
    let bestV = -Infinity;
    const samples = 2000;
    for (let i = 1; i <= samples; i++) {
      const x = (i / samples) * 0.5;
      const v = synthesizeHarmonics(this._harmonics, x);
      if (v > bestV) {
        bestV = v;
        bestX = x;
      }
    }
    return { x: bestX, value: bestV };
  }

  /* ---------- 绘制 ---------- */

  _redraw() {
    const w = this.wave;
    w.clear();
    w.drawGrid();
    w.drawReferenceSquare();
    w.drawCurve((x) => synthesizeHarmonics(this._harmonics, x), {
      color: '#3b82f6',
      width: 3
    });
    const peak = this._currentPeak();
    w.drawMarker(peak.x, peak.value, peak.value.toFixed(3), { color: '#ef4444' });
    w.commit();
    this._updatePeakReadout(peak);
  }

  /* ---------- UI ---------- */

  _buildWorkbenchUI() {
    // 标题
    const title = createGlassPanel({
      className: 'ch2-title',
      html: `
        <div style="max-width:360px">
          <p style="font-size:13px;letter-spacing:2px;color:#94a3b8;margin-bottom:8px">第二章 · 波的语言</p>
          <h1 style="font-size:22px;font-weight:600;margin-bottom:8px">谐波工作台</h1>
          <p style="font-size:13px;color:#cbd5e1;line-height:1.6">
            用一排简单的正弦波，去合成那条"非此即彼"的方波。
            叠加越多，逼近越好——但请盯住跳变处。
          </p>
        </div>`,
      style: { position: 'fixed', left: '24px', top: '24px' }
    });
    this._panels.push(title);

    // 工作台主面板（右侧，含 N 控制 + 谐波旋钮 + 吉布斯读数 + 完成按钮）
    const bench = createGlassPanel({
      className: 'ch2-bench',
      style: {
        position: 'fixed',
        right: '24px',
        top: '50%',
        transform: 'translateY(-50%)',
        width: '320px',
        maxHeight: '86vh',
        overflowY: 'auto'
      }
    });
    this._panels.push(bench);
    this._bench = bench;

    // 谐波数量控制
    const countRow = document.createElement('div');
    Object.assign(countRow.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '12px'
    });
    const countLabel = document.createElement('span');
    countLabel.style.cssText = 'font-size:14px;color:#e2e8f0';
    const minus = createButton({ label: '−', onClick: () => this._changeCount(-1) });
    const plus = createButton({ label: '+', onClick: () => this._changeCount(1) });
    for (const b of [minus, plus]) Object.assign(b.style, { padding: '6px 14px' });
    this._countLabel = countLabel;
    countRow.append(minus, countLabel, plus);

    // 旋钮容器
    const knobWrap = document.createElement('div');
    this._knobWrap = knobWrap;

    // 吉布斯读数
    const readout = document.createElement('div');
    readout.className = 'font-mono';
    Object.assign(readout.style, {
      marginTop: '14px',
      padding: '12px',
      borderRadius: '10px',
      background: 'rgba(239,68,68,0.08)',
      border: '1px solid rgba(239,68,68,0.25)',
      fontSize: '13px',
      lineHeight: '1.6'
    });
    this._readout = readout;

    // 带回核心按钮
    const done = createButton({
      label: '将这门语言带回盒子 →',
      onClick: () => this._bringToCore()
    });
    Object.assign(done.style, { marginTop: '16px', width: '100%' });

    bench.append(countRow, knobWrap, readout, done);

    this._rebuildKnobs();
  }

  _changeCount(delta) {
    const n = Math.max(1, Math.min(MAX_HARMONICS, this._harmonics.length + delta));
    this._setHarmonicCount(n);
    this._rebuildKnobs();
    this._redraw();
  }

  _disposeKnobs() {
    for (const k of this._knobs) k.dispose();
    this._knobs.length = 0;
  }

  /** 依据当前谐波数重建旋钮行。 */
  _rebuildKnobs() {
    this._disposeKnobs();
    this._knobWrap.innerHTML = '';
    this._countLabel.textContent = `${this._harmonics.length} 个谐波`;

    this._harmonics.forEach((h, i) => {
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '8px 0',
        borderBottom: '1px solid rgba(148,163,184,0.1)'
      });
      const tag = document.createElement('span');
      tag.className = 'font-mono';
      tag.textContent = `n=${h.n}`;
      tag.style.cssText = 'font-size:13px;color:#94a3b8;width:42px';

      const ampKnob = createKnob({
        label: '振幅',
        min: 0,
        max: 1.4,
        value: h.amplitude,
        color: '#3b82f6',
        onChange: (v) => {
          h.amplitude = v;
          this._redraw();
        }
      });
      const phaseKnob = createKnob({
        label: '相位',
        min: -Math.PI,
        max: Math.PI,
        value: h.phase,
        color: '#8b5cf6',
        format: (v) => `${(v / Math.PI).toFixed(2)}π`,
        onChange: (v) => {
          h.phase = v;
          this._redraw();
        }
      });
      this._knobs.push(ampKnob, phaseKnob);
      row.append(tag, ampKnob.element, phaseKnob.element);
      this._knobWrap.appendChild(row);
    });
  }

  _updatePeakReadout(peak) {
    const overshoot = ((peak.value - 1) * 100).toFixed(1);
    this._readout.innerHTML = `
      <div style="color:#fca5a5;font-weight:600;margin-bottom:4px">吉布斯过冲</div>
      <div>过冲峰 ≈ <b>${peak.value.toFixed(3)}</b></div>
      <div>超出目标值 1 约 <b>${overshoot}%</b></div>
      <div style="margin-top:6px;color:#94a3b8;font-size:12px">
        谐波越多，过冲越窄却不消失——逼近永远在进行中。
      </div>`;
  }

  /* ---------- 幕B：带回核心模拟器（阶段1） ---------- */

  _bringToCore() {
    if (this._phase === 'core') return;
    this._phase = 'core';

    // 解锁傅里叶模块并升级核心模拟器
    this.simulator.unlock('fourier');

    // 淡出工作台 UI
    this._disposeKnobs();
    for (const p of this._panels) {
      gsap.to(p, { opacity: 0, duration: 0.5, ease: 'power2.in', onComplete: () => p.remove() });
    }
    this._panels = [];

    // 平面淡出 → 切换到阶段1 → 盒子淡入
    gsap.to(this.wavePlane.material, {
      opacity: 0,
      duration: 0.7,
      ease: 'power2.in',
      onComplete: () => {
        this.wavePlane.visible = false;
        this.simulator.setStage(STAGE.MODE_DECOMPOSITION);
        this.simulator.group.visible = true;

        // 开放 3D 观察盒中波形
        this.controls.enableRotate = true;
        this.controls.enableZoom = true;
        const { camera } = this.ctx;
        gsap.to(camera.position, { x: 0, y: 0.6, z: 4.8, duration: 1.2, ease: 'power2.out' });

        this._buildCoreUI();
      }
    });
  }

  _buildCoreUI() {
    const panel = createGlassPanel({
      className: 'ch2-core',
      html: `
        <div style="max-width:420px;text-align:center">
          <p style="font-size:13px;letter-spacing:2px;color:#8b5cf6;margin-bottom:8px">核心模拟器 · 阶段1 已解锁</p>
          <h2 style="font-size:20px;font-weight:600;margin-bottom:8px">模式分解器</h2>
          <p style="font-size:14px;color:#cbd5e1;line-height:1.7;margin-bottom:16px">
            盒中那条复杂的波，其实是几条简单驻波的叠加。<br/>
            <b style="color:#fff">混沌，是秩序的叠加。</b>
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

    const btnRow = document.createElement('div');
    Object.assign(btnRow.style, { display: 'flex', gap: '14px', justifyContent: 'center' });

    let exploded = false;
    const toggle = createButton({
      label: '分解 ▸',
      onClick: () => {
        exploded = !exploded;
        this.simulator.field.setExploded(exploded);
        toggle.textContent = exploded ? '◂ 合并' : '分解 ▸';
      }
    });
    const next = createButton({
      label: '下一程：无限的几何 →',
      onClick: () => this.bus.emit('navigate', { to: 3 })
    });
    btnRow.append(toggle, next);
    panel.querySelector('div').appendChild(btnRow);

    gsap.to(panel, { opacity: 1, duration: 1.2, ease: 'power2.out' });
  }
}
