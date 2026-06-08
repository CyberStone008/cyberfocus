<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

## 变更记录

> 每条规则都已落到代码里、**每次抓取/构建自动执行**；本记录用于追溯与防止误改回退。详情见对应章节。

### 2026-06-08

1. **云端定时（晨跑提前+双批兜底）**：cron 改为 `0 20`(北京 04:00 主批)+`0 21`(05:00 兜底)+`12 1,4,7,10,13`(日内每 3h)。GitHub cron 常漂移 1~2.5h/偶尔丢批，提前到 04:00 即便漂 +2h 也在 6 点前跑完，确保「8 点前就绪」。见〈云端 workflow 跑批〉。
2. **Bark 通知加固**：每个定时批次 + 手动触发都推（`continue-on-error`，绝不拖垮 build/deploy）；统一 `bark_push()`——**curl 必须 `|| echo 000` 兜底**（否则 `bash -e` 下 curl 超时 exit 28 会崩掉整步、重试都跑不到，这是 06-08 排查出的真因），回显 HTTP 码 + 重试 4 次。新增→📰active、无新→📭passive、失败→⚠️timeSensitive。见〈数据溯源铁律〉后的 Bark 段。
3. **播客新增 3 源**：`张小珺商业访谈录`(zh)、`No Priors`(en)、`硅谷101`(zh)，见 `scripts/fetch/podcasts.js` 的 `FEEDS`。解读逻辑通用化(不再写死 Lex)且守溯源铁律（无逐字稿源严禁编造、附来源声明）。UI「顶级播客」→「精选播客」。
4. **卡片「结论先行」主题说明 `tldrZh`（四模块）**：报告(基于全文)、播客(基于官方简介/Lex逐字稿)、新闻(抓原文正文)。**守数据溯源铁律**：只在拿到真实素材时生成，数字必须逐字出现在素材里；**拿不到素材就退回原文本（标题/副标题/原摘要）、绝不硬编**。详见〈数据溯源铁律〉下三段（report-tldr / 播客 / 新闻）。
   - 常态化入口：报告→`pipeline.js` 生成全文后顺带；播客→`podcast-pipeline.js` 抓到新集顺带；新闻→workflow `Run news TL;DR (capped)` 步骤每批 `MAX=25`（最近优先、抓不到的 Google News 等跳过）。

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
- **日期分组（分板块两套口径）**：
  - **`SocialFeed`（AI精选热点）+ AI日报**：`getGroupDate()` 按**发布日期 `publishedAt`** 分组——高频、发布日期准确且新近，6/03 发布、6/04 抓取的归到 6/03。前提是 `publishedAt` 必须准确（OpenAI/Anthropic/Claude 抓取器都提取真实发布日期，见各 fetcher 的 lastmod/datePublished 处理）。
  - **`ReportFeed`（AI报告速览 + 人服机构动态）**：`getGroupDate()` 按**收录日期 `fetchedAt`** 分组（缺失时回退 publishedAt）。原因：这两个板块是**低频源**，抓到的内容发布日期常是几天前（HR 走 Google News 尤其滞后），按发布日期分组会让新抓到的内容沉进过去、"今天"永远空。用户拍板：报告/机构按"今天新抓到的"展示，社交/日报保持发布日期。改动见 `ReportFeed.tsx` 的 `getGroupDate` 与 `seriesAnchorDate`。
  - 两者的绿色"新"徽章都仍用 `fetchedAt` < 24h 判断。单条卡片上显示的日期 `cardDate` 仍是真实 `publishedAt`（所以"今天"组里可能出现一张标着旧发布日期的卡，正常——它是今天才被收录的）。

### 日期分组必须按北京时间（UTC+8），禁止 `iso.slice(0,10)`

所有 feed 的日期分组/「今天·昨天」标签**统一走 `app/lib/date.ts` 的 `getDateKey/todayKey/yesterdayKey`**（固定 +8h 偏移，中国无夏令时；构建端 UTC 与浏览器端结果一致）。

**踩过的坑**：原本各 feed 各写一份 `getDateKey(iso)=iso.slice(0,10)`，截的是 **UTC 日期**。`publishedAt` 存的是 `...Z`，于是凌晨/晚间美国发布的内容（如 `2026-06-04T20:30Z` 实为北京 6/05 04:30）被错分到前一天——早上看「今天」几乎空（曾只剩 3 条，实应 32 条），全堆进「昨天」。同样地 `formatDatePill` 用 `new Date().toISOString().slice(0,10)` 取「今天/昨天」也是 UTC，必须改用 `todayKey()/yesterdayKey()`。

