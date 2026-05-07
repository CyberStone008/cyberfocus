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
- **今天分组**：`SocialFeed` 和 `ReportFeed` 的 `getGroupDate()` 函数：若文章是今天（北京时间）抓取的，则归入「今天」日期组，即使 `publishedAt` 是昨天（避免「今天只有 1 篇」的问题）

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
