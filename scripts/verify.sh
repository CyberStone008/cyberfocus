#!/usr/bin/env bash
# verify.sh — 统一验证关卡（本地 npm run verify 与 CI 跑的是同一套）。
# 内容：① scripts 语法 ② workflow YAML 语法 ③ 数据校验器+坑扫描 ④ 双构建（静态导出 + server）。
# 任何一步失败立即退出非零。
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }

step "① scripts/ 语法检查"
fail=0
while IFS= read -r f; do
  node --check "$f" || { echo "❌ $f"; fail=1; }
done < <(find scripts -name '*.js' -o -name '*.mjs')
[ "$fail" = 0 ] && echo "✅ 全部通过"

step "② workflow YAML 语法"
for y in .github/workflows/*.yml; do
  python3 -c "import yaml,sys; yaml.safe_load(open('$y'))" || { echo "❌ $y"; exit 1; }
done
echo "✅ 全部通过"

step "③ 数据校验器 + 已知坑扫描"
node scripts/validate-data.js

step "④a 静态导出构建（GitHub Pages 模式，临时移除仅 Vercel 的动态路由）"
# 与 CI 的 Pages 构建一致：push 动态路由(force-dynamic)与 output:export 不兼容
RESTORE=""
if [ -d app/api/push ]; then
  TMP="$(mktemp -d)/push"; mv app/api/push "$TMP"; RESTORE="$TMP"
  trap '[ -n "$RESTORE" ] && [ -d "$RESTORE" ] && mv "$RESTORE" app/api/push' EXIT
fi
NEXT_EXPORT=1 npx next build --webpack
if [ -n "$RESTORE" ]; then mv "$RESTORE" app/api/push; RESTORE=""; trap - EXIT; fi
echo "✅ 静态导出 OK"

step "④b server 构建（Vercel 模式，含动态路由）"
npx next build --webpack
echo "✅ server 构建 OK"

printf '\n\033[1;32m✅ verify 全部通过\033[0m\n'
