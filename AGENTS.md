<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

## 变更记录

> 每条规则都已落到代码里、**每次抓取/构建自动执行**；本记录用于追溯与防止误改回退。详情见对应章节。

### 2026-06-11

1. **qa-engineer 增「代码评审」层 + systematic-debugging 进两个 dev 章程**（superpowers 插件评估后的选择性采纳）：qa 从两层→三层，新增第二层「代码评审」——手工读 diff 找逻辑/正确性 bug（边界空值/口径一致/时间正确/根因/契约/静默失败），补上原 6 角色"无人读代码找逻辑 bug"的唯一真空（验收看需求、回归看构建/界面，逻辑 bug 三者都漏）。pipeline-dev/frontend-engineer 加「根因优先（root-cause-first）」铁律。详见〈开发工作流〉末「superpowers 与本 6 角色的关系」：skill 是方法不是角色、agent 调不了 skill（无 Skill 工具）、本项目刻意不采纳 TDD/frontend-design 的理由。

2. **引入 vitest 单测框架 + date/dedupe/toc 回归护栏（verify 第五关）**：装 `vitest`（devDep），加 `npm test`(=`vitest run`)/`test:watch` 脚本与根目录 `vitest.config.ts`（`include: app/**/*.test.ts + scripts/**/*.test.js`、`environment:node`、`globals:false`——刻意不开全局/不改 tsconfig types，否则 next build 的 `**/*.ts` 类型检查会因缺全局类型失败）。v1 只覆盖 3 个**历史事故**纯逻辑模块，断言锁死真实坑：**date**——`2026-06-04T20:30Z` 经 `getDateKey` 须得北京 `2026-06-05` 非 UTC `06-04`（"今天只 3 条"根因）；**dedupe**——`isJunkTitle('6/9/2026')`、同实体高相似并簇(dupCount≥2)/同公司异闻不并(守保守阈值)、代表条优先(tldrZh>非Google)；**toc**——H2+紧跟英文 H3 副标题不重复、相同双语标题折叠("目录/Contents 错乱"事故）。共 26 个 `it`。`verify.sh` 在「③ validate-data」后、「双构建」前插「④ 单元测试 `npx vitest run`」（双构建顺延⑤），CI 仍只调 `verify.sh`（守单一关卡）、ci.yml 的 paths 触发列表补 `vitest.config.ts`。测试文件与源码同目录、顶部显式 `import {describe,it,expect} from 'vitest'`；out/ 不会把 *.test.* 当路由。**坑**：validate-data.js 的 C1「UTC 分组坑」扫描是对 `app/**/*.ts` 原文做子串匹配（含 *.test.ts、连注释文本也算）——测试里要造日期键别裸用 `toISOString().slice(0,10)`，一律走 `getDateKey`，注释里也别写出该字面量。

4. **明确「执行保证」边界（软规则 vs 硬关卡）**：在〈开发工作流〉加〈执行保证〉小节——CI/verify 是唯一对代码合并必然生效的硬闸；任务分流/派 agent/走全流程都是**软规则**（靠主会话读 AGENTS.md 后遵守，无外部系统能审计"是否真调用了 agent 军团"）。重任务走全流程是约定、主会话主动守；用户可一句「这个走完整流程」强制升级。澄清动机：避免把"写进文档"误当成"机械保证执行"。

3. **每日推送内容增强（头条简介 + 几条标题）**：新增 `scripts/build-push-digest.js`（纯函数 `buildDigest(articles,now,windowHours)` + IO 包装），**Bark 与 Web Push 共用同一摘要**（消除原 Bark 标题逻辑写死在 YAML、Web Push 仅"新增 N 条"的不一致）。输出协议：第 1 行=标题(`📰 CyberFocus · 新增 N 条`)、其余=正文（头条 `📌 标题` + 一句话 `tldrZh`（仅 ~1/3 覆盖，有则放无则退回多放标题）+ `• 标题`×3 + `…等共 N 条`）。高价值源(各实验室官博)优先。workflow 两步均 `OUT=$(node scripts/build-push-digest.js)`→`head -1`取标题、`tail -n +2`取多行正文。默认窗口 3.5h（匹配批次）。

### 2026-06-10

0. **开发工作流与 agent 团队（本仓库的工程规范，所有会话必须遵守）**：见下方〈开发工作流〉章节。要点：6 角色分工（product-manager/pipeline-dev/frontend-engineer/ui-designer/qa-engineer/content-auditor，定义在 `.claude/agents/`）；**代码改动走分支+PR+CI，数据(`data/`)由 cron 机器人直推 main**；统一验证关卡 `npm run verify`（=CI 同标准）；PR 必须附验证证据（模板强制）。
1. **iOS PWA Web Push 推送**：给把站点加到主屏幕的 iPhone 用户推"今日已更新"（走苹果 APNs，国内可达；安卓/电脑因依赖 Google FCM 收不到，故 iOS-only）。链路：`PushSubscribe.tsx`(侧栏按钮，iOS 未 standalone 时提示先加桌面)→ 订阅存 **Vercel KV**(`app/api/push/{subscribe,unsubscribe}` 动态路由，仅 Vercel server 模式运行)→ `scripts/send-push.js`(GitHub Actions 有新内容时用 `web-push`+VAPID 发送、自动清理 404/410 失效订阅)。`public/sw.js` 加 `push`/`notificationclick`(缓存升 v2)。**关键坑**：push 路由 `force-dynamic` 与 `output:export` 不兼容 → workflow 的 Pages 构建步骤会先 `rm -rf app/api/push` 再打包(Vercel server 构建保留)。**依赖配置**(否则脚本/路由自动跳过)：GitHub Secrets `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`KV_REST_API_URL`/`KV_REST_API_TOKEN`；Vercel 项目接入 KV(自动注入 KV_* 变量)。VAPID 公钥在 `app/lib/push-config.ts`(可提交)，私钥仅在 Secret。KV 客户端兼容 `KV_REST_API_*` 与 `UPSTASH_REDIS_REST_*` 两种命名。
2. **人服机构动态「官网抓取」试点（官网双轨）**：新增 `scripts/fetch/hr-org-sites.js`，直抓 4 家机构官网（Recruit Holdings RSS / Mercer / Korn Ferry / FESCO Adecco 新闻列表页），与 Google News 第三方报道**并存**（Google News=行业报道面，官网=第一手直链）。配置在 `data/sources.json` 的 `orgSites`（**改配置不改代码**）。网络一律走 curl（同 hr-orgs.js 的坑：Node fetch 不读代理环境变量）；任一源失败仅 warn 不拖垮 pipeline。详见〈HR 机构动态〉章节。
3. **运行期「健康哨兵」v1**（`scripts/sentinel.js` + `.github/workflows/sentinel.yml`，纯确定性、零 AI 调用）：七项检查盯跑批/源/站点/产出是否还活着。运行方式 C=搭车（update-papers 每批 `--trigger=piggyback`，continue-on-error）+ 独立晨检/周报（sentinel.yml 双批兜底 + **绝对时间闸**）。告警全部 Bark `active`（**严禁 timeSensitive**）、分组「CyberFocus哨兵」、当日去重、恢复静默只入周报；周报（周日 21:00 北京）兼任心跳。状态落盘 `data/health/`（保留 30 天）。**坑**：① update-papers 的 commit 步骤改为「committed 只看 data/health 之外的内容变化」——哨兵每批都写 state，若计入会让空批也构建；② data/health **绝不能**加进 update-papers 的 push paths。详见〈运行期哨兵〉章节。
4. **健康仪表盘 `/health` v1**（公开只读页，零图表库）：四卡片=总览状态灯（七项 chips 聚合全部 runs，C5=worst(C5a/C5b/C5c)、过滤 WEEKLY）/源健康榜（阈值映射**复刻** `sentinel.js` buildMonitors，`app/lib/health.ts` 与之**两处改动需同步**；停用源灰显不计超阈）/近 14 天产出（state.dailyCounts，缺日空槽≠真实 0）/告警事件流（openIncidents+runs alertsSent）。数据构建时 fs 静态读取 `data/health/`，北京时刻一律固定 +8h 数学；**数据滞后是设计内行为**（哨兵落盘不触发 Pages 构建，红线勿改），页面以「数据截至」行披露。侧栏新增公开「系统」组；〈管理员 vs 访客〉补只读监控页例外口径。

### 2026-06-09

1. **新闻卡片详细摘要（让用户不必点链接）**：`report-tldr.js` 加 `detail` 选项；新闻（`backfill-news-tldr.js` 传 `detail:true`）生成 **3-5 句、约 150-240 字**的详细概况（人物/事件/数据/影响），守溯源铁律。动机：Google News 等链接国内打不开，摘要够详细就不必跳转。报告 tldr 仍是一句话（`detail:false`）。SocialCard 完整显示不截断。
2. **新闻去重 V1 + 「N 家媒体报道」徽标**（`app/lib/dedupe.ts`）：同一新闻多家报道 → 只显 1 条代表 + 徽标显示有几家报道（含真实媒体名，从 Google 摘要尾部抽取）。**render 时计算**（`social/page.tsx`、`social/all/page.tsx`、`orgs/page.tsx` 在 sort 后 dedupe 再投影），不改数据。AI 热点(social)用 SocialCard、人服动态(orgs)用 ReportCard，两套卡片都加了 `dupBadge`。算法：±4 天窗内「强实体(英文品牌)+标题相似度」并查集聚类，**保守阈值**（`shared≥2 && jaccard≥0.18` 或 `jaccard≥0.5`）宁漏勿误并。代表条优先「有详细摘要 > 国内可直达(非 Google) > 中文 > 标题更全」。实测 /social 去重率 ~10%。跨语言去重（HN-en × 量子位-zh）留待 v2（需向量/LLM）。`dupCount`/`dupSources` 经 `toSocialItem` 投影下发。
3. **播客多源化收尾**：
   - 播客源**配置驱动**：定义在 `data/sources.json` 的 `podcasts` 数组（`{id,source,feedUrl,lang,max}`），`fetch/podcasts.js` `loadFeeds()` 读取（缺失回退内置 `DEFAULT_FEEDS`），信源页有 `podcast` 板块可启停。**增删改播客源 = 改 JSON 不改代码**。
   - 详情页来源标签、卡片头像缩写/颜色**改为按 `ep.source` 动态**（原硬编码 `Lex Fridman`/`Lx`，多源后会错标）；`PodcastFeed.tsx` 的 `PODCAST_META` 给各源配色，未配的用名称首字+灰兜底。
   - 单集无封面时**用频道封面兜底**（`fetch/podcasts.js` 取 `rss.image.url`；Lex 每集不带 itunes:image，会落到频道封面）。
4. **favicon 与 APP 图标同源**：`gen-pwa-icons.mjs` 增加生成 `app/favicon.ico`（16/32/48 多尺寸 PNG-in-ICO，与 PWA 图标同一 SVG）。以后改图标 favicon 一起更新，不会再脱节。
5. **新闻源策略（Google News 链接国内打不开的应对，背景知识）**：实测 Google News 的 `CBMi…` 跳转链接**无法可靠还原**为真实媒体链接（base64 解码 / 跟随跳转 / 抠 HTML 均失败，仅脆弱的 batchexecute 可解，且解出的媒体很多本身也被墙）。**不押注解析**。已落地应对：①新闻卡片**详细摘要**（见上 1，不点链接也能看懂）②**去重 + 多源标注**（见上 2，顺带给可直达备选）。中期方向（**尚未实施**）：方案 C——AI 热点加国内可直达源（InfoQ/钛媒体/量子位/雷锋网，已实测可抓直链）并降权 `Google AI News`；人服动态改抓机构官网。模拟对比发现 Google News（欧美政策/资本）与中文源（中国产业/产品）**内容差异大、非冗余替换**，故 C 是"增量+降权"而非"无损换源"。

### 2026-06-08

1. **云端定时（晨跑提前+双批兜底）**：cron 改为 `0 20`(北京 04:00 主批)+`0 21`(05:00 兜底)+`12 1,4,7,10,13`(日内每 3h)。GitHub cron 常漂移 1~2.5h/偶尔丢批，提前到 04:00 即便漂 +2h 也在 6 点前跑完，确保「8 点前就绪」。见〈云端 workflow 跑批〉。
2. **Bark 通知加固**：每个定时批次 + 手动触发都推（`continue-on-error`，绝不拖垮 build/deploy）；统一 `bark_push()`——**curl 必须 `|| echo 000` 兜底**（否则 `bash -e` 下 curl 超时 exit 28 会崩掉整步、重试都跑不到，这是 06-08 排查出的真因），回显 HTTP 码 + 重试 4 次。新增→📰active、无新→📭passive、失败→⚠️timeSensitive。见〈数据溯源铁律〉后的 Bark 段。
3. **播客源改为配置驱动（在「信源」里管理，不再改代码）**：播客源定义从 `podcasts.js` 硬编码搬到 `data/sources.json` 的 `"podcasts"` 数组（每条 `{id, source, feedUrl, lang('en'/'zh'), max}`）。`scripts/fetch/podcasts.js` 的 `loadFeeds()` 读取它（缺失则回退内置 `DEFAULT_FEEDS`），并支持用全局 `disabled` 数组按 `id` 或 `source` 停用。信源页(`sources/page.tsx`)新增 `podcast` 板块展示这些源、可启停。**增删改播客源 = 编辑 `data/sources.json`（本地信源页或直接改 JSON）后提交，云端自动生效**。当前 4 源：Lex Fridman、张小珺商业访谈录、No Priors、硅谷101。解读逻辑通用化(不写死 Lex)且守溯源铁律（无逐字稿严禁编造、附来源声明）。UI「顶级播客」→「精选播客」。
4. **卡片「结论先行」主题说明 `tldrZh`（四模块）**：报告(基于全文)、播客(基于官方简介/Lex逐字稿)、新闻(抓原文正文)。**守数据溯源铁律**：只在拿到真实素材时生成，数字必须逐字出现在素材里；**拿不到素材就退回原文本（标题/副标题/原摘要）、绝不硬编**。详见〈数据溯源铁律〉下三段（report-tldr / 播客 / 新闻）。
   - 常态化入口：报告→`pipeline.js` 生成全文后顺带；播客→`podcast-pipeline.js` 抓到新集顺带；新闻→workflow `Run news TL;DR (capped)` 步骤每批 `MAX=25`（最近优先、抓不到的 Google News 等跳过）。

---

## 开发工作流（agent 团队规范）

> 目标：流程规范可控、产出可验证、任务可并行、出错可回滚。**所有会话（含 subagent）必须遵守。**

### 角色（定义在 `.claude/agents/`，含各自坑库/清单）
| 角色 | 性质 | 职责 |
|---|---|---|
| product-manager（产品经理） | 只读 | 一句话需求 → 任务单（方案选项/验收标准/影响面）；决策权永远在用户 |
| pipeline-dev（管道研发） | 可写·worktree | `scripts/` + workflows 开发 |
| frontend-engineer（前端工程师） | 可写·worktree | `app/` + `public/` 开发 |
| ui-designer（UI 设计师） | 只读+preview | ①开发前出 UI 设计方案（布局/尺寸/交互规格）②实现后双视口走查（对照设计方案），输出 必须修/建议/可忽略 |
| qa-engineer（测试工程师） | 只读+执行 | ①按任务单验收标准+设计方案逐条验收 ②**代码评审**（读 diff 找逻辑/正确性 bug：边界/口径一致/时间/根因/契约）③工程回归（verify+冒烟），只报问题项 |
| content-auditor（内容审计） | 只读 | 溯源铁律核查：数字/引语逐字有据 |

### 流转规则
1. **任务分流**：轻任务（文案/小样式/查问题，≤15 分钟）主会话直做，但完工仍须 `npm run verify`；重任务（新功能/重构/多文件）必须先出 product-manager 任务单 → 用户选定方案 → **涉及界面的，ui-designer 先出设计方案（用户可过目）** → 对应 dev 在 worktree 分支按设计实现 → ui-designer 对照设计走查 + qa-engineer 按验收标准验收。**轻 UI 任务**：可不派 ui-designer，但主会话必须**亲自代行**其核心检查——preview 移动端 375px 实测受影响页面+截图确认（涉及桌面布局再加 1280px）；做不到就升级为重任务派角色。
2. **并行上限 3**；任务拆分以**目录不相交**为原则（scripts/ 与 app/ 天然可并行）。
3. **代码 vs 数据双轨**：代码改动（app/ scripts/ public/ workflows/ 配置）走 **分支 + PR + CI**（`.github/workflows/ci.yml`）；`data/` 由 cron 机器人**直推 main**，不走 PR——这是本仓库特殊性，勿改。
4. **合并门槛**：CI 绿 + PR 模板验证证据齐全（UI 改动须 ui-designer「✅ 可合并」；重需求须 qa-engineer 验收报告全部通过；**代码量大的改动须 qa-engineer 第二层代码评审无正确性问题**；生成逻辑改动须 content-auditor 抽查）。
5. **统一关卡**：本地 `npm run verify` 与 CI 跑同一个 `scripts/verify.sh`（scripts 语法 / YAML / `validate-data.js` 数据+坑扫描 / 单元测试(vitest) / 双构建）。其中第五关「单元测试」= `npx vitest run`，护 date/dedupe/toc 三个纯逻辑痛点（顺序在 validate-data 之后、双构建之前，失败即非零退出不再跑构建）。新坑修复后**必须**在 validate-data.js 加防回归扫描（或对纯逻辑模块补 *.test.ts）+ 写进本文档。
6. **完工三件套**：自验输出贴在返回里；新坑写入 AGENTS.md；改 SW 记得 bump 缓存版本。
7. **后台 agent 跑长任务可能撞会话额度中止**（2026-06-10 哨兵 v1 实锤）：task-notification 会显示 `completed`，但 result 是额度提示——它常停在「代码写完、未自验、未提交」的半成品节点。**绝不直接合半成品**：主会话接管时先 `git status` + 实跑 + `npm run verify` 核对 worktree 真实状态，补做全部验证、把测试污染的 state 清成干净种子，再提交+PR。所以派 dev agent 务必 **worktree 隔离**，中止也不污染主检出。

### 执行保证：哪些是硬的、哪些靠自觉（别高估"写下来"= "必然执行"）
> 本规则**自动加载**（`CLAUDE.md` 只含 `@AGENTS.md`，每次会话开场拉入；跨会话由记忆 `cyberfocus-dev-workflow.md` 兜底）。但"加载了"≠"机械保证执行"，必须分清两类：

- **硬关卡（机器强制、绕不过）**：只有 **CI / `verify`**——代码不过双构建+校验+单测，PR 就合不进 main。这是唯一对每次代码合并**必然生效**的闸。
- **软规则（靠主会话读了照做）**：上面的「任务分流 / 派哪个 agent / 走不走全流程」全是软规则。**没有任何外部系统能审计"主会话到底有没有调用 agent 军团"**——派 agent 是对话里的编排行为，不落进代码、不留痕，CI 也看不见。
- **由此的两条作业纪律**：① **重任务**（新功能/重构/多文件）走全流程是**约定**，主会话应主动遵守、不得图省事跳过；②**任务分流的判断是主会话做的**，用户随时可一句「这个走完整流程」**强制升级**，覆盖主会话的轻/重判定。
- **认知边界**：想要"每个需求都 100% 机械地过完整军团"——技术上做不到（CI 管代码进 main，管不了对话编排）。能保证的上限 = 规则清晰自动加载 + CI 硬卡代码质量 + 主会话守约定 + 用户可随时强制升级。

### superpowers 等 skill 与本 6 角色的关系（2026-06-11 评估，避免误用）
- **skill 是「方法」，6 角色是「分工」，正交**：skill 不替代角色，是角色/主会话采用的工作方法。
- **硬约束**：6 个 agent 章程的 `tools` 均**不含 Skill 工具** → spawn 出去的角色 agent **调不了** superpowers/`/code-review` 等 skill。这些 skill 只能在**主会话（编排层）**用；要让角色遵守某方法，把方法的**原则**写进它章程当普通守则（如已把 systematic-debugging 的"根因优先"写进 pipeline-dev/frontend-engineer，把 code-review 蒸馏成 qa 第二层）。
- **已被本工作流覆盖、勿重复接入**：verification-before-completion ≈ 完工三件套+PR 证据+qa；using-git-worktrees、writing-plans、dispatching-parallel-agents、finishing-branch ≈ 现有编排/任务单/合并流。
- **已采纳**：systematic-debugging（根因优先，进两个 dev 章程）；code-review 正确性评审（蒸馏为 qa 第二层；代码量大的 PR 主会话可另跑 `/code-review` 做 backstop）。
- **本项目刻意不采纳（别 cargo-cult）**：① **TDD 全套仪式**——本仓库已有**轻量单测**护纯逻辑（vitest 覆盖 date/dedupe/toc，进 `verify` 第五关），但主体仍是内容管道+静态站，"测试"的本体是 `verify`（构建+数据校验+坑扫描+这层单测）；采纳其精神（先写校验/断言后写实现，已体现在 validate-data.js 与这批回归断言），**不上红-绿-重构全套仪式**、不对 UI/管道铺开单测。② **frontend-design（创意视觉）**——与 ui-designer"复用既有视觉语言、不发明新风格"的维护期原则冲突；仅绿地重做才用。

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

数据来源**官网双轨**：
- **Google News（第三方报道）**：`scripts/fetch/hr-orgs.js`，通过 Google News RSS 抓取 12 家机构（国际 6 家 + 国内 6 家）。
- **机构官网（第一手直链，试点 4 家）**：`scripts/fetch/hr-org-sites.js`，直接抓机构官网 RSS/列表页（Recruit Holdings=rss、Mercer/Korn Ferry/FESCO Adecco=html），产出官网直链（国内通常可直达，区别于 Google News 跳转链）。**配置驱动**：源定义在 `data/sources.json` 的 `orgSites` 数组（每条 `{id, source, mode:'rss'|'html', url, lang, max}`），**增删改官网源 = 改 JSON 不改代码**；`source` 必须与 `app/lib/sources-config.ts` ORGS_SOURCES 的 id 完全一致才会进 orgs 板块。文章 `id` 前缀 `hrsite:`、`tags:['官网发布']`、`category:'research'`（pipeline 已排除其参与 AI 精选解读）；html 模式解析不出日期时 `publishedAt` 用抓取时刻（orgs 板块按 `fetchedAt` 分组，可接受）。两轨并存不互斥——Google News 给行业报道面，官网给第一手发布。

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
- **例外口径**：只读监控页（`/health` 健康仪表盘）**公开 ≠ 管理工具**——「管理」的判别标准是**能写**（写 `data/*.json` / spawn 流水线），纯展示哨兵落盘数据的只读页归公开导航（侧栏「系统」组，非 `adminOnly`），且不依赖任何 `app/api/*`。

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

### 运行期哨兵（健康监控）

`scripts/sentinel.js`（零 LLM 依赖，纯确定性）。CLI：`node scripts/sentinel.js --trigger=piggyback|morning|weekly`。

**七项检查**：
| # | 名称 | 触发 | 判定 | 失败动作 |
|---|---|---|---|---|
| C1 | 晨批考勤 | morning | `data/daily/{北京今日}.json` 存在且 generatedAt ≤ 北京 08:00（记录相对 04:00 主批的漂移分钟） | 即时告警 + Actions API 分诊（无 schedule run=cron 丢批 / run failed=跑批失败 / 成功但无产出=逻辑问题） |
| C2 | 源健康 | piggyback | state 自存 perSource lastSeenAt（**不能只看 articles.json**——3000 条滚动池会淘汰小源旧记录；首跑用 articles+podcasts 播种）。高频源(Google AI News/HN/雷锋网/量子位/Reddit LocalLLaMA) 2 天；HR Google News 12 家 7 天；其余博客/播客/官网 14 天（官网条目独立记 `源名(官网)`） | 高频→即时；其余→只入周报 |
| C3 | 官网防烂 | piggyback | 消费 `data/health/last-fetch.json`：orgSites **html 模式**源解析候选数连续 2 批=0（rss 模式归 C2） | 即时 |
| C4 | 站点存活+新鲜 | morning | reallylink.cn/reports/ 3 次重试(5/15/30s)须 200；200 时本地最新 3 条 research 标题**纯子串**匹配页面（先解码 RSC \uXXXX/HTML 实体）；Pages 只查 200 | 网络类(curl 退出码)**两击确认**；HTTP 非 200/新鲜度（逻辑类）一击即报 |
| C5 | 产出体检 | piggyback | a) `validate-data.js` 子进程退出码 b) 各板块**昨日(完整日)**新增 vs 前 7 天中位数骤降>70%（判昨日不判当日——凌晨批当日计数天然小会必然误报；中位数<5 的低基数板块不判） c) 最新策略快报【一句话叙事】解析为空（正则复刻自 `app/(app)/investing/page.tsx` extractNarrative，**两处改动需同步**） | 即时 |
| C6 | tldr 覆盖率 | piggyback | 近 24h「可抓 host」新闻（口径复刻 backfill-news-tldr.js 的 SKIP_HOSTS）tldrZh 覆盖率 <50%（样本<5 不判） | 只入周报 |
| C7 | Bark 受理统计 | 每次发送 | 每次 bark 的最终 HTTP 码记 state.barkDeliveries | 受理失败只入周报，**绝不递归告警** |

**告警治理**：全部 `level=active`（严禁 timeSensitive）、`group=CyberFocus哨兵`；curl 失败兜底等价 `|| echo 000` + 4 重试 + 回显 HTTP 码；BARK_KEY 缺失静默跳过。**当日去重**：`state.alertState[checkId:target].lastAlertedDateBJ` 同北京日期不重发。**恢复静默**：翻转 status + resolvedAt，不即时推送，只在周报披露。

**绝对时间闸**（sentinel.yml）：晨检双批 cron 北京 05:45/06:45（学晨批双批兜底），脚本内 sleep-loop 等到北京 08:00 才判定（已过点立即判）；周报周日 20:45 启动、21:00 发送。判定前在 CI 里 `git pull --rebase` 刷新检出 → `state.judged[trigger]` 当日已判则第二批幂等退出。`SENTINEL_FORCE=1` 跳过闸+幂等（本地测试用）。

**数据接口（黑板，未来夜班 agent 消费）**：`data/health/state.json`（perSource/alertState/**openIncidents**[{id,checkId,target,severity,firstSeenAt,lastSeenAt,evidence,status}]/judged/各类 streak）+ `data/health/runs/{北京日期}.json`（append {ranAt,trigger,checks,alertsSent}，超 30 天自动清理）+ `data/health/last-fetch.json`（pipeline 每批写：{ranAt,perSource:{源:新增数},orgSitesParse:{条目id:解析数}}；DRY_RUN/SINGLE_SOURCE 不写）。阈值覆盖：`data/sources.json` 顶层可加 `healthDays:{源名:天数}`，podcasts/orgSites 条目级可加 `healthDays`。

**两个关键坑（勿改回）**：① update-papers.yml 的 commit 步骤 `committed=true`（→构建 Pages+📰通知）**只看 data/health 之外的内容变化**——哨兵每批都写 state/runs，若计入会让空批也构建；② `data/health/` **绝不能**加进 update-papers.yml 的 push paths 触发列表，否则哨兵落盘触发整轮构建。

### PWA（iOS 主屏 App）

站点是可安装 PWA。iPhone 用 **Safari**（不是微信/Chrome）打开 → 分享 → 添加到主屏幕，即得全屏 App 图标。组成：

**落地页进入逻辑（2 秒倒计时自动进入）**：根 `/` 是赛博朋克落地页（`app/page.tsx`）。每次进入都展示约 **2 秒**（按钮下方小字倒计时「N 秒后自动进入 · 点击立即进入」），到点自动 `setFading(true)` → 淡出 → `router.push('/reports')`；**点屏幕任意处**（`onClick=enterApp`）可立即进入。`manifest start_url='/'`，PWA 启动也走这 2 秒落地页（类原生 splash）。落地页 mount 时 `router.prefetch('/reports')` 预热，跳转无感。（曾短暂用过 localStorage「记住并跳过」+ head 内联跳转脚本，已废弃。）

- **`public/manifest.webmanifest`**：用**静态文件**而非 `app/manifest.ts` 动态路由——后者在 `output:export` 下会报 "force-static not configured" 构建失败。metadata 里 `manifest: "/manifest.webmanifest"` 指向它。
- **图标**：`scripts/gen-pwa-icons.mjs` 用 sharp 从内联 SVG（聚焦/准星图案）渲染。产物：`app/icon.png`(favicon) + `app/apple-icon.png`(180, Next 自动生成 apple-touch 链接) + `public/icons/icon-{192,512}.png` + `icon-maskable-512.png`(72% 安全区)。改图标改脚本里的 SVG 后重跑。
- **iOS 元数据**：`app/layout.tsx` 的 `metadata.appleWebApp` + `viewport.themeColor`。Next 16 只发现代版 `mobile-web-app-capable`，老 iOS 全屏需 legacy `apple-mobile-web-app-capable`——已在 `<head>` 手动补。
- **Service Worker**：`public/sw.js`（`RegisterSW.tsx` 注册）。**freshness-first**：页面导航 network-first（不缓存陈旧内容），仅 `/_next/static`、`/icons` 等不可变资源 cache-first，离线回退 `public/offline.html`。改 SW 缓存策略后 bump `CACHE` 版本号。
