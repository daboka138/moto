import { useEffect, useSyncExternalStore } from 'react';

import type { IconName } from '@/components/ui';
import type { FuelType } from '@/lib/fuel-prices';
import { readFileBytes } from '@/lib/read-file';
import { supabase } from '@/lib/supabase';

// Garage : compteur kilométrique (mis à jour à la fin de chaque navigation), réservoir et
// consommation (autonomie), carnet d'entretien et rappels. Données privées (RLS : propriétaire
// seul). Rappels envoyés par le serveur (check_maintenance_reminders, tous les jours).

export type MaintenanceKind =
  | 'oil'
  | 'oil_filter'
  | 'tire_front'
  | 'tire_rear'
  | 'chain_lube'
  | 'chain_tension'
  | 'chain_kit'
  | 'brake_pads'
  | 'brake_discs'
  | 'brake_fluid'
  | 'coolant'
  | 'spark_plugs'
  | 'service'
  | 'inspection'
  | 'insurance'
  | 'other'
  // Anciens codes (avant la note 39) : gardés pour l'historique, plus proposés
  | 'tires'
  | 'chain'
  | 'brakes';
export type PlanKind = Exclude<MaintenanceKind, 'other'>;

export type KindGroup = 'Moteur' | 'Pneus' | 'Chaîne' | 'Freins' | 'Révision et papiers' | 'Autre';

export type KindInfo = {
  value: MaintenanceKind;
  label: string;
  icon: IconName;
  group: KindGroup;
  /** Intervalle proposé pour le rappel (indicatif, modifiable) */
  everyKm: number | null;
  everyMonths: number | null;
  /** Rappel par date d'échéance (contrôle technique, assurance) */
  dueDate?: boolean;
  /** Ancien code : affiché mais plus proposé */
  legacy?: boolean;
};

export const MAINTENANCE_KINDS: KindInfo[] = [
  { value: 'oil', label: 'Vidange', icon: 'water', group: 'Moteur', everyKm: 6000, everyMonths: 12 },
  { value: 'oil_filter', label: 'Filtre à huile', icon: 'funnel-outline', group: 'Moteur', everyKm: 6000, everyMonths: 12 },
  { value: 'spark_plugs', label: 'Bougies', icon: 'flash-outline', group: 'Moteur', everyKm: 12000, everyMonths: null },
  { value: 'coolant', label: 'Liquide de refroidissement', icon: 'thermometer-outline', group: 'Moteur', everyKm: null, everyMonths: 24 },
  { value: 'tire_front', label: 'Pneu avant', icon: 'ellipse-outline', group: 'Pneus', everyKm: 15000, everyMonths: 60 },
  { value: 'tire_rear', label: 'Pneu arrière', icon: 'ellipse-outline', group: 'Pneus', everyKm: 10000, everyMonths: 60 },
  { value: 'chain_lube', label: 'Graissage de la chaîne', icon: 'link-outline', group: 'Chaîne', everyKm: 800, everyMonths: null },
  { value: 'chain_tension', label: 'Tension de la chaîne', icon: 'link-outline', group: 'Chaîne', everyKm: 1000, everyMonths: null },
  { value: 'chain_kit', label: 'Kit chaîne', icon: 'link', group: 'Chaîne', everyKm: 20000, everyMonths: null },
  { value: 'brake_pads', label: 'Plaquettes de frein', icon: 'stop-circle-outline', group: 'Freins', everyKm: 15000, everyMonths: null },
  { value: 'brake_discs', label: 'Disques de frein', icon: 'disc-outline', group: 'Freins', everyKm: 40000, everyMonths: null },
  { value: 'brake_fluid', label: 'Liquide de frein', icon: 'water-outline', group: 'Freins', everyKm: null, everyMonths: 24 },
  { value: 'service', label: 'Révision', icon: 'construct-outline', group: 'Révision et papiers', everyKm: 12000, everyMonths: 12 },
  { value: 'inspection', label: 'Contrôle technique', icon: 'clipboard-outline', group: 'Révision et papiers', everyKm: null, everyMonths: 36, dueDate: true },
  { value: 'insurance', label: 'Assurance', icon: 'document-text-outline', group: 'Révision et papiers', everyKm: null, everyMonths: 12, dueDate: true },
  { value: 'other', label: 'Autre', icon: 'create-outline', group: 'Autre', everyKm: null, everyMonths: null },
  { value: 'tires', label: 'Pneus', icon: 'ellipse-outline', group: 'Pneus', everyKm: 10000, everyMonths: 60, legacy: true },
  { value: 'chain', label: 'Chaîne', icon: 'link-outline', group: 'Chaîne', everyKm: 800, everyMonths: null, legacy: true },
  { value: 'brakes', label: 'Freins', icon: 'stop-circle-outline', group: 'Freins', everyKm: 15000, everyMonths: 24, legacy: true },
];

