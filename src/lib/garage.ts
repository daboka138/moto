import { useEffect, useSyncExternalStore } from 'react';

import { supabase } from '@/lib/supabase';

// Garage : compteur kilométrique (mis à jour à la fin de chaque navigation), réservoir et
// consommation (autonomie), carnet d'entretien et rappels. Données privées (RLS : propriétaire
// seul). Rappels envoyés par le serveur (check_maintenance_reminders, tous les jours).

export type MaintenanceKind = 'oil' | 'tires' | 'chain' | 'service' | 'brakes' | 'other';
export type PlanKind = Exclude<MaintenanceKind, 'other'>;

export const MAINTENANCE_KINDS: {
  value: MaintenanceKind;
  label: string;
  emoji: string;
  /** Intervalle proposé pour le rappel */
  everyKm: number | null;
  everyMonths: number | null;
}[] = [
  { value: 'oil', label: 'Vidange', emoji: '🛢️', everyKm: 6000, everyMonths: 12 },
  { value: 'chain', label: 'Chaîne (graissage, tension)', emoji: '⛓️', everyKm: 800, everyMonths: null },
  { value: 'tires', label: 'Pneus', emoji: '🛞', everyKm: 10000, everyMonths: 60 },
  { value: 'service', label: 'Révision', emoji: '🔧', everyKm: 12000, everyMonths: 12 },
  { value: 'brakes', label: 'Freins (plaquettes, liquide)', emoji: '🛑', everyKm: 15000, everyMonths: 24 },
  { value: 'other', label: 'Autre', emoji: '📝', everyKm: null, everyMonths: null },
];

export const kindInfo = (k: MaintenanceKind) => MAINTENANCE_KINDS.find((x) => x.value === k)!;
export const PLAN_KINDS = MAINTENANCE_KINDS.filter((k) => k.value !== 'other').map((k) => k.value as PlanKind);

export type Garage = {
  motorcycleId: string;
  odometerKm: number;
  tankL: number | null;
  consumptionL100: number | null;
  /** Compteur au dernier plein (null = inconnu) */
  fillOdometerKm: number | null;
  filledAt: string | null;
};

export type MaintenancePlan = {
  id: string;
  motorcycleId: string;
  kind: PlanKind;
  everyKm: number | null;
  everyMonths: number | null;
  /** Dernière fois (relancée à chaque entretien noté dans le carnet) */
  baseKm: number | null;
  baseOn: string;
};

export type MaintenanceRecord = {
  id: string;
  motorcycleId: string;
  kind: MaintenanceKind;
  doneOn: string;
  odometerKm: number | null;
  costEur: number | null;
  notes: string | null;
};

export type MotoGarage = {
  garage: Garage | null;
  plans: MaintenancePlan[];
  records: MaintenanceRecord[];
};

type GarageRow = {
  motorcycle_id: string;
  odometer_km: number;
  tank_l: number | null;
  consumption_l100: number | null;
  fill_odometer_km: number | null;
  filled_at: string | null;
};

const toGarage = (r: GarageRow): Garage => ({
  motorcycleId: r.motorcycle_id,
  odometerKm: r.odometer_km,
  tankL: r.tank_l === null ? null : Number(r.tank_l),
  consumptionL100: r.consumption_l100 === null ? null : Number(r.consumption_l100),
  fillOdometerKm: r.fill_odometer_km,
  filledAt: r.filled_at,
});

// ---------- Lecture / écriture ----------

/** Garage complet de mes motos, par moto */
export async function fetchMyGarage(userId: string): Promise<Record<string, MotoGarage>> {
  const [g, p, r] = await Promise.all([
    supabase.from('motorcycle_garage').select('*').eq('owner_id', userId),
    supabase.from('maintenance_plans').select('*').eq('owner_id', userId),
    supabase.from('maintenance_records').select('*').eq('owner_id', userId).order('done_on', { ascending: false }).order('created_at', { ascending: false }),
  ]);
  if (g.error) throw g.error;
  if (p.error) throw p.error;
  if (r.error) throw r.error;
  const out: Record<string, MotoGarage> = {};
  const of = (id: string) => (out[id] ??= { garage: null, plans: [], records: [] });
  for (const row of (g.data ?? []) as GarageRow[]) of(row.motorcycle_id).garage = toGarage(row);
  for (const row of p.data ?? []) {
    of(row.motorcycle_id).plans.push({
      id: row.id,
      motorcycleId: row.motorcycle_id,
      kind: row.kind,
      everyKm: row.every_km,
      everyMonths: row.every_months,
      baseKm: row.base_km,
      baseOn: row.base_on,
    });
  }
  for (const row of r.data ?? []) {
    of(row.motorcycle_id).records.push({
      id: row.id,
      motorcycleId: row.motorcycle_id,
      kind: row.kind,
      doneOn: row.done_on,
      odometerKm: row.odometer_km,
      costEur: row.cost_eur === null ? null : Number(row.cost_eur),
      notes: row.notes,
    });
  }
  return out;
}

export async function saveGarage(
  motorcycleId: string,
  patch: { odometerKm?: number; tankL?: number | null; consumptionL100?: number | null; fillOdometerKm?: number | null },
) {
  const row: Record<string, unknown> = { motorcycle_id: motorcycleId };
  if (patch.odometerKm !== undefined) row.odometer_km = patch.odometerKm;
  if (patch.tankL !== undefined) row.tank_l = patch.tankL;
  if (patch.consumptionL100 !== undefined) row.consumption_l100 = patch.consumptionL100;
  if (patch.fillOdometerKm !== undefined) {
    row.fill_odometer_km = patch.fillOdometerKm;
    row.filled_at = patch.fillOdometerKm === null ? null : new Date().toISOString();
  }
  const { error } = await supabase.from('motorcycle_garage').upsert(row);
  if (error) throw new Error(error.message);
  await refreshGarage();
}

