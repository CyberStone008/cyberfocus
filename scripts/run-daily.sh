#!/bin/zsh
# Daily pipeline runner — invoked by launchd.
# Logs to logs/daily.log; appends timestamps for each run.

set -u
PROJECT_DIR="/Users/zhanglei/个人/Claude/ai-research-aggregator"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/daily.log"

mkdir -p "$LOG_DIR"
cd "$PROJECT_DIR"

# Load nvm so `node` is available under launchd (non-interactive shell)
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
fi

# Put common binary locations on PATH (node via nvm, claude via bun, gh, etc.)
export PATH="$HOME/.nvm/versions/node/v23.8.0/bin:$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# Load local secrets (DEEPSEEK_API_KEY, etc.) — .env.local is gitignored.
# Translation backend priority is decided in scripts/translate/claude.js:
#   DEEPSEEK_API_KEY set → DeepSeek; else USE_CLAUDE_CLI → claude CLI; else Anthropic SDK.
if [ -f "$PROJECT_DIR/.env.local" ]; then
  set -a
  # shellcheck source=/dev/null
  . "$PROJECT_DIR/.env.local"
  set +a
fi

# ── Proxy (CRITICAL) ──────────────────────────────────────────────────────────
# launchd runs this script in a non-interactive shell that does NOT inherit the
# user's HTTPS_PROXY. Without it, every foreign source (arXiv, HN, Reddit,
# Google News, DeepMind…) fails with `getaddrinfo ENOTFOUND` and the pipeline
# fetches 0 items. Hardcode the local xray/v2ray proxy here so the run never
# silently depends on inherited env. Port 10808 = local xray SOCKS/HTTP inbound.
export HTTPS_PROXY="http://127.0.0.1:10808"
export HTTP_PROXY="http://127.0.0.1:10808"

{
  echo ""
  echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') ====="
  echo "[run-daily] node: $(command -v node) ($(node -v 2>/dev/null))"
  echo "[run-daily] claude: $(command -v claude)"

  # Proxy health check — warn loudly if the local proxy isn't listening, so a
  # "0 items fetched" run is diagnosable from the log instead of silent.
  if curl -sS --max-time 8 -x "$HTTPS_PROXY" -o /dev/null -w "%{http_code}" https://arxiv.org 2>/dev/null | grep -q "200\|301\|302\|403"; then
    echo "[run-daily] proxy OK ($HTTPS_PROXY)"
  else
    echo "[run-daily] ⚠️  PROXY DOWN — $HTTPS_PROXY unreachable. Foreign sources will fail. Is xray running?"
  fi

  # Pull latest data before running so processed-ids stays in sync with cloud
  echo "[run-daily] Pulling latest data from GitHub..."
  git pull --rebase origin main && echo "[run-daily] git pull OK" || echo "[run-daily] git pull failed (continuing anyway)"

  USE_CLAUDE_CLI=true node scripts/pipeline.js
  PIPELINE_EXIT=$?
  echo "[run-daily] pipeline exit: $PIPELINE_EXIT"

  # Podcast pipeline (RSS fetch + transcript analysis)
  echo "[run-daily] Running podcast pipeline..."
  USE_CLAUDE_CLI=true node scripts/podcast-pipeline.js
  PODCAST_EXIT=$?
  echo "[run-daily] podcast exit: $PODCAST_EXIT"

  # 美股策略快报（本地管道版，替代 Claude Code routine）
  # 脚本自身判断"每 2 天 + 自动补跑"，无需在此 gate；用 DeepSeek 生成。
  echo "[run-daily] Running strategy brief..."
  node scripts/strategy-brief.js
  echo "[run-daily] strategy brief exit: $?"

  # Consider the overall run failed only if both pipelines failed
  if [ "$PIPELINE_EXIT" -ne 0 ] && [ "$PODCAST_EXIT" -ne 0 ]; then
    PIPELINE_EXIT=1
  else
    PIPELINE_EXIT=0
  fi
  echo "[run-daily] exit: $PIPELINE_EXIT"

  # Push updated data to GitHub so Actions can deploy the latest build
  if git diff --quiet data/; then
    echo "[run-daily] No data changes, skipping git push"
    PUSH_STATUS="无新内容"
  else
    NEW_COUNT=$(node -e "
      try {
        const arts = require('./data/articles.json');
        const cutoff = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
        console.log(arts.filter(a => a.fetchedAt && a.fetchedAt > cutoff).length);
      } catch { console.log('?'); }
    " 2>/dev/null)
    NEW_PODCAST=$(node -e "
      try {
        const eps = require('./data/podcasts.json');
        const cutoff = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
        console.log(eps.filter(e => e.fetchedAt && e.fetchedAt > cutoff).length);
      } catch { console.log('0'); }
    " 2>/dev/null)
    git add data/articles.json data/processed-ids.json data/sources.json data/daily/ data/podcasts.json data/strategy-briefs/ data/weekly-reports/ data/sector-reports/ data/macro-reports/
    git commit -m "chore: daily update $(date '+%Y-%m-%d')"
    git push origin main && echo "[run-daily] Pushed to GitHub" || echo "[run-daily] git push failed"
    PUSH_STATUS="文章 ${NEW_COUNT} · 播客 ${NEW_PODCAST}"
  fi
} >> "$LOG_FILE" 2>&1

# macOS 系统通知（在日志重定向块外执行，确保通知正常弹出）
if [ "$PIPELINE_EXIT" -eq 0 ]; then
  NOTIFY_MSG="${PUSH_STATUS:-完成}"
  osascript -e "display notification \"$NOTIFY_MSG\" with title \"CyberFocus 数据更新\" subtitle \"$(date '+%H:%M') 管道已完成\" sound name \"Glass\""
else
  osascript -e "display notification \"退出码 $PIPELINE_EXIT，请查看日志\" with title \"CyberFocus 管道异常\" sound name \"Basso\""
fi
