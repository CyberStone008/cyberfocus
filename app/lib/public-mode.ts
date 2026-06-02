/**
 * Public deployment flag.
 *
 * When NEXT_PUBLIC_PUBLIC_MODE=1, the build is a PUBLIC, read-only deployment:
 * admin features (信源管理 / 添加报告 / 触发抓取 / 生成解读) are hidden in the UI
 * and the corresponding API routes refuse to act.
 *
 * Set it in the public host's env (Vercel / Pages CI). Local dev leaves it unset
 * so the full admin toolset stays available.
 *
 * NEXT_PUBLIC_ prefix → inlined at build time, readable in both server and client.
 */
export const IS_PUBLIC = process.env.NEXT_PUBLIC_PUBLIC_MODE === '1';