export const KIND_GROUPS: KindGroup[] = ['Moteur', 'Pneus', 'Chaîne', 'Freins', 'Révision et papiers', 'Autre'];

export const kindInfo = (k: MaintenanceKind) => MAINTENANCE_KINDS.find((x) => x.value === k) ?? MAINTENANCE_KINDS.find((x) => x.value === 'other')!;
/** Types proposés pour un nouvel entretien */
export const RECORD_KINDS = MAINTENANCE_KINDS.filter((k) => !k.legacy);
/** Types proposés pour un nouveau rappel */
export const PLAN_KINDS = MAINTENANCE_KINDS.filter((k) => !k.legacy && k.value !== 'other').map((k) => k.value as PlanKind);

/** Contrôle technique (règles service-public.fr, 2-roues motorisés depuis le 15 avril 2024) */
export const INSPECTION_HINT =
  'Contrôle technique obligatoire pour les 2-roues motorisés depuis le 15 avril 2024 : 1er contrôle selon la date de 1re immatriculation (calendrier progressif jusqu’en 2026, puis 5 ans après la 1re immatriculation), ensuite tous les 3 ans. Vérifie ta date sur service-public.fr.';

export type Garage = {
  motorcycleId: string;
  odometerKm: number;
  tankL: number | null;
  consumptionL100: number | null;
  /** Compteur au dernier plein (null = inconnu) */
  fillOdometerKm: number | null;
  filledAt: string | null;
  /** Autonomie d'un plein saisie directement (km), prioritaire sur réservoir / conso */
  rangeKm: number | null;
  /** Niveau au dernier « plein » noté : 1 = plein, 0,75, 0,5, 0,25 */
  fillLevel: number;
  /** Carburant de la moto (prix mis en avant sur la carte et le trajet), null = non renseigné */
  fuelType: FuelType | null;
};

/** Niveaux proposés au départ d'une navigation */
export const FUEL_LEVELS: { value: number; label: string }[] = [
  { value: 1, label: 'Plein' },
  { value: 0.75, label: '3/4' },
  { value: 0.5, label: '1/2' },
  { value: 0.25, label: '1/4' },
];

export type MaintenancePlan = {
  id: string;
  motorcycleId: string;
  kind: PlanKind;
  everyKm: number | null;
  everyMonths: number | null;
  /** Dernière fois (relancée à chaque entretien noté dans le carnet) */
  baseKm: number | null;
  baseOn: string;
  /** Échéance saisie (contrôle technique, assurance) ; null = calculée depuis la dernière fois */
  dueOn: string | null;
};

export type MaintenanceRecord = {
  id: string;
  motorcycleId: string;
  kind: MaintenanceKind;
  doneOn: string;
  odometerKm: number | null;
  costEur: number | null;
  notes: string | null;
  garageName: string | null;
  /** Photo de la facture (bucket privé invoices) */
  invoicePath: string | null;
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
  range_km: number | null;
  fill_level: number | string | null;
  fuel_type: FuelType | null;
};

const toGarage = (r: GarageRow): Garage => ({
  motorcycleId: r.motorcycle_id,
  odometerKm: r.odometer_km,
  tankL: r.tank_l === null ? null : Number(r.tank_l),
  consumptionL100: r.consumption_l100 === null ? null : Number(r.consumption_l100),
  fillOdometerKm: r.fill_odometer_km,
  filledAt: r.filled_at,
  rangeKm: r.range_km,
  fillLevel: r.fill_level === null ? 1 : Number(r.fill_level),
  fuelType: r.fuel_type ?? null,
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
      dueOn: row.due_on ?? null,
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
      garageName: row.garage_name ?? null,
      invoicePath: row.invoice_path ?? null,
    });
  }
  return out;
}

