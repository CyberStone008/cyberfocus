import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 研究速览",
  description: "自动聚合 arXiv、HuggingFace、Anthropic 等机构前沿 AI 研究报告，提供中文摘要翻译",
  openGraph: {
    title: "AI 研究速览",
    description: "最新 AI 研究论文中文摘要聚合",
    type: "website",
  },
};

const themeScript = `(function(){
  try {
    var t = localStorage.getItem('theme') ||
      (window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', t);
  } catch(e) {}
})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&family=Inter:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
