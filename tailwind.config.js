/** @type {import('tailwindcss').Config} */
// Tailwind 仅用于基础 UI 面板，不干扰 3D 画布。颜色系统对齐 Claude.md 第八节。
export default {
  content: ['./index.html', './src/**/*.{js,html}'],
  theme: {
    extend: {
      colors: {
        'deep-space': '#0f172a', // 深空蓝背景
        'quantum': '#3b82f6',    // 量子蓝
        'hilbert': '#8b5cf6',    // 希尔伯特紫
        'probability': '#ef4444' // 概率红
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      }
    }
  },
  plugins: []
};
