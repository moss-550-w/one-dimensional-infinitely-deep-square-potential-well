import * as THREE from 'three';

/**
 * makeTextSprite — 生成始终朝向相机的文字标注 Sprite。
 *
 * 用于 3D 场景中的轴标注、维度标签等。文字绘制到离屏 Canvas，
 * 以 CanvasTexture 贴到 SpriteMaterial；depthTest 关闭以保证标注不被遮挡。
 *
 * 返回的 Sprite 持有的 texture/material 会在其被加入的 group dispose 遍历时释放。
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {string} [opts.color='#e2e8f0']
 * @param {number} [opts.fontSize=44] 像素字号（影响清晰度）
 * @param {number} [opts.worldHeight=0.18] 世界坐标下的标注高度
 * @returns {THREE.Sprite}
 */
export function makeTextSprite(text, { color = '#e2e8f0', fontSize = 44, worldHeight = 0.18 } = {}) {
  // 无 DOM 环境（如 node 单测）降级：返回无纹理占位 Sprite，保持 3D 结构完整、
  // 逻辑可测，而不依赖 Canvas 2D API。浏览器中走下方正常文字渲染路径。
  if (typeof document === 'undefined') {
    return new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
  }

  const font = `${fontSize}px JetBrains Mono, monospace`;
  const pad = Math.round(fontSize * 0.3);

  // 先测量文字宽度
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = font;
  const textW = Math.ceil(measure.measureText(text).width);

  const canvas = document.createElement('canvas');
  canvas.width = textW + pad * 2;
  canvas.height = fontSize + pad * 2;
  const ctx = canvas.getContext('2d');
  ctx.font = font; // resize 后需重设
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, pad, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  const aspect = canvas.width / canvas.height;
  sprite.scale.set(worldHeight * aspect, worldHeight, 1);
  return sprite;
}
