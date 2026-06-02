export const dynamic = 'force-static'; // required for output:'export' static builds
// POST { id, enabled? }          → update disabled list
// POST { id, boards? }           → update boardOverrides
import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const SOURCES_CONFIG_PATH = resolve(process.cwd(), 'data/sources.json');

export async function POST(request: NextRequest) {
  // Admin-only: disabled on public (read-only) deployments.
  if (process.env.NEXT_PUBLIC_PUBLIC_MODE === '1') {
    return NextResponse.json({ error: 'Disabled on public deployment' }, { status: 403 });
  }
  const body = await request.json();
  const { id, enabled, boards } = body;

  const config = JSON.parse(readFileSync(SOURCES_CONFIG_PATH, 'utf8'));

  // Handle enable/disable
  if (typeof enabled === 'boolean') {
    const disabled = new Set<string>(config.disabled ?? []);
    if (enabled) disabled.delete(id); else disabled.add(id);
    config.disabled = [...disabled];
  }

  // Handle board overrides
  if (boards !== undefined) {
    config.boardOverrides = config.boardOverrides ?? {};
    if (boards === null || (Array.isArray(boards) && boards.length === 0)) {
      delete config.boardOverrides[id]; // revert to default
    } else {
      config.boardOverrides[id] = boards;
    }
  }

  writeFileSync(SOURCES_CONFIG_PATH, JSON.stringify(config, null, 2));
  return NextResponse.json({ success: true });
}
