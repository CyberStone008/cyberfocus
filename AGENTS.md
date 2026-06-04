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
- **日期分组**：`SocialFeed` 和 `ReportFeed` 的 `getGroupDate()` **按文章发布日期 `publishedAt` 分组**——6/03 发布、6/04 抓取的文章归到 6/03，不是"今天"。用户明确要求按发布日期而非抓取日期。（绿色"新"徽章仍用 `fetchedAt` < 24h 判断。）前提是 `publishedAt` 必须准确——所以 OpenAI/Anthropic/Claude 抓取器都要提取真实发布日期（见各 fetcher 的 lastmod/datePublished 处理）。

### OpenAI 博客抓取：用真实发布日期，不能信 sitemap lastmod

`scripts/fetch/openai.js` 从 research sitemap 抓文章。**坑：sitemap 的 `<lastmod>` 是"最后修改"时间，不是发布时间**。OpenAI 改一篇旧文（如 2025-04 的 GPT-4.1、BrowseComp）会让 lastmod 变成最近 → 旧文当成新文涌入"最近"列表（曾出现 GPT-4.1 标成 2026-05-22）。

修复：对每个候选用 `fetchArticleWithImages` 抓正文 + `extractPublishDate()`（在 fetch-with-images.js，提取正文首部的 "Month DD, YYYY"）拿真实发布日期：
- 真实日期超过 `REAL_DATE_MAX_AGE_DAYS`(10天) → 跳过（被 re-touch 的旧文）
- 真实日期可得 → 用真实日期当 publishedAt；不可得 → 回退 lastmod
- OpenAI 页面是 JS 渲染，raw HTML 无日期，必须靠 fetch-with-images 的 curl 兜底拿到渲染后正文。

新增类似"靠 sitemap/lastmod"的博客源时注意同样的坑。

### 数据溯源铁律：生成内容禁止自行发挥

所有 AI 生成的分析/报告（策略快报、行业周报、季度宏观、行业深度、AI报告速览解读）**必须严格基于抓取到的真实数据**，禁止 LLM 凭空编造：

- **数字**只能来自实际抓取的行情/财报数据（Yahoo Finance、文章原文）。禁止编造价格、涨跌幅、估值倍数、点位。
- **事件/动态**只能来自实际抓取的新闻头条。禁止编造未出现的财报结果、公司动作。
- **机构观点**（Goldman/Morgan Stanley/Apollo Slok 等）只能来自实际抓到的、含该机构表态的新闻头条。**没抓到就整段省略，绝不虚构"某机构指出…"**。这是 DeepSeek/任何 LLM 最容易犯的错——我们曾出现过自动生成的快报编造 "Goldman 在最新报告指出…" 而该内容根本不在数据源里。
- **大师观点**（Howard Marks/Buffett）只能用其公认的"框架/方法论"做分析视角，不得虚构"最近说了某句/最新备忘录指出"。
- **不要编造支撑位/阻力位**等精确点位；只陈述行情里的真实数值，前瞻判断用定性语言。
- 数据不足时**如实写"本期数据有限"并少写**，宁可短，不要为凑字数发挥。

**实现方式**：`scripts/strategy-brief.js` 把行情(Yahoo)+新闻头条(Google News, 带 URL)作为"唯一允许的数据源"注入 prompt，并在 prompt 顶部列出铁律；新闻来源不足 3 条则直接中止生成（exit 3），不硬编。曾出现的事故：①range=1mo 时用 chartPreviousClose 把"月涨幅"当"日涨幅"，生成 "SMH 单日 +25%" 假数据（已修，改用真实日 K）；②DeepSeek 编造机构观点（已加铁律约束）。

新增任何"生成型"内容时，必须遵循同样的"只用抓取数据 + 来源可溯"原则。

### 翻译后端：默认且固定用 DeepSeek

所有翻译（文章标题/摘要、播客标题等，凡走 `translateBatch`）**默认用 DeepSeek**，不要改回智谱 CLI 或 Anthropic。

**后端优先级**（在 `scripts/translate/claude.js` 顶部决定）：
1. `DEEPSEEK_API_KEY` 已设 → **DeepSeek**（`api.deepseek.com`，OpenAI 兼容，`deepseek-chat`）← 标准后端
2. `USE_CLAUDE_CLI=true` → 本地 `claude` CLI（曾指向智谱 bigmodel.cn 网关，已弃用，欠费过）
3. `ANTHROPIC_API_KEY` → 官方 SDK（最贵 + 国内需代理，仅备用）

**关键实现细节**：
- key 存在 gitignored 的 `.env.local`（`DEEPSEEK_API_KEY=sk-...`），`run-daily.sh` 用 `set -a; . .env.local; set +a` 加载。**绝不提交 key**。
- DeepSeek 是**国内端点**，`scripts/translate/deepseek.js` 用独立 undici `Agent` dispatcher **绕过全局 xray 代理**（`setupProxy()` 装的 ProxyAgent 是给海外源用的，国内端点走代理反而慢/失败）。
- 为什么换掉智谱：智谱 bigmodel.cn 网关欠费返回 `429 code 1113 余额不足`，每次调用要等 ~200s 才超时失败。DeepSeek 单批 2 条仅 1.3s，中文质量更好，国内直连无需代理。

**抗内容污染**（`translateBatch` 自愈）：摘要含 markdown/代码块（如 `# 获取模型\nlemonade pull...`）会让模型照抄、毁掉整批 JSON 解析 → 整批 10 条全 null。`translateBatch` 检测到批内有 null 时，对失败项**逐条重试**；单条仍失败则**清空摘要只译标题**兜底。不要移除这个回退逻辑。

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