**规则**：任何把时间戳转成「YYYY-MM-DD 日期键」或判断「今天/昨天」的地方，一律用 `lib/date.ts`，不要再 `iso.slice(0,10)` 或 `toISOString().slice(0,10)`。单条卡片的日期标签（ArticleCard/Header/Footer、ReportFeed cardDate）也已统一，保证与分组一致。

> 注：`data/daily/YYYY-MM-DD.json` 快照文件名的日期由 pipeline（Node）决定，与前端分组是两套；如发现 AI 日报按文件名分日也有跨日偏移，需在 pipeline 侧同样按北京时间命名。

### Anthropic 抓取：覆盖 news + research + engineering（别只抓 /news/）

`scripts/fetch/anthropic.js` 从 `sitemap.xml` 抓。**坑：原来只认 `/news/` 路径**，结果把 sitemap 里的 **`/research/`(123 篇) + `/engineering/`(25 篇)** 官方文章全漏了（如 introspection、measuring-agent-autonomy、how-we-contain-claude 等重要研究都没进库）。已改为 `BLOG_SECTIONS = ['/news/','/research/','/engineering/','/institute/']`。

- `/institute/`（Anthropic Institute 新板块，如 `recursive-self-improvement`）**目前不在 sitemap.xml 里**，所以 sitemap 抓取器拿不到——等 Anthropic 收录后会自动抓到（已预置该前缀）。这类文章现在只能靠 HN/Google News 捡漏，或手动「添加报告」。
- 上限：`MAX_CANDIDATES=25`（每次最多取页数）、`MAX_PER_SOURCE`(默认20，每源每次最多新增)。首次扩展会一次补入近期被漏的研究文章，之后只增新的。

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

**报告卡片一句话主题（`tldrZh`）同此铁律**（`scripts/translate/report-tldr.js`）：AI 精华报告卡片那行描述原用 `abstractZh`，但博客类常抓到网站通用 meta 描述（"Anthropic 是一家…公司"）无法说明本文。故新增 `tldrZh`——**基于真实全文 `contentMd` 生成的一句话（≤60字）主题概述**，prompt 强约束只依据正文、禁止编造数字/结论。卡片显示优先级 `tldrZh ?? abstractZh ?? abstractEn`（`ReportFeed.tsx`）。生成时机：pipeline 生成全文后顺带产出；历史回填用 `node scripts/backfill-report-tldr.js`（每篇即时落盘可续跑）。`toReportItem` 用 `...rest` 展开，`tldrZh` 自动随投影下发。

**精选播客卡片同样用 `tldrZh`**（`generateReportTldr` 通用化，传 `{kind:'节目',label}`）：素材取「Lex→逐字稿解读 contentMd，其余源→更丰富的官方简介 abstractEn/Zh」。**关键阈值 minLen=150**——素材太薄会逼模型外推编造（实测硅谷101 仅 19-79 字短副标题时，生成的"体内直接编辑/跨国药企押注"等都不在素材里），故素材 <150 字一律**不生成、退回显示真实副标题**。回填 `node scripts/backfill-podcast-tldr.js`，pipeline 抓到新集自动补。当前：张小珺/No Priors/Lex 全覆盖；硅谷101（feed 简介过短）退回副标题。卡片显示优先级 `tldrZh ?? abstractZh ?? abstractEn`（`PodcastFeed.tsx`）。
**新闻卡片(AI 热点精选/人服机构动态)的 tldrZh**（`scripts/backfill-news-tldr.js`）：纯新闻无 contentMd，故**抓原文网页正文(`fetchAnySourceMd`)再生成**，守铁律(只依据抓到的正文)。**跳过抓不到正文的 host**：`news.google.com`(跳转页/人服动态主力源,基本拿不到)、`arxiv.org`、`huggingface.co`、`news.ycombinator.com`(HN 自帖)。抓不到正文的卡片**退回只显示标题，绝不硬编**。跳过这些后实测命中率~90%(HN外链/雷锋网/量子位等直链文章)。workflow 每批 `MAX=25` 限量跑(`Run news TL;DR (capped)` 步骤,最近优先+渐进回填)；`toSocialItem` 投影已带 `tldrZh`，SocialCard 渲染。

