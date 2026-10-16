// Banc d'essai Node des modules purs de src/lib (alias @/ → src/, extensions .ts, modules RN remplacés)
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
const SRC = join(import.meta.dirname, '..', '..', 'src');
const STUBS = { '@/lib/features': 'export const canUse = () => true;' };
export async function resolve(spec, ctx, next) {
  if (STUBS[spec]) return { url: 'stub:' + spec, shortCircuit: true };
  if (spec.startsWith('@/')) {
    const base = join(SRC, spec.slice(2));
    for (const f of [base + '.ts', base + '.tsx', join(base, 'index.ts')]) if (existsSync(f)) return { url: pathToFileURL(f).href, shortCircuit: true };
  }
  return next(spec, ctx);
}
export async function load(url, ctx, next) {
  if (url.startsWith('stub:')) return { format: 'module', source: STUBS[url.slice(5)], shortCircuit: true };
  return next(url, ctx);
}
