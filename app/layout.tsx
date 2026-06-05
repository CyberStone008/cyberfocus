import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { BaiduAnalytics } from "./components/BaiduAnalytics";
import "./globals.css";

export const metadata: Metadata = {
  title: "CyberFocus · AI 研究速览",
  description: "自动聚合 arXiv、HuggingFace、Anthropic、OpenAI 等机构前沿 AI 研究报告，提供中文摘要翻译",
  openGraph: {
    title: "AI 研究速览",
    description: "最新 AI 研究论文中文摘要聚合",
    type: "website",
  },
};

const themeScript = `(function(){
  try {
    var t = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', t);
  } catch(e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} suppressHydrationWarning />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Noto+Sans+SC:wght@400;500;700;900&family=Inter:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <Analytics />
        <BaiduAnalytics />
      </body>
    </html>
  );
}