**播客解读同此铁律**（`scripts/translate/podcast-analysis.js`）：①**有逐字稿**（仅 Lex Fridman，其 `abstractEn` 带 `Transcript: https://lexfridman.com/...` 链接）→ 抓全文做深读（"主要话题/金句"）；②**无逐字稿**（张小珺/No Priors/硅谷101 等绝大多数源）→ **只能基于标题+官方简介克制概述**，标题用"本集可能涵盖的话题"、措辞为"这一主题通常关注…/嘉宾可能会…"，**严禁编造具体引语、数字、市值、生平、未在简介出现的事件**；且自动在文末附「ℹ️ 本解读基于节目标题与官方简介由 AI 整理…以原节目为准」声明+原链接。prompt 按 `hasTranscript` 分支（`grounding`/`formatRich` vs `formatLite`）。

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

**任何自建 LLM client 的脚本必须 DeepSeek 优先**：写法一律 `const client = isDeepSeekMode() ? deepseekClient : isCliMode() ? claudeCliClient : new Anthropic(...)`。曾出事：`daily-digest.js`、`translate-daily.js` 漏了 DeepSeek 分支 → `run-daily.sh` 的 `USE_CLAUDE_CLI=1` 把它们路由到**未登录的 claude CLI** → 每天静默失败。已加 `npm run check:backends`（`scripts/check-backends.mjs`）做回归体检：扫出任何"自建 client 调 `messages.create` 却无 `isDeepSeekMode`"的脚本就报错（`claude-cli.js` 例外，它本身是 CLI client 实现）。新增生成型脚本后跑一次。

**标签也要反映真实后端**：写 `translator.model` 这类**展示标签**时同样用 `isDeepSeekMode() ? 'DeepSeek' : ...` 动态判断，**别写死**。曾出事：`full-content.js`（Anthropic/OpenAI 博客全文翻译）client 用的是 DeepSeek，却把 `translator.model` 写死成 `'Claude Sonnet 4.6'` → 文章页「翻译：Claude Sonnet」误导（实为 DeepSeek 翻译）。`check:backends` 只查 client、不查标签，注意人工核对。另：`run-daily.sh` 注的 `USE_CLAUDE_CLI=1` 是历史遗留、已无意义（DeepSeek 优先级在它之前），不必理会。GitHub Actions 云端兜底需在仓库 Secrets 配 `DEEPSEEK_API_KEY`，否则云端跑批会退回 Claude。

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

---

### 管理员 vs 访客：管理后台是「本地工具」

站点是**单一代码库、双部署语义**：

- **访客（线上 reallylink.cn / Vercel）**：构建时设 `NEXT_PUBLIC_PUBLIC_MODE=1` → 公开**只读**。`Sidebar` 过滤掉所有 `adminOnly` 导航（信源管理），`ReportFeed` 隐藏管理按钮（添加报告/生成解读），且 `app/api/*` 全部 `if (PUBLIC_MODE==='1') return 403`。
- **管理员（本机）**：不设 PUBLIC_MODE → 全套管理功能可用。

**为什么管理只能在本地**：所有管理 API（`update-source`/`add-report`/`generate-analysis`/`trigger-fetch`）都是 `writeFileSync` 直接写仓库里的 JSON（信源 = `data/sources.json`，文章 = `data/articles.json`）或 `spawn` 流水线。这只在本机文件系统成立——**Vercel 运行时 FS 只读/临时**，写了既不持久也回不到 git。数据流向是「本地改 `data/*.json` → git → Vercel 重建」，不是反过来。所以管理后台本质是本地工具，**不要**试图在 Vercel 上做可写管理（那需要换成 GitHub API 提交或数据库后端，属于另一个量级的改造）。

**管理员工作流**：
1. `npm run admin` —— 等价 `next dev --webpack` 但强制清空 `NEXT_PUBLIC_PUBLIC_MODE`（即使 `.env.local` 误设了也不受影响），本地 http://localhost:3000 即带管理入口（侧栏「管理 → 信源管理」、各 feed 的管理按钮）。
2. 改信源 / 加报告 / 生成解读 → 写入 `data/*.json`。
3. 上线二选一：
   - 等当天 10:00 的 launchd 流水线自动 commit/push（其 git-add 列表已含 `data/sources.json`）；
   - 或 `npm run publish`（`scripts/publish.sh`）立刻提交并推送 `data/`，Vercel ~1 分钟重建上线。

若日后要「在线/手机管理」，需上密码鉴权 + 把写入改为 GitHub API 提交（讨论记录在案，当前未做）。

---

### 每日自动化：⚠️ 已改为「云端唯一」（GitHub Actions），本地 launchd 已停用

**现状（2026-06 起）**：每日跑批的**唯一执行者是 GitHub Actions**（`.github/workflows/update-papers.yml`）。本地 launchd `com.cyberfocus.pipeline` **已停用**（plist 改名为 `*.disabled-cloudonly-*`，不再自动加载），用户不想再依赖 Mac 是否开机。本地 `run-daily.sh` / `npm run pipeline` 仍可**手动**跑。

