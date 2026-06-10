// 取消订阅：从 Vercel KV 删除该 endpoint。
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@vercel/kv';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const KEY = 'push:subs';
const kv = createClient({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

export async function POST(req: NextRequest) {
  try {
    const { endpoint } = await req.json();
    if (typeof endpoint === 'string') await kv.hdel(KEY, endpoint);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
