import * as THREE from 'three';
import gsap from 'gsap';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SceneBase } from '../../shared/utils/SceneBase.js';
import { Simulator } from '../../core/Simulator.js';
import { createGlassPanel, createButton } from '../../shared/components/ui.js';

/**
 * 第一章：起点——一个简单的问题（Claude.md 六·1 / design.md 第一章）。
 *
 * 直接呈现核心模拟器阶段0：盒中经典粒子的混沌运动。
 * 中央抛出问题与两个选项；无论用户选哪个，都触发一个粒子"逃逸"飞向镜头，
 * 化作一行文字："要描述最简单的运动，我们首先需要一种语言。"
 *
 * 本章贡献：制造真实的认知困惑，确立"语言"作为后续全部数学工具的内生动机。
 */
export class Chapter1Scene extends SceneBase {
  constructor() {
    super('chapter1');
    this._answered = false;
    this._escapeMesh = null;
    this._panels = [];
  }

  onInit(ctx) {
    const { camera, renderer, bus } = ctx;
    this.bus = bus;

    // 核心模拟器（阶段0）
    this.simulator = new Simulator({ bus });
    this.group.add(this.simulator.group);

    // 相机与轨道控制（桌面端自由旋转，Claude.md 三）
    camera.position.set(0, 0.5, 4.8);
    camera.lookAt(0, 0, 0);
    this.controls = this.track(new OrbitControls(camera, renderer.domElement));
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 9;
    this.controls.enablePan = false;

    this._buildIntroUI();
  }

  onUpdate(dt) {
    this.simulator.update(dt);
    this.controls.update();
  }

  onDispose() {
    this.simulator.dispose();
    for (const p of this._panels) p.remove();
    this._panels.length = 0;
    if (this._escapeMesh) {
      this._escapeMesh.geometry.dispose();
      this._escapeMesh.material.dispose();
      if (this._escapeMesh.parent) this._escapeMesh.parent.remove(this._escapeMesh);
      this._escapeMesh = null;
    }
    gsap.killTweensOf(this);
  }

  /** 构建中央问题与两个选项。 */
  _buildIntroUI() {
    const panel = createGlassPanel({
      className: 'ch1-intro',
      html: `
        <div style="text-align:center;max-width:520px">
          <p style="font-size:13px;letter-spacing:2px;color:#94a3b8;margin-bottom:10px">第一章 · 起点</p>
          <h1 style="font-size:26px;font-weight:600;margin-bottom:6px">这里发生了什么？</h1>
          <p style="font-size:14px;color:#cbd5e1;margin-bottom:20px">盒中的粒子永不停歇地碰撞、反弹，没有尽头。</p>
        </div>
      `,
      style: {
        position: 'fixed',
        left: '50%',
        bottom: '6vh',
        transform: 'translateX(-50%)',
        opacity: '0'
      }
    });

    const btnRow = document.createElement('div');
    Object.assign(btnRow.style, {
      display: 'flex',
      gap: '16px',
      justifyContent: 'center',
      flexWrap: 'wrap'
    });
    const btnA = createButton({
      label: '它们遵循某种规律',
      onClick: () => this._triggerEscape()
    });
    const btnB = createButton({
      label: '这完全是随机的',
      onClick: () => this._triggerEscape()
    });
    btnRow.append(btnA, btnB);
    panel.querySelector('div').appendChild(btnRow);

    this._panels.push(panel);
    gsap.to(panel, { opacity: 1, duration: 1.2, delay: 0.4, ease: 'power2.out' });
  }

  /** 触发粒子逃逸动画：飞向镜头 → 化作文字。 */
  _triggerEscape() {
    if (this._answered) return;
    this._answered = true;

    const { camera, scene } = this.ctx;
    const field = this.simulator.field;
    const escapee = field?.pickEscapee();

    // 计算逃逸粒子的世界坐标作为动画起点
    const startWorld = escapee
      ? this.simulator.group.localToWorld(escapee.localPosition.clone())
      : new THREE.Vector3(0, 0, 0);

    // 独立发光球，挂到场景根，便于脱离盒子坐标系自由飞行
    const geo = new THREE.SphereGeometry(0.05, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true });
    this._escapeMesh = new THREE.Mesh(geo, mat);
    this._escapeMesh.position.copy(startWorld);
    scene.add(this._escapeMesh);

    // 终点：相机正前方近处（屏幕中心），制造"飞向镜头"的逼近感
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const target = camera.position.clone().add(forward.multiplyScalar(0.9));

    // 逃逸期间锁定轨道控制，保证终点稳定
    this.controls.enabled = false;

    // 先淡出问题面板
    this._panels.forEach((p) =>
      gsap.to(p, { opacity: 0, duration: 0.5, ease: 'power2.in', onComplete: () => p.remove() })
    );
    this._panels = [];

    const tl = gsap.timeline();
    // 1) 在盒内短暂游走，强调它本是混沌的一员
    tl.to(this._escapeMesh.position, {
      x: startWorld.x * 0.3,
      y: startWorld.y * 0.3 + 0.3,
      z: this.simulator.half.z,
      duration: 0.55,
      ease: 'power1.inOut'
    });
    // 2) 加速冲向镜头并放大
    tl.to(this._escapeMesh.position, {
      x: target.x,
      y: target.y,
      z: target.z,
      duration: 1.1,
      ease: 'power2.in'
    });
    tl.to(this._escapeMesh.scale, { x: 3, y: 3, z: 3, duration: 1.1, ease: 'power2.in' }, '<');
    // 3) 抵达后淡出粒子，浮现文字
    tl.to(this._escapeMesh.material, {
      opacity: 0,
      duration: 0.4,
      ease: 'power2.out',
      onComplete: () => this._revealMessage()
    });
  }

  /** 逃逸粒子化作的核心文字。 */
  _revealMessage() {
    const msg = createGlassPanel({
      className: 'ch1-message',
      html: `
        <div style="text-align:center;max-width:560px">
          <p style="font-size:22px;font-weight:500;line-height:1.7;color:#f1f5f9">
            要描述最简单的运动，<br/>我们首先需要一种<span style="color:#3b82f6">语言</span>。
          </p>
          <p style="margin-top:18px;font-size:13px;color:#64748b">
            混沌仍在盒中继续。下一程，我们去寻找这门语言。
          </p>
        </div>
      `,
      style: {
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%,-50%)',
        opacity: '0'
      }
    });
    this._panels.push(msg);

    // 通往第二章的出口：去寻找这门"语言"
    const btn = createButton({
      label: '寻找这门语言 →',
      onClick: () => this.bus.emit('navigate', { to: 2 })
    });
    btn.style.marginTop = '14px';
    msg.querySelector('div').appendChild(btn);

    gsap.to(msg, { opacity: 1, duration: 1.6, ease: 'power2.out' });

    // 恢复轨道控制，允许用户继续观察盒中持续的混沌
    this.controls.enabled = true;
  }
}