export async function saveGarage(
  motorcycleId: string,
  patch: {
    odometerKm?: number;
    tankL?: number | null;
    consumptionL100?: number | null;
    fillOdometerKm?: number | null;
    rangeKm?: number | null;
    fillLevel?: number;
    fuelType?: FuelType | null;
  },
) {
  const row: Record<string, unknown> = { motorcycle_id: motorcycleId };
  if (patch.odometerKm !== undefined) row.odometer_km = patch.odometerKm;
  if (patch.tankL !== undefined) row.tank_l = patch.tankL;
  if (patch.consumptionL100 !== undefined) row.consumption_l100 = patch.consumptionL100;
  if (patch.rangeKm !== undefined) row.range_km = patch.rangeKm;
  if (patch.fillLevel !== undefined) row.fill_level = patch.fillLevel;
  if (patch.fuelType !== undefined) row.fuel_type = patch.fuelType;
  if (patch.fillOdometerKm !== undefined) {
    row.fill_odometer_km = patch.fillOdometerKm;
    row.filled_at = patch.fillOdometerKm === null ? null : new Date().toISOString();
  }
  const { error } = await supabase.from('motorcycle_garage').upsert(row);
  if (error) throw new Error(error.message);
  await refreshGarage();
}

/** Plein fait (ou niveau noté au départ) : la jauge repart du compteur actuel (+ km de la navigation en cours) */
export async function markFilled(g: Garage, extraKm = 0, level = 1) {
  await saveGarage(g.motorcycleId, { fillOdometerKm: Math.round(g.odometerKm + extraKm), fillLevel: level });
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
  p: { everyKm: number | null; everyMonths: number | null; baseKm: number | null; baseOn: string; dueOn?: string | null },
) {
  const { error } = await supabase.from('maintenance_plans').upsert(
    {
      motorcycle_id: motorcycleId,
      kind,
      every_km: p.everyKm,
      every_months: p.everyMonths,
      base_km: p.baseKm,
      base_on: p.baseOn,
      due_on: p.dueOn ?? null,
      notified_key: null,
    },
    { onConflict: 'motorcycle_id,kind' },
  );
  if (error) throw new Error(friendly(error.message));
  await refreshGarage();
}

export async function deletePlan(id: string) {
  const { error } = await supabase.from('maintenance_plans').delete().eq('id', id);
  if (error) throw error;
  await refreshGarage();
}

/** Refus du serveur (carnet réservé à la moto principale) en clair */
const friendly = (message: string) =>
  message.includes('row-level security') ? 'Le carnet d’entretien suit ta moto principale : choisis-la dans ton profil.' : message;

/** Ajoute (sans id) ou modifie un entretien */
export async function saveRecord(r: Omit<MaintenanceRecord, 'id'> & { id?: string }) {
  const row = {
    motorcycle_id: r.motorcycleId,
    kind: r.kind,
    done_on: r.doneOn,
    odometer_km: r.odometerKm,
    cost_eur: r.costEur,
    notes: r.notes,
    garage_name: r.garageName,
    invoice_path: r.invoicePath,
  };
  const { error } = r.id
    ? await supabase.from('maintenance_records').update(row).eq('id', r.id)
    : await supabase.from('maintenance_records').insert(row);
  if (error) throw new Error(friendly(error.message));
  await refreshGarage();
}

export async function deleteRecord(r: Pick<MaintenanceRecord, 'id' | 'invoicePath'>) {
  const { error } = await supabase.from('maintenance_records').delete().eq('id', r.id);
  if (error) throw error;
  if (r.invoicePath) await removeInvoice(r.invoicePath);
  await refreshGarage();
}

// ---------- Factures (bucket privé invoices, <uid>/…) ----------

const INVOICES = 'invoices';
const SIGNED_URL_S = 3600;

