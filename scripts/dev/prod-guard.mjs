// Garde-fou des scripts de test qui écrivent en base (comptes, messages, transactions annulées…) :
// JAMAIS sur la base de PRODUCTION sans l'accord de Dimitri (CLAUDE.md › Règles).
// Usage : import './prod-guard.mjs'; en tête du script.
// - Base locale (supabase start) : rien à faire, le script tourne.
// - Production : refusé, sauf si Dimitri l'a demandé pour CE lancement (PASSERYDER_PROD_TEST_OK=oui).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROD_REF = 'yfewldnhnnrzzscmfjsd';
const env = readFileSync(join(import.meta.dirname, '..', '..', '.env'), 'utf8');
const url = /^EXPO_PUBLIC_SUPABASE_URL=(.*)$/m.exec(env)?.[1]?.trim() ?? '';
// Les scripts « transaction annulée » passent par l'API de gestion du projet de production
const usesManagementApi = !!process.env.SUPABASE_ACCESS_TOKEN;

if ((url.includes(PROD_REF) || usesManagementApi) && process.env.PASSERYDER_PROD_TEST_OK !== 'oui') {
  console.error(
    '✋ Ce script écrit dans la base de PRODUCTION (comptes, messages ou transaction de test).\n' +
      '   Interdit sans l’accord de Dimitri : utiliser la base locale (supabase start) ou ses 2 comptes de test.\n' +
      '   Accord donné pour ce lancement : PASSERYDER_PROD_TEST_OK=oui node …',
  );
  process.exit(2);
}
