export type DocType = 'Blog' | 'Paper' | 'Guide' | 'Report';

/** research = arXiv / official blogs; social = HN / Reddit / Chinese blogs / X; investing = value investing; podcast = audio episodes */
export type ArticleCategory = 'research' | 'social' | 'investing' | 'podcast';

export interface Translator {
  model: string;           // e.g. "Claude Sonnet 4.6"
  humanReviewer?: string;  // e.g. "@nake13"
  translatedAt: string;    // ISO 8601
}

export interface TocEntry {
  level: 2 | 3;
  title: string;
  titleEn?: string;
  anchor: string;
}

export interface Article {
  id: string;
  slug: string;                 // URL slug for detail page (kebab-case)
  source: string;
  sourceUrl: string;
  publishedAt: string;
  titleEn: string;
  titleZh: string | null;
  abstractEn: string;
  abstractZh: string | null;
  tldrZh?: string | null;       // 报告卡片用的一句话主题说明（基于全文生成，溯源铁律）
  authors: string[];
  institution?: string;
  thumbnail?: string;
  docType?: DocType;
  tags?: string[];

  // Full content (only present when fully translated)
  contentMd?: string;           // Translated Markdown content
  hasContent?: boolean;         // feed-only: a 解读 exists (contentMd stripped from list payload for size)
  contentLen?: number;          // feed-only: 解读 length, for the 总字数 stat
  translator?: Translator;      // Translation credits

  /** Content category — defaults to 'research' for backwards compat */
  category?: ArticleCategory;

  // Social-specific fields
  score?: number;               // HN points / Reddit upvotes
  commentCount?: number;        // discussion thread size
  commentUrl?: string;          // link to discussion thread

  // Series (e.g. multi-chapter reports)
  seriesSlug?: string;          // e.g. 'situational-awareness'
  seriesOrder?: number;         // chapter index within series

  // Podcast-specific fields
  duration?: string | null;     // e.g. "2h 5m"

  // Set to true when added manually via the "添加报告" UI
  addedManually?: boolean;

  // Pipeline ingestion timestamp (set when first added by pipeline)
  fetchedAt?: string;           // ISO 8601 — used for "新" badge in feeds

  // Featured article of the day
  featured?: boolean;           // true = today's pick
  featuredDate?: string;        // YYYY-MM-DD (Beijing time)
}