**云端 workflow 跑批**：三条 cron——`0 20 * * *`（北京 04:00，晨跑主批）+ `0 21 * * *`（北京 05:00，晨跑兜底）+ `12 1,4,7,10,13 * * *`（09:12/12:12/15:12/18:12/21:12，日内每 3 小时补抓）。**晨跑提前 + 双批兜底**是因为 GitHub cron 常漂移 1~2.5h、偶尔整段丢批（实测 06-08 晨跑从 06:12 漂到 07:24，06-06 那批直接失败）；提前到 04:00 即便漂 +2h 也在 06:00 前跑完，主批被丢还有 05:00 补上 → 确保「8 点前就绪」。日内仍用 :12 错开整点/半点降低被丢概率。**每个定时批次都抓**（已移除 freshness 门；去重靠 `processed-ids`）。逻辑：
- 抓取 pipeline + podcast + 4 个投资报告（后两者 `|| true` 容错）。
- commit 步骤（`id: commit`）：`git diff` **有新内容才** commit/push 并输出 `committed=true`；无则 `false`。
- **构建/部署 Pages 仅在 `committed==true` 或 push/手动时**才跑——日内空批次不构建，避免每 3 小时白白 build。（Vercel 由 push 自身的 webhook 自动部署，独立于此 workflow；注意 `GITHUB_TOKEN` 的 push **不会**再触发 workflow，所以构建必须放在**同一次**有提交的运行里，不能靠 push 事件触发。）
- Bark：**每个定时批次 + 手动触发(`workflow_dispatch`) 抓完都推**（`(schedule||workflow_dispatch) && success()`，步骤带 `continue-on-error: true`——通知抖动**绝不**拖垮 build/deploy）。统一走 `bark_push()`，`curl -s -o /dev/null -w '%{http_code}'` 取 HTTP 码，**curl 必须 `|| echo 000` 兜底**：⚠️**血泪坑**——`bash -e`(set -e) 下若写 `code=$(curl …)` 不兜底，GitHub→api.day.app **偶发超时(curl exit 28)** 会让赋值当场崩掉整步、4 次重试一次都跑不到，还连累 build/deploy 被跳过（这正是 06-08 排查出的真因，非配置/非 key 问题）。连接 10s / 总 25s，重试 4 次、间隔 5s。分级：有新内容→📰 `active`（标题+前 6 条+新增 N 条）；无新内容→📭 `passive` 静默；跑批失败→⚠️ `timeSensitive` 告警（同结构带重试）。（曾试过晨跑用 `timeSensitive` 冲破勿扰，用户认为多余，已回退为统一 `active`。）
- 提频只对社交/新闻有意义（高频源）；低频源(博客/HR/播客)去重后近零成本；投资报告自身 gate，不受频率影响。

**云端必需的 Secrets**（仓库 Settings → Secrets → Actions）：`DEEPSEEK_API_KEY`（否则翻译退回 Claude）、`BARK_KEY`（否则不推送）、`ANTHROPIC_API_KEY`（备用）。云端在境外、`setupProxy()` 无 `HTTPS_PROXY` 即直连，**不需要代理**。

**若要改回本地**：`mv` 那个 `.disabled-cloudonly-*` 回 `.plist` 并 `launchctl load`，同时把 workflow 的 pipeline 步骤关掉以免双跑。

---

以下为**本地 launchd 的历史说明**（已停用，留作手动跑/恢复时参考）：

**`com.cyberfocus.pipeline`**（plist 在 `~/Library/LaunchAgents/`），调用 `scripts/run-daily.sh`。**不要再创建第二个任务**——历史上曾存在重复的 `com.zhanglei.ai-research`（同样跑 run-daily.sh、旧的 10:00），导致每天双跑 + 日志混乱，已停用备份为 `*.disabled-dup-*`。新增/排查时先 `launchctl list | grep -iE "cyberfocus|ai-research"` 确认只有一个。

**调度（本地=北京时间）**：plist 的 `StartCalendarInterval` 是**数组双触发**：
- **06:30 主跑** —— 目标「8:00 前全部就绪」，留 90 分钟缓冲。
- **09:00 补偿** —— 仅当 06:30 没跑成时才真正补跑（见下方幂等闸）。

**caffeinate 包裹**：plist 的 `ProgramArguments` 用 `/usr/bin/caffeinate -i` 包住 run-daily.sh，防止被定时唤醒后系统在跑批途中再次空闲休眠。

