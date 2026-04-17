export type DocType = 'Blog' | 'Paper' | 'Guide' | 'Report';

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
  authors: string[];
  institution?: string;
  thumbnail?: string;
  docType?: DocType;
  tags?: string[];

  // Full content (only present when fully translated)
  contentMd?: string;           // Translated Markdown content
  translator?: Translator;      // Translation credits

  // Featured article of the day
  featured?: boolean;           // true = today's pick
  featuredDate?: string;        // YYYY-MM-DD (Beijing time)
}
