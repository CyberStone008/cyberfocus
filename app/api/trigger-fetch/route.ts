import { spawn } from 'child_process';
import { join } from 'path';

export const dynamic = 'force-static'; // required for output:'export' builds; POST-only so never pre-rendered
export const maxDuration = 120; // seconds (Next.js route timeout)

export async function POST(req: Request) {
  // Admin-only: disabled on public (read-only) deployments.
  if (process.env.NEXT_PUBLIC_PUBLIC_MODE === '1') {
    return Response.json({ success: false, error: 'Disabled on public deployment' }, { status: 403 });
  }
  const { sourceId } = await req.json();
  if (!sourceId || typeof sourceId !== 'string') {
    return Response.json({ success: false, error: 'sourceId required' }, { status: 400 });
  }

  const cwd = process.cwd();

  // Construct script path — turbopackIgnore prevents Turbopack from treating it as a module import
  const pipelineScript = join(/*turbopackIgnore: true*/ cwd, 'scripts', 'pipeline.js');

  return new Promise<Response>((res) => {
    const child = spawn('node', [pipelineScript], {
      cwd,
      env: {
        ...process.env,
        SINGLE_SOURCE: sourceId,
        USE_CLAUDE_CLI: 'true',
      },
    });

    let output = '';
    child.stdout.on('data', (d: Buffer) => { output += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { output += d.toString(); });

    const timer = setTimeout(() => {
      child.kill();
      res(Response.json({ success: false, error: '拉取超时（120s）', added: 0 }));
    }, 115_000);

    child.on('close', (code) => {
      clearTimeout(timer);

      // Parse number of new items from pipeline output
      const match = output.match(/New items to process: (\d+)/);
      const added = match ? parseInt(match[1], 10) : 0;

      const success = code === 0;
      res(Response.json({ success, added, code }));
    });
  });
}
