// 取消订阅：从 Vercel KV 删除该 endpoint。
import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const KEY = 'push:subs';

export async function POST(req: NextRequest) {
  try {
    const { endpoint } = await req.json();
    if (typeof endpoint === 'string') await kv.hdel(KEY, endpoint);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
