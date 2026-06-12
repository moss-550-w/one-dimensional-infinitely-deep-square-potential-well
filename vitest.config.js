import { defineConfig } from 'vitest/config';

// 单测独立配置：不加载 vite.config.js 中的 glsl 插件，
// 避免其转换钩子干扰 .test.js 用例采集。核心库（StateBus/QuantumMath）
// 为纯逻辑，使用 node 环境即可；涉及 DOM 的场景测试后续单独指定 environment。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    globals: false
  }
});
