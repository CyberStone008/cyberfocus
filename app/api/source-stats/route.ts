import { readFileSync } from 'fs';
import { resolve } from 'path';

// force-static: required for output:'export' builds (GitHub Pages).
// In server mode, this route is still called dynamically via client-side fetch.
export const dynamic = 'force-static';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sourceId = searchParams.get('sourceId');
  if (!sourceId) {
    return Response.json({ error: 'sourceId required' }, { status: 400 });
  }

  try {
    const raw = readFileSync(resolve(process.cwd(), 'data/articles.json'), 'utf8');
    const articles: Array<{ source: string; publishedAt: string }> = JSON.parse(raw);

    let count = 0;
    let latest: string | null = null;
    for (const a of articles) {
      if (a.source !== sourceId) continue;
      count++;
      if (!latest || a.publishedAt > latest) latest = a.publishedAt;
    }

    return Response.json({ sourceId, count, latest });
  } catch {
    return Response.json({ error: 'failed to read articles' }, { status: 500 });
  }
}