**定时唤醒（需手动 sudo 设过一次）**：launchd 只是闹钟，Mac 睡眠时不会自己醒。靠 `sudo pmset repeat wakeorpoweron MTWRFSU 06:28:00` 让 Mac 每天 06:28 自动唤醒，06:30 才能按时触发。否则会退化成「下次手动唤醒时才补跑」。`pmset -g sched` 可查。

**幂等 / 补偿机制**（`run-daily.sh` 内）：
- 开头读 `logs/.last-success`（内容是 `YYYY-MM-DD`）。等于今天 → 立即 `exit 0`（这就是 09:00 触发在 06:30 已成功时不会重复跑的原因）。`FORCE_RUN=1` 可绕过此闸手动强制跑。
- 结尾**仅当「总体成功（`PIPELINE_EXIT==0`）且代理可用（`PROXY_OK==1`）」时**才写当日成功标记。代理挂会让海外源抓 0 条，那种"假成功"故意**不写标记**，好让 09:00 真正补跑。
- 标记按日期自比较、自动失效，无需清理。`logs/` 已 gitignore，标记不入库。
- launchd 自带 catch-up：若 06:30 与 09:00 都因睡眠错过，下次唤醒会合并补跑一次 → 幂等闸保证只实质跑一次。

**日志**：统一到 `logs/daily.log`（run-daily.sh 用 `{ … } >> "$LOG_FILE" 2>&1` 重定向，plist 的 StandardOut/ErrPath 也指向同一文件）。不要再看 `pipeline.log`/`launchd.*.log`（已删的旧文件）。

**告警（Bark / iPhone）**：run-daily.sh 末尾 `notify_bark()` 把结果推到手机。失败（管道非 0 / 代理挂 / `check:backends` 不过）推 ⚠️，成功推 ✅ + 新增数（满足"每次跑完告诉我一声"）。`BARK_KEY` 存 `.env.local`（不入库），未设则静默跳过。curl 用 `--noproxy '*'` 绕过 xray——这样"代理挂了"也能把告警送出去（api.day.app 国内直连）。本地 macOS 通知保留不变。

**改调度后务必重载**：`launchctl unload <plist> && launchctl load <plist>`，再 `launchctl print gui/$(id -u)/com.cyberfocus.pipeline | grep -iE "Hour|Minute"` 确认。

---

### PWA（iOS 主屏 App）

站点是可安装 PWA。iPhone 用 **Safari**（不是微信/Chrome）打开 → 分享 → 添加到主屏幕，即得全屏 App 图标。组成：

**落地页进入逻辑（2 秒倒计时自动进入）**：根 `/` 是赛博朋克落地页（`app/page.tsx`）。每次进入都展示约 **2 秒**（按钮下方小字倒计时「N 秒后自动进入 · 点击立即进入」），到点自动 `setFading(true)` → 淡出 → `router.push('/reports')`；**点屏幕任意处**（`onClick=enterApp`）可立即进入。`manifest start_url='/'`，PWA 启动也走这 2 秒落地页（类原生 splash）。落地页 mount 时 `router.prefetch('/reports')` 预热，跳转无感。（曾短暂用过 localStorage「记住并跳过」+ head 内联跳转脚本，已废弃。）

- **`public/manifest.webmanifest`**：用**静态文件**而非 `app/manifest.ts` 动态路由——后者在 `output:export` 下会报 "force-static not configured" 构建失败。metadata 里 `manifest: "/manifest.webmanifest"` 指向它。
- **图标**：`scripts/gen-pwa-icons.mjs` 用 sharp 从内联 SVG（聚焦/准星图案）渲染。产物：`app/icon.png`(favicon) + `app/apple-icon.png`(180, Next 自动生成 apple-touch 链接) + `public/icons/icon-{192,512}.png` + `icon-maskable-512.png`(72% 安全区)。改图标改脚本里的 SVG 后重跑。
- **iOS 元数据**：`app/layout.tsx` 的 `metadata.appleWebApp` + `viewport.themeColor`。Next 16 只发现代版 `mobile-web-app-capable`，老 iOS 全屏需 legacy `apple-mobile-web-app-capable`——已在 `<head>` 手动补。
- **Service Worker**：`public/sw.js`（`RegisterSW.tsx` 注册）。**freshness-first**：页面导航 network-first（不缓存陈旧内容），仅 `/_next/static`、`/icons` 等不可变资源 cache-first，离线回退 `public/offline.html`。改 SW 缓存策略后 bump `CACHE` 版本号。
