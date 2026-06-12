/**
 * UI 微组件 — 可复用的玻璃拟态 DOM 构件。
 *
 * 所有 3D 之上的叠加 UI 统一经由此处创建，挂载到 #ui-layer，
 * 风格对齐 Claude.md 第八节（玻璃拟态、颜色系统、字体）。
 *
 * 约定：返回的元素由调用方负责在场景 dispose 时 remove，杜绝 DOM 泄漏。
 */

const UI_LAYER_ID = 'ui-layer';

/** 获取 UI 叠加层根节点。 */
export function uiLayer() {
  return document.getElementById(UI_LAYER_ID);
}

/**
 * 创建一个玻璃面板并挂载到 UI 层。
 * @param {object} [opts]
 * @param {string} [opts.html=''] 内部 HTML
 * @param {string} [opts.className=''] 追加类名（用于定位/尺寸）
 * @param {Partial<CSSStyleDeclaration>} [opts.style] 内联样式
 * @returns {HTMLDivElement}
 */
export function createGlassPanel({ html = '', className = '', style = {} } = {}) {
  const el = document.createElement('div');
  el.className = `glass-panel ${className}`.trim();
  el.innerHTML = html;
  Object.assign(el.style, { padding: '20px 24px', ...style });
  uiLayer().appendChild(el);
  return el;
}

/**
 * 创建一个量子蓝主题按钮。
 * @param {object} opts
 * @param {string} opts.label 文案
 * @param {(e:MouseEvent)=>void} opts.onClick 点击回调
 * @param {string} [opts.className]
 * @returns {HTMLButtonElement}
 */
export function createButton({ label, onClick, className = '' }) {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.className = className;
  Object.assign(btn.style, {
    cursor: 'pointer',
    padding: '12px 22px',
    borderRadius: '12px',
    border: '1px solid rgba(59,130,246,0.45)',
    background: 'rgba(59,130,246,0.12)',
    color: '#e2e8f0',
    font: '500 15px/1.2 Inter, system-ui, sans-serif',
    transition: 'background 0.2s ease, transform 0.2s ease, border-color 0.2s ease'
  });
  btn.addEventListener('mouseenter', () => {
    btn.style.background = 'rgba(59,130,246,0.28)';
    btn.style.borderColor = 'rgba(59,130,246,0.8)';
    btn.style.transform = 'translateY(-1px)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'rgba(59,130,246,0.12)';
    btn.style.borderColor = 'rgba(59,130,246,0.45)';
    btn.style.transform = 'translateY(0)';
  });
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}

/**
 * 设置元素绝对定位的便捷方法（相对视口居中等）。
 * @param {HTMLElement} el
 * @param {Partial<CSSStyleDeclaration>} pos
 */
export function place(el, pos) {
  Object.assign(el.style, { position: 'fixed', ...pos });
  return el;
}
