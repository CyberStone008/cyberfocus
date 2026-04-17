import styles from './SourceBadge.module.css';

const SOURCE_COLORS: Record<string, string> = {
  'arXiv cs.AI': 'arxiv-ai',
  'HuggingFace Daily': 'huggingface',
  'Anthropic Blog': 'anthropic',
  'OpenAI Blog': 'openai',
  'Google DeepMind': 'deepmind',
  'Papers With Code': 'pwc',
};

export function SourceBadge({ source }: { source: string }) {
  const colorClass = SOURCE_COLORS[source] ?? 'default';
  return (
    <span className={`${styles.badge} ${styles[colorClass] ?? styles.default}`}>
      {source}
    </span>
  );
}
