import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

// GLSL 导入插件用于直接 import .vert/.frag/.glsl 着色器源码；
// Web Worker 由 Vite 原生支持（new Worker(new URL(...), { type: 'module' })）。
export default defineConfig({
  plugins: [glsl()],
  server: {
    host: true,
    open: true
  },
  build: {
    target: 'es2020',
    sourcemap: true
  }
});
