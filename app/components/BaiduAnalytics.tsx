'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

// 百度统计 (Baidu Tongji) — best coverage for mainland / WeChat visitors, where
// the Vercel analytics beacon can be flaky. Site id (the hash after `hm.js?`)
// is account-bound, so it comes from an env var:
//   NEXT_PUBLIC_BAIDU_ANALYTICS_ID=<hash from your 百度统计 tracking code>
// Unset → this renders nothing and loads nothing (safe to ship inert).
const BAIDU_ID = process.env.NEXT_PUBLIC_BAIDU_ANALYTICS_ID;

declare global {
  interface Window {
    _hmt?: unknown[][];
  }
}

export function BaiduAnalytics() {
  const pathname = usePathname();
  const isFirstLoad = useRef(true);

  // hm.js auto-counts the landing page on load. For subsequent client-side
  // route changes (App Router never does a full reload) we must report the
  // pageview manually — otherwise only the first screen is ever counted.
  useEffect(() => {
    if (!BAIDU_ID) return;
    if (isFirstLoad.current) {
      isFirstLoad.current = false; // hm.js already counted this one
      return;
    }
    window._hmt = window._hmt || [];
    window._hmt.push(['_trackPageview', pathname]);
  }, [pathname]);

  if (!BAIDU_ID) return null;

  return (
    <Script id="baidu-hm" strategy="afterInteractive">
      {`
        var _hmt = _hmt || [];
        (function () {
          var hm = document.createElement("script");
          hm.src = "https://hm.baidu.com/hm.js?${BAIDU_ID}";
          var s = document.getElementsByTagName("script")[0];
          s.parentNode.insertBefore(hm, s);
        })();
      `}
    </Script>
  );
}
