import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// Statistiques d'usage internes (console admin seulement). Le serveur ne garde qu'un jour
// d'ouverture par plateforme et le département de la VILLE DU PROFIL (jamais de position), et des
// compteurs ANONYMES par fonction. Comptes admin / de test jamais comptés (côté serveur).
// Aucun outil tiers. Jamais bloquant : une erreur est ignorée.

/** Fonctions comptées depuis le téléphone (liste fermée côté serveur : track_usage) */
export type UsageFeature =
  | 'nav_start'
  | 'loop'
  | 'history'
  | 'weather'
  | 'fuel'
  | 'search'
  | 'homecoming'
  | 'trip_share'
  | 'outing_share'
  | 'gpx_import'
  | 'garage';

const PLATFORM = Platform.OS === 'web' ? 'web' : Platform.OS === 'ios' ? 'ios' : 'android';
const DAY_KEY = 'moto.usage.day';
const DEPT_KEY = 'moto.usage.dept';

/** Une utilisation d'une fonction (au plus une fois par minute et par fonction) */
const lastSent = new Map<UsageFeature, number>();
export function trackUsage(feature: UsageFeature) {
  const now = Date.now();
  if (now - (lastSent.get(feature) ?? 0) < 60_000) return;
  lastSent.set(feature, now);
  supabase.rpc('track_usage', { p_feature: feature }).then(({ error }) => {
    if (error) console.warn('Statistique ignorée', error.message);
  });
}

const parisDay = () => new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // pas grave
  }
}

/** Code du département d'une commune (Géoplateforme, gardé sur l'appareil) ; null si inconnu */
async function departmentOf(city: string | null | undefined): Promise<string | null> {
  const name = city?.trim();
  if (!name) return null;
  try {
    const cached = JSON.parse(read(DEPT_KEY) ?? 'null');
    if (cached?.city === name) return cached.dept ?? null;
  } catch {
    // relu plus bas
  }
  const params = new URLSearchParams({ q: name, type: 'municipality', limit: '1' });
  const res = await fetch(`https://data.geopf.fr/geocodage/search?${params}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const json = (await res.json()) as { features?: { properties?: { context?: string } }[] };
  // context : « 13, Bouches-du-Rhône, Provence-Alpes-Côte d'Azur »
  const code = json.features?.[0]?.properties?.context?.split(',')[0]?.trim().toUpperCase() ?? null;
  const dept = code && /^(0[1-9]|[1-8][0-9]|9[0-5]|2A|2B|97[1-6])$/.test(code) ? code : null;
  write(DEPT_KEY, JSON.stringify({ city: name, dept }));
  return dept;
}

/** Jour d'ouverture de l'app (une fois par jour et par compte) */
async function trackActivity(userId: string, city: string | null | undefined) {
  const key = `${userId}:${parisDay()}`;
  if (read(DAY_KEY) === key) return;
  const dept = await departmentOf(city).catch(() => null);
  const { error } = await supabase.rpc('track_activity', { p_platform: PLATFORM, p_department: dept });
  if (error) {
    console.warn('Statistique ignorée', error.message);
    return;
  }
  write(DAY_KEY, key);
}

/** Compte l'ouverture de l'app : au lancement et au retour au premier plan */
export function useActivityTracking(userId: string | undefined, city: string | null | undefined) {
  useEffect(() => {
    if (!userId) return;
    trackActivity(userId, city).catch(() => {});
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') trackActivity(userId, city).catch(() => {});
    });
    return () => sub.remove();
  }, [userId, city]);
}
