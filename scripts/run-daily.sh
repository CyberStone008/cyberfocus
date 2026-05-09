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

{
  echo ""
  echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') ====="
  echo "[run-daily] node: $(command -v node) ($(node -v 2>/dev/null))"
  echo "[run-daily] claude: $(command -v claude)"
  USE_CLAUDE_CLI=true node scripts/pipeline.js
  PIPELINE_EXIT=$?
  echo "[run-daily] exit: $PIPELINE_EXIT"

  # Push updated data to GitHub so Actions can deploy the latest build
  if git diff --quiet data/; then
    echo "[run-daily] No data changes, skipping git push"
  else
    git add data/articles.json data/processed-ids.json data/sources.json data/daily/
    git commit -m "chore: daily update $(date '+%Y-%m-%d')"
    git push origin main && echo "[run-daily] Pushed to GitHub" || echo "[run-daily] git push failed"
  fi
} >> "$LOG_FILE" 2>&1
