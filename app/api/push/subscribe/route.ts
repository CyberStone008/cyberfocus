// 接收浏览器的 Web Push 订阅，存进 Vercel KV（仅在 Vercel 服务端运行）。
// 注意：force-dynamic，与 output:'export' 不兼容——GitHub Pages 构建会在打包前 rm 掉 app/api/push。
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@vercel/kv';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const KEY = 'push:subs';
// 兼容 Vercel KV (KV_REST_API_*) 与 Upstash (UPSTASH_REDIS_REST_*) 两种环境变量命名
const kv = createClient({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

export async function POST(req: NextRequest) {
  try {
    const sub = await req.json();
    if (!sub || typeof sub.endpoint !== 'string') {
      return NextResponse.json({ error: 'invalid subscription' }, { status: 400 });
    }
    // 以 endpoint 为字段存（天然去重：同一设备重复订阅只留一条）
    await kv.hset(KEY, { [sub.endpoint]: JSON.stringify(sub) });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
