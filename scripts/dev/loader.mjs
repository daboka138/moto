// Banc d'essai Node des modules purs de src/lib (alias @/ → src/, extensions .ts, modules RN remplacés)
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
const SRC = join(import.meta.dirname, '..', '..', 'src');
const STUBS = {
  '@/lib/features': 'export const canUse = () => true; export const useCanUse = () => true;',
  '@/lib/read-file': 'export const readFileBytes = async () => new ArrayBuffer(0);',
  // Client Supabase en LECTURE (clé publishable du .env, chargé par node --env-file=.env)
  '@/lib/supabase':
    "import { createClient } from '@supabase/supabase-js'; export const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });",
};
export async function resolve(spec, ctx, next) {
  if (STUBS[spec]) return { url: 'stub:' + spec, shortCircuit: true };
  // Imports des modules remplacés : résolus depuis le projet
  if (ctx.parentURL?.startsWith('stub:')) return next(spec, { ...ctx, parentURL: pathToFileURL(join(SRC, 'index.ts')).href });
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
