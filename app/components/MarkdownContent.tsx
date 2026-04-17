import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeSlug from 'rehype-slug';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';
import styles from './MarkdownContent.module.css';

export function MarkdownContent({ content }: { content: string }) {
  return (
    <article className={styles.content}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeSlug, rehypeKatex, rehypeHighlight]}
        components={{
          blockquote: ({ children }) => (
            <blockquote className={styles.callout}>{children}</blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target={href?.startsWith('http') ? '_blank' : undefined}
              rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
