import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const PROCESSED_PATH = resolve(process.cwd(), 'data/processed-ids.json');

/**
 * Normalize a raw ID + source to a canonical ID string.
 * All arXiv-originating papers map to "arxiv:{id}" (no version suffix).
 */
export function normalizeId(rawId, source) {
  if (source === 'arxiv' || source === 'huggingface') {
    const cleaned = rawId.replace(/v\d+$/, '').trim();
    return `arxiv:${cleaned}`;
  }
  return `${source}:${rawId}`;
}

export function loadProcessed() {
  try {
    const raw = readFileSync(PROCESSED_PATH, 'utf8');
    const obj = JSON.parse(raw);
    return new Set(Object.keys(obj));
  } catch {
    return new Set();
  }
}

export function saveProcessed(idSet) {
  const obj = {};
  for (const id of idSet) {
    obj[id] = true;
  }
  writeFileSync(PROCESSED_PATH, JSON.stringify(obj, null, 2));
}
