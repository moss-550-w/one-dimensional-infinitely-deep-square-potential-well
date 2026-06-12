import * as THREE from 'three';
import gsap from 'gsap';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SceneBase } from '../../shared/utils/SceneBase.js';
import { ForceLayout } from '../../core/ForceLayout.js';
import { makeTextSprite } from '../../shared/utils/textSprite.js';
import { createGlassPanel, createButton } from '../../shared/components/ui.js';
import { NODES, LINKS, RELATION, REFLECTION, GROUP_COLOR } from './graphData.js';

/**
 * 第五章：思想的长河——3D 力导向知识图谱（Claude.md 六·5 / design.md 第五章）。
 *
 * 节点为思想家与中心势阱；连线分四类彩色编码（启发/解决/挑战/独立发现）。
 * 用户可旋转探索、拖拽节点；点击连线中点的小圆点显示这条关系的诚实注解。
 * 哥德尔与海森堡之间**无连线**，其中点放置一个"?"热点——点击才浮现"理性的边界"反思。
 *
 * 布局由 ForceLayout（纯计算、确定性、已单测）驱动：进入即 warmup 到近稳态，
 * 之后每帧轻量步进让图谱"呼吸"，拖拽节点时实时跟手。
 */
export class Chapter5Scene extends SceneBase {
  constructor() {
    super('chapter5');
    this._panels = [];
    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._dragNode = null;
    this._nodeMeshes = new Map(); // id → mesh
    this._labels = new Map(); // id → sprite
    this._edges = []; // {line, dot, link, a, b}
    this._cooling = false;
  }

  onInit(ctx) {
    const { camera, renderer, bus } = ctx;
    this.renderer = renderer;
    this.bus = bus;

    // 力导向布局：进入前预热到近稳态，保证首帧即稳定（design.md 验收）
    this.layout = new ForceLayout({ nodes: NODES, links: LINKS });
    this.layout.getNode('well').pinned = true; // 中心势阱锚定在原点附近
    this.layout.setPosition('well', 0, 0, 0);
    this.layout.warmup(400);

    this.graph = new THREE.Group();
    this.graph.name = 'thought-graph';
    this.group.add(this.graph);

    this._buildNodes();
    this._buildEdges();
    this._buildReflectionHotspot();
    this._syncPositions();

    camera.position.set(0, 1.5, 11);
    camera.lookAt(0, 0, 0);
    this.controls = this.track(new OrbitControls(camera, renderer.domElement));
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 22;

    this._bindPointer();
    this._buildUI();
  }

  onUpdate() {
    // 轻量步进：拖拽时让其余节点缓慢自适应；静置时几乎不动（动能趋零）
    if (this._dragNode || this.layout.kineticEnergy() > 1e-4) {
      this.layout.step(0.999);
      this._syncPositions();
    }
    this.controls.update();
    // 标签始终面向相机由 Sprite 保证；连线中点圆点位置随节点更新
    this._billboardLabels();
  }

  onDispose() {
    for (const p of this._panels) p.remove();
    this._panels.length = 0;
    this._reflPulse?.kill();
    gsap.killTweensOf(this._noteEl ?? {});
    gsap.killTweensOf(this.ctx?.camera?.position ?? {});
    // group 内 geometry/material 由 SceneBase.dispose 递归释放；此处仅清引用
    this._nodeMeshes.clear();
    this._labels.clear();
    this._edges.length = 0;
  }

  /* ---------- 构建：节点 / 连线 / 反思热点 ---------- */