/** Plein fait : la jauge repart du compteur actuel (+ km déjà faits pendant la navigation en cours) */
export async function markFilled(g: Garage, extraKm = 0) {
  await saveGarage(g.motorcycleId, { fillOdometerKm: Math.round(g.odometerKm + extraKm) });
}

/** Kilomètres d'un trajet ajoutés au compteur (sans effet si le compteur n'est pas renseigné) */
export async function addMotorcycleKm(motorcycleId: string, km: number) {
  if (km <= 0) return;
  const { error } = await supabase.rpc('add_motorcycle_km', { moto: motorcycleId, km });
  if (error) throw error;
  await refreshGarage();
}

export async function savePlan(
  motorcycleId: string,
  kind: PlanKind,
  p: { everyKm: number | null; everyMonths: number | null; baseKm: number | null; baseOn: string },
) {
  const { error } = await supabase.from('maintenance_plans').upsert(
    {
      motorcycle_id: motorcycleId,
      kind,
      every_km: p.everyKm,
      every_months: p.everyMonths,
      base_km: p.baseKm,
      base_on: p.baseOn,
      notified_key: null,
    },
    { onConflict: 'motorcycle_id,kind' },
  );
  if (error) throw new Error(error.message);
  await refreshGarage();
}

export async function deletePlan(id: string) {
  const { error } = await supabase.from('maintenance_plans').delete().eq('id', id);
  if (error) throw error;
  await refreshGarage();
}

export async function addRecord(r: Omit<MaintenanceRecord, 'id'>) {
  const { error } = await supabase.from('maintenance_records').insert({
    motorcycle_id: r.motorcycleId,
    kind: r.kind,
    done_on: r.doneOn,
    odometer_km: r.odometerKm,
    cost_eur: r.costEur,
    notes: r.notes,
  });
  if (error) throw new Error(error.message);
  await refreshGarage();
}

export async function deleteRecord(id: string) {
  const { error } = await supabase.from('maintenance_records').delete().eq('id', id);
  if (error) throw error;
  await refreshGarage();
}

// ---------- Calculs ----------

export type DueLevel = 'ok' | 'soon' | 'due';

/** Échéance d'un rappel : km et jours restants (même règle que le serveur : 500 km ou 15 jours) */
export function planStatus(plan: MaintenancePlan, odometerKm: number | null, today = new Date()) {
  const kmLeft = plan.everyKm !== null && plan.baseKm !== null && odometerKm !== null ? plan.baseKm + plan.everyKm - odometerKm : null;
  let daysLeft: number | null = null;
  if (plan.everyMonths !== null) {
    const due = new Date(`${plan.baseOn}T12:00:00`);
    due.setMonth(due.getMonth() + plan.everyMonths);
    daysLeft = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  }
  const level: DueLevel =
    (kmLeft !== null && kmLeft <= 0) || (daysLeft !== null && daysLeft <= 0)
      ? 'due'
      : (kmLeft !== null && kmLeft <= 500) || (daysLeft !== null && daysLeft <= 15)
        ? 'soon'
        : 'ok';
  return { kmLeft, daysLeft, level };
}

export function dueText(s: { kmLeft: number | null; daysLeft: number | null; level: DueLevel }) {
  if (s.level === 'due') return 'À faire maintenant';
  const parts: string[] = [];
  if (s.kmLeft !== null) parts.push(`dans ${s.kmLeft.toLocaleString('fr-FR')} km`);
  if (s.daysLeft !== null) {
    parts.push(s.daysLeft > 60 ? `dans ${Math.round(s.daysLeft / 30)} mois` : `dans ${s.daysLeft} j`);
  }
  return parts.join(' ou ') || '—';
}

/** Autonomie : plein complet, et restant estimé (null si réservoir, conso ou dernier plein inconnus) */
export function fuelRange(g: Garage | null, extraKm = 0): { fullKm: number; leftKm: number | null } | null {
  if (!g || !g.tankL || !g.consumptionL100) return null;
  const fullKm = (g.tankL / g.consumptionL100) * 100;
  if (g.fillOdometerKm === null) return { fullKm, leftKm: null };
  const driven = Math.max(0, g.odometerKm + extraKm - g.fillOdometerKm);
  return { fullKm, leftKm: Math.max(0, fullKm - driven) };
}

// ---------- Cache partagé (garage, navigation, carte) ----------

let state: { userId: string; data: Record<string, MotoGarage> } | null = null;
let currentUser: string | null = null;
const listeners = new Set<() => void>();

export async function refreshGarage(userId = currentUser) {
  if (!userId) return;
  currentUser = userId;
  const data = await fetchMyGarage(userId);
  state = { userId, data };
  listeners.forEach((l) => l());
}

/** Garage de mes motos (chargé une fois, rafraîchi après chaque modification) */
export function useMyGarage(userId: string | undefined) {
  useEffect(() => {
    if (userId && (state?.userId !== userId)) refreshGarage(userId).catch((e) => console.warn('Garage indisponible', e));
  }, [userId]);
  const snapshot = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
  return snapshot && snapshot.userId === userId ? snapshot.data : null;
}
