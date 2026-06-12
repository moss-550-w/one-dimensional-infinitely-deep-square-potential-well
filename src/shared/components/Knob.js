/**
 * Knob — 可拖拽旋钮组件（玻璃拟态风格）。
 *
 * 用于傅里叶合成器谐波工作台：调节单个谐波的振幅或相位（Claude.md 六·2「以旋钮形式」）。
 * 交互：在旋钮上按住并上下拖动改变数值（上增下减），指针角度随值在 ±135° 间旋转。
 * 首次悬停有脉冲提示（Claude.md 八·引导性交互）。
 */

/**
 * @param {object} opts
 * @param {string} opts.label 顶部标签
 * @param {number} opts.min
 * @param {number} opts.max
 * @param {number} opts.value 初始值
 * @param {(v:number)=>void} opts.onChange
 * @param {number} [opts.size=52] 旋钮直径(px)
 * @param {(v:number)=>string} [opts.format] 数值显示格式化
 * @param {string} [opts.color='#3b82f6']
 * @returns {{element:HTMLElement, getValue:()=>number, setValue:(v:number)=>void, dispose:()=>void}}
 */
export function createKnob({
  label,
  min,
  max,
  value,
  onChange,
  size = 52,
  format = (v) => v.toFixed(2),
  color = '#3b82f6'
}) {
  let current = clamp(value, min, max);

  const element = document.createElement('div');
  Object.assign(element.style, {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    userSelect: 'none'
  });

  const cap = document.createElement('div');
  cap.textContent = label;
  Object.assign(cap.style, { fontSize: '11px', color: '#94a3b8', letterSpacing: '0.5px' });

  const knob = document.createElement('div');
  Object.assign(knob.style, {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    background: 'radial-gradient(circle at 50% 35%, rgba(51,65,85,0.9), rgba(15,23,42,0.95))',
    border: `2px solid ${color}66`,
    position: 'relative',
    cursor: 'ns-resize',
    touchAction: 'none',
    boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.4)'
  });

  const pointer = document.createElement('div');
  Object.assign(pointer.style, {
    position: 'absolute',
    left: '50%',
    top: '14%',
    width: '2px',
    height: '34%',
    background: color,
    borderRadius: '2px',
    transformOrigin: '50% 100%'
  });
  knob.appendChild(pointer);

  const valLabel = document.createElement('div');
  Object.assign(valLabel.style, {
    fontSize: '12px',
    color: '#e2e8f0',
    fontFamily: 'JetBrains Mono, monospace'
  });

  element.append(cap, knob, valLabel);

  function render() {
    // 值域映射到 [-135°, +135°]（270° 总扫角）
    const t = (current - min) / (max - min);
    const deg = -135 + t * 270;
    pointer.style.transform = `translateX(-50%) rotate(${deg}deg)`;
    valLabel.textContent = format(current);
  }
  render();

  // 拖拽：上移增大，灵敏度 = 全程对应 ~180px 拖动
  let dragging = false;
  let startY = 0;
  let startVal = 0;

  function onDown(e) {
    dragging = true;
    startY = e.clientY;
    startVal = current;
    knob.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }
  function onMove(e) {
    if (!dragging) return;
    const dv = ((startY - e.clientY) / 180) * (max - min);
    current = clamp(startVal + dv, min, max);
    render();
    onChange?.(current);
  }
  function onUp(e) {
    dragging = false;
    knob.releasePointerCapture?.(e.pointerId);
  }

  knob.addEventListener('pointerdown', onDown);
  knob.addEventListener('pointermove', onMove);
  knob.addEventListener('pointerup', onUp);
  knob.addEventListener('pointercancel', onUp);

  return {
    element,
    getValue: () => current,
    setValue: (v) => {
      current = clamp(v, min, max);
      render();
    },
    dispose() {
      knob.removeEventListener('pointerdown', onDown);
      knob.removeEventListener('pointermove', onMove);
      knob.removeEventListener('pointerup', onUp);
      knob.removeEventListener('pointercancel', onUp);
    }
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
