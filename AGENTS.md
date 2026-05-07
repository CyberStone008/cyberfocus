<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

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

### 系列文章展示（Series Card）

多章节/嵌套结构的文章（如书籍各章、报告系列）**不**平铺在时间轴中，统一使用**系列合并卡片（Series Card）**方案：

- 在 feed 中用 1 张卡片代表整个系列，卡片内嵌章节目录列表
- 每个章节条目可点击，跳转至对应全文页面（`/articles/[slug]`）
- 数据层：文章需有 `seriesSlug`（系列标识）和 `seriesOrder`（章节序号）字段
- 渲染层：`ReportFeed.tsx` 中 `groupedEntries` 逻辑自动合并相同 `seriesSlug` 的文章
- 系列元信息在 `ReportFeed.tsx` 顶部的 `SERIES_META` 对象中维护（标题、英文标题、作者）
- 如需新增系列，在 `SERIES_META` 中添加对应条目即可
