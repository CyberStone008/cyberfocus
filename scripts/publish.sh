#!/usr/bin/env bash
# 立即发布本地管理后台的数据改动(信源/报告/解读等)到线上。
#
# 本地管理(`npm run admin`)写的是 data/*.json。平时这些改动会由每日 10:00 的
# launchd 流水线 commit/push。当你改完信源想「马上」上线、不想等到 10:00 时,
# 跑 `npm run publish` 即可立刻提交并推送, Vercel 约 1 分钟内重建上线。
#
# 只提交 data/ 下的数据文件, 不碰代码。无改动时安全退出。
set -uo pipefail
cd "$(dirname "$0")/.."

# 与 run-daily.sh 同一组数据文件, 保持一致
git add \
  data/articles.json \
  data/processed-ids.json \
  data/sources.json \
  data/daily/ \
  data/podcasts.json \
  data/strategy-briefs/ \
  data/weekly-reports/ \
  data/sector-reports/ \
  data/macro-reports/ 2>/dev/null

if git diff --cached --quiet; then
  echo "[publish] data/ 无改动，无需发布。"
  exit 0
fi

echo "[publish] 即将发布以下数据改动："
git diff --cached --stat

git commit -m "chore: 手动数据更新 $(date '+%Y-%m-%d %H:%M')" >/dev/null
if git push origin main; then
  echo "[publish] ✓ 已推送。Vercel 将在 ~1 分钟内重建并上线。"
else
  echo "[publish] ✗ git push 失败，请检查网络/凭据后重试。"
  exit 1
fi
