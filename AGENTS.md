<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

## 技术约束（踩过的坑，不要重踩）

### 构建：必须用 `--webpack`，不能用 Turbopack
`package.json` 的 `build` 脚本是 `next build --webpack`。原因：`scripts/pipeline.js` 里用了 `child_process.execFile` 调用 `curl`，Turbopack 会把 `spawn()` 数组里的字符串字面量当模块路径静态分析，导致 "Module not found" 构建失败。`--webpack` 绕过这个问题。

### 静态导出：用 `NEXT_EXPORT=1`，不用 `NODE_ENV`
`next.config.ts` 里以 `process.env.NEXT_EXPORT === '1'` 判断是否静态导出（`output: 'export'`）。GitHub Actions 构建步骤注入 `NEXT_EXPORT=1`，本地开发不注入，按需切换。不要改回用 `NODE_ENV === 'production'` 判断，会破坏本地 `npm run build`。

### API 路由：全部用 `force-static`
所有 `app/api/*/route.ts` 都必须有 `export const dynamic = 'force-static'`。`force-dynamic` 与 `output: 'export'` 不兼容，会导致静态构建报错。注意：该值必须是字符串字面量，不能用三元表达式，Turbopack/Next 要求静态可分析。

### Google News RSS：必须走 `curl`，不能用 Node.js `fetch`
`hr-orgs.js` 里所有 Google News 请求通过 `curlFetch()`（`child_process.execFileAsync('curl', ...)`）发出。Node.js 原生 `fetch` 在本机 TLS/网络环境下访问 Google News 会挂起或返回 503。

---

## 项目约定

### HR 机构动态（人服机构动态）数据管道

数据来源：`scripts/fetch/hr-orgs.js`，通过 Google News RSS 抓取 11 家机构（国际 5 家 + 国内 6 家）。

**双 query 模式**：每家机构运行两条查询：
- `newsQuery`：7 天回溯，抓一般资讯
- `reportQuery`：60 天回溯，专门捕获季度/年度报告（ManpowerGroup 就业前景、Randstad 薪酬报告等）

**噪声过滤**：`isNoise()` 函数过滤股票/投资者新闻（earnings call、shares sold 等）、高尔夫赛事（Korn Ferry Tour）、同名无关实体（Mercer University 等）。不通过则直接跳过，不写入结果。

**报告识别**：`isReportContent()` 检测 survey/outlook/白皮书/调研等关键词，命中则设 `docType: 'Report'`，`tags` 加入 `'研究报告'`。

**新增机构**：在 `ORG_CONFIGS` 数组加一条配置，填 `newsQuery`、`reportQuery`、`hl/gl/ceid`（语言/地区），以及在 `ORG_SLUG` 里加 slug 即可。

**前端**：`docType === 'Report'` 的卡片在 `ReportFeed` 中显示靛蓝色「报告」徽章；过滤栏有「仅报告」切换按钮。

---

### `fetchedAt` 字段与「新」徽章

Pipeline 在写入 `articles.json` 前，给每篇新文章打上 `fetchedAt: new Date().toISOString()`（ISO 字符串）。前端用途：
- **「新」徽章**：`fetchedAt` 距今 < 24 小时则显示绿色「新」标
- **日期分组**：`SocialFeed` 和 `ReportFeed` 的 `getGroupDate()` 函数取 `max(fetchedAt, publishedAt)` 作为分组日期——"我们第一次看到这篇是哪一天"是稳定的，不会随用户打开页面的时间漂移。不要改回"只在今天才归今天"的逻辑，那样昨天抓的文章今天打开会消失到 publishedAt 日期组里去。

### AI 内容过滤：必须用 word-boundary 正则，禁止 `includes('ai')`

凡是按关键词过滤"AI 相关"内容的 fetcher（HN、Reddit、Google News、爬虫、未来新增源），**关键词匹配一律走单词边界正则**，不要用朴素 `includes()`。

**踩过的坑**：`'ai'` 作为 2 字符子串会匹配 `airshow / aircraft / main / said / rain / claim / trail / fail / detail / available / dubai / thai / rails` 等无关词；`'rag'` 会匹配 `dragon / fragment / drag`；`'agent'` 会匹配 `agency / fragment`。一次清理掉了 36% 的 HN 误中。

**正确写法**（参考 `scripts/fetch/hackernews.js` 顶部 `AI_PATTERNS`）：

```js
const AI_PATTERNS = [
  // 短词必须 \b 边界
  /\bai\b/i,           // "AI" as standalone — 不是 airshow / aircraft
  /\bai[-/]/i,         // "AI-", "AI/" (例 "AI-powered")
  /agentic/i,
  /\bllm[s]?\b/i,
  /\bgpt[-0-9]?/i,
  /\bagi\b/i,
  /\brag\b/i,
  /\bagent[s]?\b/i,
  /\bvector\b/i,
  // 长且独特的词可以子串
  /claude/i, /gemini/i, /mistral/i, /llama/i,
  /openai/i, /anthropic/i, /deepmind/i, /chatgpt/i, /copilot/i,
  /diffusion/i, /transformer/i, /inference/i, /multimodal/i,
  /embedding/i, /hugging\s*face/i, /reinforcement/i, /fine[- ]?tun/i,
  /machine\s+learning/i, /deep\s+learning/i, /neural\s+net/i,
  /大模型/, /人工智能/, /生成式/,
];
const isAiRelated = (title, url) => AI_PATTERNS.some(re => re.test(title + ' ' + url));
```

**判断规则**：
- 关键词 ≤ 3 字符（ai / rag / agi / gpt / llm 等）→ 必须 `\b...\b` 或 `\b...[-/]`
- 关键词 4 字符但有歧义（agent → agency）→ 必须 `\b...\b`
- 关键词 ≥ 5 字符且独特（claude / openai / anthropic）→ 普通子串 OK
- 短语关键词（machine learning）→ 用 `\s+` 允许空白变体
- 中文关键词 → 直接子串，CJK 没有 word-boundary 概念

**新增 AI 信源的 checklist**：
1. 关键词列表用 `RegExp` 数组而非字符串数组
2. 写完后跑一次"误中扫描"：把现有 `articles.json` 同源数据用新过滤器跑一遍，目测前 20 条是否合理
3. 跑一次"漏抓扫描"：人工随机选 10 篇真 AI 文章，确认新过滤器都能命中

### Google AI News 标题去重

`ai-news-search.js` 和 `pipeline.js` 均有 `titleFingerprint()` 函数：取标题前 9 个有效词（保留 ASCII 字母数字和 CJK），转小写后拼接为指纹。同一故事被不同媒体报道时，指纹相同会被跳过，避免重复卡片。Pipeline 预加载已有 Google AI News 文章的指纹集合传入 fetcher。

### 系列文章展示（Series Card）

多章节/嵌套结构的文章（如书籍各章、报告系列）**不**平铺在时间轴中，统一使用**系列合并卡片（Series Card）**方案：

- 在 feed 中用 1 张卡片代表整个系列，卡片内嵌章节目录列表
- 每个章节条目可点击，跳转至对应全文页面（`/articles/[slug]`）
- 数据层：文章需有 `seriesSlug`（系列标识）和 `seriesOrder`（章节序号）字段
- 渲染层：`ReportFeed.tsx` 中 `groupedEntries` 逻辑自动合并相同 `seriesSlug` 的文章
- 系列元信息在 `ReportFeed.tsx` 顶部的 `SERIES_META` 对象中维护（标题、英文标题、作者）
- 如需新增系列，在 `SERIES_META` 中添加对应条目即可
