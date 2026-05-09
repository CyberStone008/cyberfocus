import articles from '../../../data/articles.json';
import { Article } from '../../types/article';
import { ReportFeed } from '../../components/ReportFeed';

export default function InvestingPage() {
  const sorted = (articles as Article[])
    .filter((a) => a.category === 'investing')
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  return (
    <ReportFeed
      articles={sorted}
      title="价值投资"
      subtitle="· 研究报告 · 公司分析 · 市场洞察"
      showAnalysis={true}
    />
  );
}
