# 文章详情页展示规范

> 参考：[randomarea.com 示例页](https://randomarea.com/the-complete-guide-to-building-skill-for-claude/)
> 原文：[claude.com/blog/skills](https://claude.com/blog/skills)

## 一、原文 → 展示页的核心转化原则

| 维度 | 原文（英文源） | 展示页（中文转化） |
|------|---------------|-------------------|
| **标题** | 单一英文 H1 | 中文主标题 + 英文副标题（斜体、灰色） |
| **章节标题** | 仅英文 | 中文标题 + 英文副标题 |
| **专有名词** | 原生英文 | 首次出现"中文译名（English）"，后续可只用中文或英文缩写 |
| **产品名/品牌** | Claude, Anthropic, GitHub | 保留原文不翻译 |
| **代码块** | 原样展示 | 保留原文，注释可翻译 |
| **图表标题** | 英文 caption | 中文 caption + 括注原文 |
| **数学公式** | LaTeX | 不变（MathJax 渲染） |
| **引用文献** | 原格式 | 保留 bibtex key，超链接到原出处 |
| **元数据** | 作者、日期 | 作者、日期 + **原文链接** + **译者署名** |

---

## 二、页面结构规范

### 1. 顶部导航区

```
┌─────────────────────────────────────────────────┐
│  ← 返回首页                           🌙 / 繁    │
└─────────────────────────────────────────────────┘
```

- **返回链接**："返回首页"，左对齐
- **主题/语言切换**：右对齐，不遮挡内容

### 2. 文章头部（Header）

```
┌─────────────────────────────────────────────────┐
│  【中文主标题（h1，粗体，大号）】                 │
│  English Subtitle (斜体、灰色、较小)             │
│                                                 │
│  📅 2026-01-26   👤 Anthropic   🏷️ Guide        │
│  🔗 原文：claude.com/blog/skills                 │
│  ✍️ 译者：Claude Sonnet 4.6 + @nake13           │
└─────────────────────────────────────────────────┘
```

**字段规范**：

| 字段 | 必填 | 格式 | 示例 |
|------|------|------|------|
| 中文标题 | 必填 | `<h1>` 粗体 | `Claude Skills 构建完全指南` |
| 英文标题 | 必填 | 斜体灰色 | `The Complete Guide to Building Skills for Claude` |
| 发布日期 | 必填 | `YYYY-MM-DD` | `2026-01-26` |
| 作者/机构 | 必填 | 文本 | `Anthropic` |
| 文档类型 | 选填 | 标签 | `Guide` / `Paper` / `Blog` / `Report` |
| 原文链接 | 必填 | 可点击 | `https://claude.com/blog/skills` |
| 译者署名 | 必填 | 模型名 + 人工校对者 | `Claude Sonnet 4.6 + @nake13` |

### 3. 目录（TOC）

> 仅长文（>3000 字）显示

- **栅格卡片布局**：`grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))`
- **每张卡片**包含：章节中文标题、英文副标题、字数或预计阅读时间
- **锚点跳转**：点击 = `scrollIntoView({behavior: 'smooth'})`
- **当前阅读位置高亮**：右侧固定浮动小目录（可选）

### 4. 正文主体

#### 4.1 标题层级

```markdown
# H1 中文主标题 (仅一个，已在 Header 中)

## H2 章节标题
### English Section Subtitle (斜体灰色)

### H3 子章节标题
#### English Sub-Section Subtitle
```

#### 4.2 段落

- 中文正文：`line-height: 1.8`，`font-family: "Noto Sans SC"`
- 英文专有名词：保留原文，用 `<code>` 或 `<strong>` 标记
- 首次出现译名格式：`思维链（Chain-of-Thought, CoT）`

#### 4.3 列表

- 保持原文层级，不调整顺序
- 每项以中文开头，英文术语括注

#### 4.4 代码块

````markdown
```python
# 中文注释：定义字典类
class Dictionary():
    def __init__(self):
        self.entries = {}
```
````

- **原代码保留**：变量名、函数名、API 名称不翻译
- **注释可翻译**：仅当原文有注释时加中文翻译
- **语言标记**：必须声明（`python`、`bash`、`yaml` 等）

#### 4.5 图表

```markdown
![中文描述](images/xxx.png)
*图 1：中文说明文字（Figure 1: English caption）*
```

#### 4.6 引用/Callout

```html
<blockquote class="note-box">
  💡 <strong>译者注</strong>：此处原文使用了……
</blockquote>
```

**四种 callout 类型**：
- `.note-box`（蓝/青）：译者注、补充说明
- `.warning-box`（黄）：注意事项
- `.quote-block`（灰）：原文引用
- `.tip-box`（绿）：最佳实践提示

#### 4.7 表格

```markdown
| 参数 (Parameter) | 默认值 (Default) | 说明 |
|------------------|------------------|------|
| temperature      | 0.7              | 采样温度 |
```

- 列头：**中文（English）** 双语
- 单元格：中文描述，数值/模型名保留英文

#### 4.8 数学公式

```latex
$$
\pi_{\theta}(a|s) = \frac{\exp(Q(s,a)/\tau)}{\sum_{a'} \exp(Q(s,a')/\tau)}
$$
```

- 使用 MathJax 或 KaTeX 渲染
- 公式本身不翻译，前后文可加中文说明

### 5. 文末区

```
┌─────────────────────────────────────────────────┐
│  📌 原文链接：https://claude.com/blog/skills     │
│  ✍️ 翻译：Claude Sonnet 4.6 · 2026-01-26         │
│  ⚠️ 翻译仅供学习交流使用                          │
│                                                 │
│  ← 上一篇 / 下一篇 →                             │
└─────────────────────────────────────────────────┘
```

- **原文链接**：再次展示，便于对照
- **免责声明**：`翻译仅供学习交流使用`
- **上/下篇导航**：按发布日期顺序

---

## 三、翻译内容转化规范

### 3.1 标题翻译

| 原文 | 中文 |
|------|------|
| `Introducing Agent Skills` | `Agent Skills 功能介绍` |
| `How Skills Work` | `Skills 工作原理` |
| `Skills work with every Claude product` | `Skills 适配所有 Claude 产品` |

**原则**：
- 英文动词短语 → 中文名词短语（更符合标题习惯）
- 保留产品名、品牌名
- 避免过度直译（如 `Introducing` 不译为"介绍")

### 3.2 术语保留规则

**必须保留英文**：
- 产品/品牌：Claude, Anthropic, GitHub, arXiv, HuggingFace
- API/命令：`/v1/skills`, `fetch()`, `pip install`
- 论文/技术名词缩写：LLM, RLHF, CoT, GRPO, RAG
- 模型名称：GPT-5, Claude Sonnet 4.6, DeepSeek-R1

**首次出现加注英文**：
- 新概念：`思维链（Chain-of-Thought, CoT）`
- 专业术语：`强化学习（Reinforcement Learning, RL）`
- 后续使用中文或缩写即可

**完全翻译**：
- 通用技术动词：build → 构建，deploy → 部署
- 形容词/副词
- 连接词和语气词

### 3.3 语气转化

| 英文语气 | 中文习惯 |
|---------|---------|
| "We're excited to announce..." | "我们正式推出……" |
| "Let's dive in" | "让我们开始" 或直接删除 |
| "You'll love..." | "你会发现……" |
| 被动语态 | 多用主动语态 |

### 3.4 段落拆分

- 英文长段（>150 词）→ 中文拆分为 2-3 段
- 每段聚焦一个要点
- 使用"首先、其次、最后"等中文过渡词

---

## 四、数据结构规范

每篇详情页的数据结构：

```typescript
interface ArticleDetail {
  // 基础字段（与列表页共用）
  id: string;                    // "anthropic:claude-skills"
  slug: string;                  // URL slug: "the-complete-guide-to-building-skill-for-claude"
  source: string;                // "Anthropic Blog"
  sourceUrl: string;             // 原文链接
  publishedAt: string;           // ISO 8601

  // 标题
  titleEn: string;
  titleZh: string;

  // 元数据
  authors: string[];             // ["Anthropic"]
  institution?: string;          // "Anthropic"
  docType: 'Blog' | 'Paper' | 'Guide' | 'Report';
  tags?: string[];               // ["Skills", "Claude", "Agent"]

  // 翻译信息
  translator: {
    model: string;               // "Claude Sonnet 4.6"
    humanReviewer?: string;      // "@nake13"
    translatedAt: string;        // ISO 8601
  };

  // 内容
  abstractZh: string;            // 摘要（显示在列表页）
  abstractEn: string;
  contentMd: string;             // 正文 Markdown（中文 + 原文混排）
  contentEn?: string;            // 原文英文内容（用于对照）

  // TOC（自动从 contentMd 生成）
  toc?: Array<{
    level: 2 | 3;
    title: string;
    titleEn?: string;
    anchor: string;
  }>;

  // 导航
  prevArticleId?: string;
  nextArticleId?: string;
}
```

---

## 五、渲染管线

```
原文 HTML/PDF
    ↓
[1] 抽取结构化内容
    - 标题层级
    - 段落、列表
    - 代码块、图表、公式
    ↓
[2] Claude API 翻译
    - 保持原 Markdown 结构
    - 应用术语保留规则
    - 生成双语标题
    ↓
[3] 生成 Markdown 文件
    - data/articles/{slug}.md
    - 带 frontmatter 元数据
    ↓
[4] Next.js 静态页面生成
    - app/articles/[slug]/page.tsx
    - 使用 remark/rehype 渲染
    - 应用 callout、TOC、锚点
    ↓
[5] 部署到 GitHub Pages
```

### 关键实现要点

- **Slug 生成**：英文标题 → 小写 + 连字符 + 去除特殊字符
  ```
  "The Complete Guide to Building Skills for Claude"
  → "the-complete-guide-to-building-skills-for-claude"
  ```
- **Markdown 解析**：`remark` + `rehype` + `remark-gfm`（表格）+ `rehype-katex`（公式）+ `rehype-prism`（代码高亮）
- **TOC 自动生成**：扫描所有 `h2`/`h3`，生成锚点

---

## 六、Checklist（实施时逐项核对）

### 页面结构
- [ ] 顶部有返回首页链接
- [ ] 标题区有中文+英文双语
- [ ] 元数据完整（日期、作者、原文链接、译者）
- [ ] 长文有 TOC，短文无
- [ ] 文末有免责声明 + 上/下篇导航

### 内容质量
- [ ] 所有章节标题都有中英双语
- [ ] 专有名词首次出现时括注英文
- [ ] 产品名/品牌名保留原文
- [ ] 代码块语言标记正确
- [ ] 图片 alt 文本为中文
- [ ] 数学公式正确渲染

### 可访问性
- [ ] 支持明暗主题切换
- [ ] 移动端自适应
- [ ] 锚点链接可复制
- [ ] 正文可朗读（语言标签正确）

### SEO & 元数据
- [ ] `<title>` 标签包含中英文
- [ ] `<meta description>` 为中文摘要
- [ ] OpenGraph 标签完整
- [ ] 结构化数据（Article schema）

---

## 七、示例对照表

以 Anthropic Skills 文章为例：

| 位置 | 原文 | 展示页 |
|------|------|--------|
| 页面标题 | `Introducing Agent Skills` | `Claude Skills 构建完全指南`<br>*The Complete Guide to Building Skills for Claude* |
| H2 章节 | `How Skills Work` | `Skills 工作原理`<br>*How Skills Work* |
| 正文 | `Skills can stack together, making them composable.` | `Skills 可以相互叠加，因此具有**可组合性（Composable）**。` |
| 代码块 | ```bash<br>npm install<br>``` | 原样保留 |
| 元数据 | 无译者信息 | 添加 `译者：Claude Sonnet 4.6` |
| 文末 | 无免责声明 | 添加 `翻译仅供学习交流使用` |
