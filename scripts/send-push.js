#!/usr/bin/env node
/**
 * send-push.js — 给所有 Web Push 订阅者发一条通知（主要服务 iOS 已安装 PWA 用户，走 APNs）。
 * 读 Vercel KV 的订阅者列表，用 web-push 逐个发送，并自动清理失效(404/410)订阅。
 *
 * 需要环境变量：
 *   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY   — VAPID 密钥（GitHub Secret）
 *   KV_REST_API_URL / KV_REST_API_TOKEN    — Vercel KV 连接（GitHub Secret）
 *   PUSH_TITLE / PUSH_BODY / PUSH_URL      — 可选，通知内容（默认晨报式）
 */
import webpush from 'web-push';
import { kv } from '@vercel/kv';

const KEY = 'push:subs';
const PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const PRIVATE = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@reallylink.cn';

const title = process.env.PUSH_TITLE || 'CyberFocus 已更新';
const body  = process.env.PUSH_BODY  || '今日 AI 精华已就绪，点开看看';
const url   = process.env.PUSH_URL   || '/reports';

async function main() {
  if (!PUBLIC || !PRIVATE) { console.log('[push] 未配置 VAPID 密钥，跳过'); return; }
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    console.log('[push] 未配置 Vercel KV 连接，跳过'); return;
  }
  webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);

  let all;
  try { all = (await kv.hgetall(KEY)) || {}; }
  catch (e) { console.log(`[push] 读取订阅者失败: ${e.message}`); return; }

  const entries = Object.entries(all);
  if (!entries.length) { console.log('[push] 暂无订阅者'); return; }

  const payload = JSON.stringify({ title, body, url, tag: 'cyberfocus-daily' });
  let ok = 0, dead = 0, fail = 0;
  for (const [endpoint, subStr] of entries) {
    let sub;
    try { sub = typeof subStr === 'string' ? JSON.parse(subStr) : subStr; } catch { continue; }
    try {
      await webpush.sendNotification(sub, payload, { TTL: 6 * 3600 });
      ok++;
    } catch (e) {
      const code = e.statusCode;
      if (code === 404 || code === 410) { try { await kv.hdel(KEY, endpoint); } catch {} dead++; }
      else { fail++; }
    }
  }
  console.log(`[push] 完成：成功 ${ok} / 清理失效 ${dead} / 失败 ${fail} / 共 ${entries.length}`);
}

main().catch((e) => { console.error('[push] 异常:', e.message); process.exit(0); });
