import { defineConfig } from 'vitest/config';

// 轻量单测护栏（v1 覆盖 date / dedupe / toc 三个纯逻辑痛点模块）。
// 刻意 globals:false——测试文件须显式 `import { describe, it, expect } from 'vitest'`，
// 这样不必把 vitest 全局类型塞进 tsconfig 的 types，next build 的 `**/*.ts`
// 类型检查就不会因缺全局类型而失败（详见 AGENTS.md〈superpowers 与 6 角色关系〉）。
export default defineConfig({
  test: {
    include: ['app/**/*.test.ts', 'scripts/**/*.test.js'],
    environment: 'node',
    globals: false,
  },
});