  _buildNodes() {
    for (const n of NODES) {
      const color = GROUP_COLOR[n.group] ?? 0x94a3b8;
      const geom = new THREE.SphereGeometry(0.16 * n.size, 20, 16);
      const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.userData = { type: 'node', id: n.id };
      // 柔光外晕：略大的半透明壳
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.24 * n.size, 16, 12),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, depthWrite: false })
      );
      mesh.add(halo);
      this.graph.add(mesh);
      this._nodeMeshes.set(n.id, mesh);

      const label = makeTextSprite(n.name, {
        color: '#e2e8f0',
        fontSize: n.group === 'core' ? 40 : 34,
        worldHeight: n.group === 'core' ? 0.34 : 0.26
      });
      this.graph.add(label);
      this._labels.set(n.id, label);
    }
  }

  _buildEdges() {
    for (const link of LINKS) {
      const rel = RELATION[link.relation];
      const color = rel.color;
      const a = this.layout.getNode(link.source);
      const b = this.layout.getNode(link.target);
      if (!a || !b) continue;

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(
        geom,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 })
      );
      this.graph.add(line);

      // 边中点可点击圆点：点开关系注解
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 12, 10),
        new THREE.MeshBasicMaterial({ color, toneMapped: false })
      );
      dot.userData = { type: 'edge', link, rel };
      this.graph.add(dot);

      this._edges.push({ line, dot, a, b });
    }
  }

  /** 哥德尔–海森堡中点的"?"反思热点（两者间无连线）。 */
  _buildReflectionHotspot() {
    const [idA, idB] = REFLECTION.pair;
    this._reflA = this.layout.getNode(idA);
    this._reflB = this.layout.getNode(idB);

    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.5, toneMapped: false })
    );
    dot.userData = { type: 'reflection' };
    this.graph.add(dot);
    this._reflDot = dot;

    const mark = makeTextSprite('?', { color: '#cbd5e1', fontSize: 48, worldHeight: 0.3 });
    this.graph.add(mark);
    this._reflMark = mark;

    // 脉冲提示该热点可交互（Claude.md 八·引导性交互）
    this._reflPulse = gsap.to(dot.scale, {
      x: 1.6,
      y: 1.6,
      z: 1.6,
      duration: 1.0,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut'
    });
  }

  /** 将布局坐标同步到所有 3D 对象。 */
  _syncPositions() {
    for (const [id, mesh] of this._nodeMeshes) {
      const n = this.layout.getNode(id);
      mesh.position.set(n.x, n.y, n.z);
    }
    for (const e of this._edges) {
      const pos = e.line.geometry.attributes.position.array;
      pos[0] = e.a.x; pos[1] = e.a.y; pos[2] = e.a.z;
      pos[3] = e.b.x; pos[4] = e.b.y; pos[5] = e.b.z;
      e.line.geometry.attributes.position.needsUpdate = true;
      e.line.geometry.computeBoundingSphere();
      e.dot.position.set((e.a.x + e.b.x) / 2, (e.a.y + e.b.y) / 2, (e.a.z + e.b.z) / 2);
    }
    if (this._reflDot) {
      const mx = (this._reflA.x + this._reflB.x) / 2;
      const my = (this._reflA.y + this._reflB.y) / 2;
      const mz = (this._reflA.z + this._reflB.z) / 2;
      this._reflDot.position.set(mx, my, mz);
      this._reflMark.position.set(mx, my + 0.25, mz);
    }
  }

  /** 标签悬浮在节点上方，偏移随节点尺寸。 */
  _billboardLabels() {
    for (const [id, label] of this._labels) {
      const mesh = this._nodeMeshes.get(id);
      const n = NODES.find((x) => x.id === id);
      label.position.set(mesh.position.x, mesh.position.y + 0.22 * (n?.size ?? 1) + 0.16, mesh.position.z);
    }
  }

  /* ---------- 交互 ---------- */

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
    this._setNdc(e);
    const hits = this._raycaster.intersectObjects(this.graph.children, false);
    const hit = hits.find((h) => h.object.userData?.type);
    if (!hit) return;
    const ud = hit.object.userData;

    if (ud.type === 'node') {
      // 开始拖拽节点：在过节点、垂直于相机视线的平面上跟手
      this._dragNode = ud.id;
      this.layout.setPinned(ud.id, true);
      this.controls.enabled = false;
      const np = this.layout.getNode(ud.id);
      this._dragPlane = new THREE.Plane();
      const camDir = new THREE.Vector3();
      this.ctx.camera.getWorldDirection(camDir);
      this._dragPlane.setFromNormalAndCoplanarPoint(camDir, new THREE.Vector3(np.x, np.y, np.z));
    } else if (ud.type === 'edge') {
      this._showEdgeNote(ud.link, ud.rel);
    } else if (ud.type === 'reflection') {
      this._showReflection();
    }
  }

  _onPointerMove(e) {
    if (!this._dragNode) return;
    this._setNdc(e);
    const target = new THREE.Vector3();
    if (this._raycaster.ray.intersectPlane(this._dragPlane, target)) {
      this.layout.setPosition(this._dragNode, target.x, target.y, target.z);
      this.layout.setPinned(this._dragNode, true);
      this._syncPositions();
    }
  }

  _onPointerUp() {
    if (this._dragNode) {
      // 中心势阱保持锚定，其余节点松手后回归布局
      if (this._dragNode !== 'well') this.layout.setPinned(this._dragNode, false);
      this._dragNode = null;
      this.controls.enabled = true;
    }
  }

  /* ---------- UI ---------- */

  _buildUI() {
    const title = createGlassPanel({
      className: 'ch5-title',
      html: `
        <div style="max-width:330px">
          <p style="font-size:13px;letter-spacing:2px;color:#94a3b8;margin-bottom:8px">第五章 · 思想的长河</p>
          <h1 style="font-size:21px;font-weight:600;margin-bottom:8px">一张交叉小径的网</h1>
          <p style="font-size:13px;color:#cbd5e1;line-height:1.6;margin-bottom:12px">
            思想不是单线因果。拖动节点，点击连线上的圆点，
            看它们之间究竟是哪一种关系。
          </p>
          <div style="display:flex;flex-direction:column;gap:5px;font-size:12px" id="ch5-legend"></div>
        </div>`,
      style: { position: 'fixed', left: '24px', top: '24px' }
    });
    this._panels.push(title);

    const legend = title.querySelector('#ch5-legend');
    for (const rel of [RELATION.INSPIRED, RELATION.SOLVED, RELATION.CHALLENGED, RELATION.INDEPENDENT, RELATION.CORE]) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px';
      row.innerHTML = `
        <span style="width:18px;height:3px;border-radius:2px;background:${hex(rel.color)}"></span>
        <span style="color:#cbd5e1">${rel.label}</span>`;
      legend.appendChild(row);
    }

    // 关系注解浮窗（点击边/反思热点时填充）
    this._noteEl = createGlassPanel({
      className: 'ch5-note',
      style: {
        position: 'fixed',
        right: '24px',
        top: '50%',
        transform: 'translateY(-50%)',
        width: '300px',
        opacity: '0',
        pointerEvents: 'none'
      }
    });
    this._panels.push(this._noteEl);

    const nextWrap = createGlassPanel({
      className: 'ch5-next',
      style: { position: 'fixed', left: '50%', bottom: '4vh', transform: 'translateX(-50%)', padding: '12px 16px' }
    });
    this._panels.push(nextWrap);
    const next = createButton({
      label: '最后一程：理性的边界 →',
      onClick: () => this.bus.emit('navigate', { to: 6 })
    });
    nextWrap.appendChild(next);
  }

  _showEdgeNote(link, rel) {
    const a = NODES.find((n) => n.id === link.source);
    const b = NODES.find((n) => n.id === link.target);
    this._noteEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="width:14px;height:14px;border-radius:50%;background:${hex(rel.color)}"></span>
        <span style="font-size:13px;color:${hex(rel.color)};font-weight:600">${rel.label}</span>
      </div>
      <div style="font-size:15px;font-weight:600;margin-bottom:8px">
        ${a.name} <span style="color:#64748b">→</span> ${b.name}
      </div>
      <p style="font-size:13px;color:#cbd5e1;line-height:1.7">${link.note}</p>`;
    this._flashNote('#cbd5e1');
  }

  _showReflection() {
    this._reflPulse?.kill();
    this._reflDot.material.opacity = 0.8;
    const body = REFLECTION.text.map((t) => `<p style="margin-bottom:8px">${t}</p>`).join('');
    this._noteEl.innerHTML = `
      <div style="font-size:12px;letter-spacing:2px;color:#94a3b8;margin-bottom:8px">哥德尔 ⟷ 海森堡 · 之间没有连线</div>
      <h2 style="font-size:18px;font-weight:600;margin-bottom:12px;color:#f1f5f9">${REFLECTION.title}</h2>
      <div style="font-size:13px;color:#cbd5e1;line-height:1.7">${body}</div>`;
    this._flashNote('#e2e8f0');
  }

  _flashNote() {
    gsap.killTweensOf(this._noteEl);
    gsap.fromTo(
      this._noteEl,
      { opacity: 0 },
      { opacity: 1, duration: 0.5, ease: 'power2.out' }
    );
  }
}

function hex(n) {
  return '#' + n.toString(16).padStart(6, '0');
}