/** Envoie la photo d'une facture dans mon dossier privé ; renvoie son chemin */
export async function uploadInvoice(userId: string, image: { uri: string; mimeType?: string }): Promise<string> {
  const contentType = image.mimeType && ['image/png', 'image/webp'].includes(image.mimeType) ? image.mimeType : 'image/jpeg';
  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/invoice-${Date.now()}.${ext}`;
  const bytes = await readFileBytes(image.uri);
  const { error } = await supabase.storage.from(INVOICES).upload(path, bytes, { contentType });
  if (error) throw new Error(error.message.includes('size') ? 'Photo trop lourde (5 Mo maximum).' : error.message);
  return path;
}

export async function removeInvoice(path: string) {
  const { error } = await supabase.storage.from(INVOICES).remove([path]);
  if (error) console.warn('Facture non effacée', error.message);
}

/** URL temporaire (1 h) pour afficher une facture */
export async function invoiceUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(INVOICES).createSignedUrl(path, SIGNED_URL_S);
  if (error || !data) throw error ?? new Error('Facture indisponible');
  return data.signedUrl;
}

// ---------- Calculs ----------

export type DueLevel = 'ok' | 'soon' | 'due';

/** Jours d'avance du rappel « bientôt » (même règle que le serveur) */
export const soonDays = (kind: MaintenanceKind) => (kind === 'inspection' || kind === 'insurance' ? 30 : 15);

const addMonths = (iso: string, months: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setMonth(d.getMonth() + months);
  return d;
};

/** Échéance d'un rappel : km et jours restants (même règle que le serveur : 500 km, 15 ou 30 jours) */
export function planStatus(plan: MaintenancePlan, odometerKm: number | null, today = new Date()) {
  const kmLeft = plan.everyKm !== null && plan.baseKm !== null && odometerKm !== null ? plan.baseKm + plan.everyKm - odometerKm : null;
  const due = plan.dueOn ? new Date(`${plan.dueOn}T12:00:00`) : plan.everyMonths !== null ? addMonths(plan.baseOn, plan.everyMonths) : null;
  // Jours calendaires (midi contre midi : ni l'heure ni le changement d'heure ne comptent)
  const noon = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const daysLeft = due ? Math.round((due.getTime() - noon.getTime()) / 86_400_000) : null;
  const level: DueLevel =
    (kmLeft !== null && kmLeft <= 0) || (daysLeft !== null && daysLeft <= 0)
      ? 'due'
      : (kmLeft !== null && kmLeft <= 500) || (daysLeft !== null && daysLeft <= soonDays(plan.kind))
        ? 'soon'
        : 'ok';
  return { kmLeft, daysLeft, dueDate: due, level };
}

export function dueText(s: { kmLeft: number | null; daysLeft: number | null; dueDate?: Date | null; level: DueLevel }, kind?: MaintenanceKind) {
  const byDate = kind === 'inspection' || kind === 'insurance';
  if (s.level === 'due') return byDate ? 'Échéance dépassée' : 'À faire maintenant';
  if (byDate && s.dueDate) return `Échéance le ${s.dueDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const parts: string[] = [];
  if (s.kmLeft !== null) parts.push(`dans ${s.kmLeft.toLocaleString('fr-FR')} km`);
  if (s.daysLeft !== null) {
    parts.push(s.daysLeft > 60 ? `dans ${Math.round(s.daysLeft / 30)} mois` : `dans ${s.daysLeft} j`);
  }
  return parts.join(' ou ') || '—';
}

/** Total dépensé par année (années les plus récentes d'abord) */
export function spentByYear(records: Pick<MaintenanceRecord, 'doneOn' | 'costEur'>[]): { year: number; total: number; count: number }[] {
  const years = new Map<number, { total: number; count: number }>();
  for (const r of records) {
    if (r.costEur === null) continue;
    const y = Number(r.doneOn.slice(0, 4));
    const cur = years.get(y) ?? { total: 0, count: 0 };
    cur.total += r.costEur;
    cur.count += 1;
    years.set(y, cur);
  }
  return [...years.entries()].map(([year, v]) => ({ year, total: Math.round(v.total * 100) / 100, count: v.count })).sort((a, b) => b.year - a.year);
}

/** Autonomie d'un plein : saisie directe, sinon réservoir / conso (null si inconnue) */
export function fullRangeKm(g: Garage | null): number | null {
  if (!g) return null;
  if (g.rangeKm) return g.rangeKm;
  return g.tankL && g.consumptionL100 ? (g.tankL / g.consumptionL100) * 100 : null;
}

/** Autonomie : plein complet, et restant estimé (null si autonomie ou dernier plein inconnus) */
export function fuelRange(g: Garage | null, extraKm = 0): { fullKm: number; leftKm: number | null } | null {
  const fullKm = fullRangeKm(g);
  if (!g || !fullKm) return null;
  if (g.fillOdometerKm === null) return { fullKm, leftKm: null };
  const driven = Math.max(0, g.odometerKm + extraKm - g.fillOdometerKm);
  return { fullKm, leftKm: Math.max(0, fullKm * g.fillLevel - driven) };
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
