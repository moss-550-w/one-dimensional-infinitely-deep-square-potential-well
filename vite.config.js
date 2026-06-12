import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

// GLSL 导入插件用于直接 import .vert/.frag/.glsl 着色器源码；
// Web Worker 由 Vite 原生支持（new Worker(new URL(...), { type: 'module' })）。
//
// base：GitHub Pages 项目站点部署在 /<repo>/ 子路径下，资源需带此前缀。
// 本地 dev/test 用根路径 '/'，仅生产构建（Pages）注入仓库名前缀。
const REPO = 'one-dimensional-infinitely-deep-square-potential-well';
export default defineConfig(({ command }) => ({
  base: command === 'build' ? `/${REPO}/` : '/',
  plugins: [glsl()],
  server: {
    host: true,
    open: true
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
      output: {
        // 手动分块：把体积大、低频变动的第三方库拆离主包，
        // 配合 main.js 中章节的动态 import() 按需加载（plan.md M6）。
        manualChunks: {
          three: ['three', 'three/examples/jsm/controls/OrbitControls.js'],
          gsap: ['gsap']
        }
      }
    }
  }
}));
