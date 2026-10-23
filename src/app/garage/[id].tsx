import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { showActionSheet } from '@/components/action-sheet';
import { DateTimeField } from '@/components/form-fields';
import { Button, Chip, Field, Section } from '@/components/ui';
import { Fonts, makeStyles, Radius, Type, useColors } from '@/constants/theme';
import {
  deletePlan,
  deleteRecord,
  dueText,
  fuelRange,
  INSPECTION_HINT,
  invoiceUrl,
  KIND_GROUPS,
  kindInfo,
  markFilled,
  PLAN_KINDS,
  planStatus,
  RECORD_KINDS,
  removeInvoice,
  saveGarage,
  savePlan,
  saveRecord,
  spentByYear,
  uploadInvoice,
  useMyGarage,
  type Garage,
  type MaintenanceKind,
  type MaintenancePlan,
  type MaintenanceRecord,
  type PlanKind,
} from '@/lib/garage';
import { errorMessage } from '@/lib/errors';
import { pickImage } from '@/lib/pick-image';
import { useSession } from '@/lib/session';
import { FUEL_TYPES, type FuelType } from '@/lib/fuel-prices';
import { FeatureGate } from '@/components/feature-gate';

/** Nombre saisi (virgule acceptée) ; null si vide, NaN si invalide */
function num(text: string) {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIsoDay = (s: string) => new Date(`${s}T12:00:00`);
const frDay = (s: string) => fromIsoDay(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const euros = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;

type Status = { ok: boolean; text: string } | null;

/** Résultat d'un enregistrement affiché sous le bouton : succès 4 s, erreur jusqu'au prochain essai (jamais d'échec silencieux) */
function useSaveStatus() {
  const [status, setStatus] = useState<Status>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const show = (next: Status) => {
    if (timer.current) clearTimeout(timer.current);
    setStatus(next);
    if (next?.ok) timer.current = setTimeout(() => setStatus(null), 4000);
  };
  return {
    status,
    clear: () => show(null),
    ok: (text: string) => show({ ok: true, text }),
    fail: (e: unknown) => show({ ok: false, text: typeof e === 'string' ? e : errorMessage(e) }),
  };
}

function SaveStatus({ status }: { status: Status }) {
  const Colors = useColors();
  const styles = useStyles();
  if (!status) return null;
  return (
    <View
      style={[
        styles.status,
        { backgroundColor: status.ok ? Colors.successSoft : Colors.background, borderColor: status.ok ? Colors.success : Colors.danger },
      ]}>
      {!status.ok && <Ionicons name="alert-circle" size={20} color={Colors.danger} />}
      <Text style={[styles.statusText, { color: status.ok ? Colors.successDark : Colors.danger }]} accessibilityLiveRegion="polite">
        {status.text}
      </Text>
    </View>
  );
}

/**
 * Fiche garage d'une moto : compteur, carburant, rappels d'entretien, carnet.
 * Carnet et rappels : moto principale seulement (le multi-motos est prévu en premium) ; sur une
 * autre moto, l'historique déjà noté reste visible en lecture.
 */
function MotoGarageScreenContent() {
  const Colors = useColors();
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, profile } = useSession();
  const moto = profile?.motorcycles.find((m) => m.id === id);
  const all = useMyGarage(session?.user.id);
  const data = all?.[id] ?? { garage: null, plans: [], records: [] };

  if (!moto) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Moto introuvable.</Text>
      </View>
    );
  }

  const editable = moto.is_main;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: `${moto.brand} ${moto.model}` }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.hint}>
          {[moto.brand, moto.model, moto.year ? String(moto.year) : null].filter(Boolean).join(' · ')}
          {moto.is_main ? ' · moto principale' : ''}
        </Text>
        {/* Remonté une seule fois, quand les données arrivent (jamais pendant la saisie : ça effaçait les champs) */}
        <CounterSection key={all ? 'ready' : 'loading'} motoId={id} garage={data.garage} />
        {!editable && (
          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={20} color={Colors.accentOnSoft} />
            <Text style={styles.noticeText}>
              Le carnet d’entretien et les rappels suivent ta moto principale. Pour les utiliser avec celle-ci, choisis-la comme moto
              principale dans ton profil.
            </Text>
          </View>
        )}
        <PlansSection motoId={id} plans={data.plans} odometerKm={data.garage?.odometerKm ?? null} editable={editable} />
        <LogSection motoId={id} garage={data.garage} records={data.records} editable={editable} userId={session?.user.id ?? ''} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function CounterSection({ motoId, garage }: { motoId: string; garage: Garage | null }) {
  const Colors = useColors();
  const styles = useStyles();
  const [odometer, setOdometer] = useState(garage ? String(garage.odometerKm) : '');
  const [tank, setTank] = useState(garage?.tankL ? String(garage.tankL).replace('.', ',') : '');
  const [conso, setConso] = useState(garage?.consumptionL100 ? String(garage.consumptionL100).replace('.', ',') : '');
  const [rangeKm, setRangeKm] = useState(garage?.rangeKm ? String(garage.rangeKm) : '');
  const [fuelType, setFuelType] = useState<FuelType | null>(garage?.fuelType ?? null);
  const [saving, setSaving] = useState(false);
  const result = useSaveStatus();
  const range = fuelRange(garage);

  const save = async () => {
    if (saving) return;
    const o = num(odometer);
    const t = num(tank);
    const c = num(conso);
    const r = num(rangeKm);
    const errors: string[] = [];
    if (r !== null && (Number.isNaN(r) || r < 20 || r > 1500)) errors.push('Autonomie : entre 20 et 1 500 km.');
    if (o === null) errors.push('Indique le kilométrage actuel.');
    else if (Number.isNaN(o) || o < 0 || o > 2_000_000) errors.push('Kilométrage invalide (chiffres seulement, ex. 12500).');
    if (t !== null && (Number.isNaN(t) || t <= 0 || t > 60)) errors.push('Réservoir : entre 1 et 60 litres.');
    if (c !== null && (Number.isNaN(c) || c <= 0 || c > 30)) errors.push('Consommation : entre 1 et 30 L/100 km.');
    if (errors.length) {
      result.fail(errors.join('\n'));
      return;
    }
    setSaving(true);
    result.clear();
    try {
      await saveGarage(motoId, {
        odometerKm: Math.round(o!),
        tankL: t === null ? null : Math.round(t * 10) / 10,
        consumptionL100: c === null ? null : Math.round(c * 10) / 10,
        rangeKm: r === null ? null : Math.round(r),
        fuelType,
        // Premier enregistrement : on considère le plein fait maintenant
        ...(garage?.fillOdometerKm == null && (t !== null || r !== null) ? { fillOdometerKm: Math.round(o!), fillLevel: 1 } : {}),
      });
      result.ok('✅ Moto enregistrée');
    } catch (e) {
      result.fail(e);
    } finally {
      setSaving(false);
    }
  };

  const filled = async () => {
    if (!garage) return;
    try {
      await markFilled(garage);
      result.ok('✅ Plein noté');
    } catch (e) {
      result.fail(e);
    }
  };

  return (
    <Section title="Compteur et carburant">
      <Field label="Kilométrage actuel" value={odometer} onChangeText={setOdometer} keyboardType="number-pad" maxLength={7} placeholder="ex. 12500" />
      <View style={styles.row}>
        <View style={styles.col}>
          <Field label="Réservoir (L)" value={tank} onChangeText={setTank} keyboardType="decimal-pad" maxLength={4} placeholder="14" />
        </View>
        <View style={styles.col}>
          <Field label="Conso (L/100 km)" value={conso} onChangeText={setConso} keyboardType="decimal-pad" maxLength={4} placeholder="4,5" />
        </View>
      </View>
      <Field
        label="Ou directement : autonomie d’un plein (km)"
        value={rangeKm}
        onChangeText={setRangeKm}
        keyboardType="number-pad"
        maxLength={4}
        placeholder="ex. 250"
      />
      <Text style={styles.hint}>Carburant (prix mis en avant sur la carte et sur ton trajet)</Text>
      <View style={styles.chips}>
        {FUEL_TYPES.map((f) => (
          <Chip key={f.value} label={f.label} selected={fuelType === f.value} onPress={() => setFuelType(fuelType === f.value ? null : f.value)} />
        ))}
      </View>
      <Button title="Enregistrer" variant="secondary" loading={saving} loadingTitle="Enregistrement…" onPress={save} />
      <SaveStatus status={result.status} />
      {range && (
        <View style={styles.fuel}>
          <Ionicons name="speedometer" size={22} color={Colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.fuelValue}>
              {range.leftKm !== null ? `Autonomie restante ~${Math.round(range.leftKm)} km` : 'Dernier plein inconnu'}
            </Text>
            <Text style={styles.muted}>
              Plein complet : ~{Math.round(range.fullKm)} km
              {garage?.filledAt ? ` · dernier plein le ${new Date(garage.filledAt).toLocaleDateString('fr-FR')}` : ''}
            </Text>
          </View>
        </View>
      )}
      {range && <Button title="J’ai fait le plein" icon="water-outline" onPress={filled} />}
      <Text style={styles.hint}>
        Au départ d’une navigation avec ta moto principale, l’app te demande ton niveau (plein, 3/4, 1/2, 1/4) ; elle te
        prévient si l’autonomie ne suffit pas ou passe sous 50 km et te propose une station sur le trajet.
      </Text>
    </Section>
  );
}

// ---------- Rappels ----------

function PlansSection({ motoId, plans, odometerKm, editable }: { motoId: string; plans: MaintenancePlan[]; odometerKm: number | null; editable: boolean }) {
  const styles = useStyles();
  const [adding, setAdding] = useState<PlanKind | null>(null);
  const result = useSaveStatus();
  const order = (p: MaintenancePlan) => ['due', 'soon', 'ok'].indexOf(planStatus(p, odometerKm).level);
  const sorted = [...plans].sort((a, b) => order(a) - order(b));
  const free = PLAN_KINDS.filter((k) => !plans.some((p) => p.kind === k));

  const choose = () =>
    showActionSheet({
      title: 'Ajouter un rappel',
      options: free.map((k) => ({ label: kindInfo(k).label, icon: kindInfo(k).icon, onPress: () => setAdding(k) })),
    });

  return (
    <Section title="Rappels d’entretien">
      {sorted.length === 0 && !adding && <Text style={styles.muted}>Aucun rappel. Ajoute-en un : vidange, pneus, chaîne, contrôle technique…</Text>}
      {sorted.map((p) => (
        <PlanRow key={p.id} motoId={motoId} kind={p.kind} plan={p} odometerKm={odometerKm} editable={editable} onSaved={result.ok} />
      ))}
      {adding && <PlanRow key={`new-${adding}`} motoId={motoId} kind={adding} plan={null} odometerKm={odometerKm} editable startOpen onDone={() => setAdding(null)} onSaved={result.ok} />}
      <SaveStatus status={result.status} />
      {editable && !adding && free.length > 0 && <Button title="Ajouter un rappel" icon="alarm-outline" variant="secondary" onPress={choose} />}
      <Text style={styles.hint}>
        Notification 500 km ou 15 jours avant (30 jours pour le contrôle technique et l’assurance), puis le jour J. Intervalles indicatifs :
        suis le carnet du constructeur.
      </Text>
    </Section>
  );
}

function PlanRow({
  motoId,
  kind,
  plan,
  odometerKm,
  editable,
  startOpen,
  onDone,
  onSaved,
}: {
  motoId: string;
  kind: PlanKind;
  plan: MaintenancePlan | null;
  odometerKm: number | null;
  editable: boolean;
  startOpen?: boolean;
  onDone?: () => void;
  /** Succès : message montré par la section (la ligne se referme) */
  onSaved: (text: string) => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const info = kindInfo(kind);
  const [editing, setEditing] = useState(!!startOpen);
  const [everyKm, setEveryKm] = useState(String(plan?.everyKm ?? info.everyKm ?? ''));
  const [everyMonths, setEveryMonths] = useState(String(plan?.everyMonths ?? info.everyMonths ?? ''));
  const [baseKm, setBaseKm] = useState(String(plan?.baseKm ?? odometerKm ?? ''));
  const [baseOn, setBaseOn] = useState(plan ? fromIsoDay(plan.baseOn) : new Date());
  // Contrôle technique / assurance : prochaine échéance saisie
  const [dueOn, setDueOn] = useState<Date>(() => {
    if (plan?.dueOn) return fromIsoDay(plan.dueOn);
    const d = plan ? fromIsoDay(plan.baseOn) : new Date();
    d.setMonth(d.getMonth() + (plan?.everyMonths ?? info.everyMonths ?? 12));
    return d;
  });
  const [saving, setSaving] = useState(false);
  const result = useSaveStatus();
  const status = plan ? planStatus(plan, odometerKm) : null;

  const close = () => {
    setEditing(false);
    onDone?.();
  };

  const save = async () => {
    if (saving) return;
    const k = info.dueDate ? null : num(everyKm);
    const m = num(everyMonths);
    const b = info.dueDate ? null : num(baseKm);
    const errors: string[] = [];
    if (k === null && m === null) errors.push('Indique un intervalle en km et/ou en mois.');
    if (k !== null && (Number.isNaN(k) || k < 100 || k > 100_000)) errors.push('Intervalle : entre 100 et 100 000 km.');
    if (m !== null && (Number.isNaN(m) || m < 1 || m > 120)) errors.push('Intervalle : entre 1 et 120 mois.');
    if (b !== null && (Number.isNaN(b) || b < 0)) errors.push('Kilométrage du dernier entretien invalide.');
    if (errors.length) {
      result.fail(errors.join('\n'));
      return;
    }
    setSaving(true);
    result.clear();
    try {
      await savePlan(motoId, kind, {
        everyKm: k === null ? null : Math.round(k),
        everyMonths: m === null ? null : Math.round(m),
        baseKm: b === null ? null : Math.round(b),
        baseOn: info.dueDate ? isoDay(new Date()) : isoDay(baseOn),
        dueOn: info.dueDate ? isoDay(dueOn) : null,
      });
      close();
      onSaved(plan ? '✅ Rappel enregistré' : '✅ Rappel ajouté');
    } catch (e) {
      result.fail(e);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!plan) return;
    try {
      await deletePlan(plan.id);
      close();
      onSaved('✅ Rappel supprimé');
    } catch (e) {
      result.fail(e);
    }
  };

  const color = status?.level === 'due' ? Colors.danger : status?.level === 'soon' ? Colors.warning : Colors.textMuted;
  const every = plan
    ? [plan.everyKm ? `${plan.everyKm.toLocaleString('fr-FR')} km` : null, plan.everyMonths ? `${plan.everyMonths} mois` : null].filter(Boolean).join(' / ')
    : '';

  return (
    <View style={styles.plan}>
      <Pressable style={styles.planHeader} onPress={!editable ? undefined : editing ? close : () => setEditing(true)} disabled={!editable}>
        <Ionicons name={info.icon} size={22} color={Colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={styles.planLabel}>{info.label}</Text>
          <Text style={[styles.small, { color }, status && status.level !== 'ok' && { fontFamily: Fonts.bold }]}>
            {plan && status ? `${dueText(status, kind)}${info.dueDate ? '' : ` · tous les ${every}`}` : 'Nouveau rappel'}
          </Text>
        </View>
        {editable && <Ionicons name={editing ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />}
      </Pressable>
      {editing && (
        <View style={styles.editor}>
          {info.dueDate ? (
            <>
              <DateTimeField label="Prochaine échéance" mode="date" value={dueOn} onChange={setDueOn} />
              <Field label="Puis tous les (mois)" value={everyMonths} onChangeText={setEveryMonths} keyboardType="number-pad" maxLength={3} />
              {kind === 'inspection' && <Text style={styles.hint}>{INSPECTION_HINT}</Text>}
              {kind === 'insurance' && <Text style={styles.hint}>Date d’échéance de ton contrat (sur ton avis d’échéance).</Text>}
            </>
          ) : (
            <>
              <View style={styles.row}>
                <View style={styles.col}>
                  <Field label="Tous les (km)" value={everyKm} onChangeText={setEveryKm} keyboardType="number-pad" maxLength={6} />
                </View>
                <View style={styles.col}>
                  <Field label="Et/ou tous les (mois)" value={everyMonths} onChangeText={setEveryMonths} keyboardType="number-pad" maxLength={3} />
                </View>
              </View>
              <Text style={styles.label}>Dernière fois</Text>
              <View style={styles.row}>
                <View style={styles.col}>
                  <Field label="Au compteur (km)" value={baseKm} onChangeText={setBaseKm} keyboardType="number-pad" maxLength={7} />
                </View>
                <View style={styles.col}>
                  <DateTimeField label="Le" mode="date" value={baseOn} onChange={setBaseOn} />
                </View>
              </View>
            </>
          )}
          <Button title="Enregistrer le rappel" loading={saving} loadingTitle="Enregistrement…" onPress={save} />
          <SaveStatus status={result.status} />
          {plan ? <Button title="Supprimer le rappel" variant="ghost" onPress={remove} /> : <Button title="Annuler" variant="ghost" onPress={close} />}
        </View>
      )}
    </View>
  );
}

// ---------- Carnet ----------

type Draft = {
  id?: string;
  kind: MaintenanceKind;
  doneOn: Date;
  km: string;
  cost: string;
  garageName: string;
  notes: string;
  invoicePath: string | null;
};

function LogSection({
  motoId,
  garage,
  records,
  editable,
  userId,
}: {
  motoId: string;
  garage: Garage | null;
  records: MaintenanceRecord[];
  editable: boolean;
  userId: string;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  // Facture envoyée pendant cette saisie (effacée si on annule)
  const [uploaded, setUploaded] = useState<string | null>(null);
  const result = useSaveStatus();

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const start = () => {
    setUploaded(null);
    setDraft({ kind: 'oil', doneOn: new Date(), km: garage ? String(garage.odometerKm) : '', cost: '', garageName: '', notes: '', invoicePath: null });
  };

  const edit = (r: MaintenanceRecord) => {
    setUploaded(null);
    setDraft({
      id: r.id,
      kind: r.kind,
      doneOn: fromIsoDay(r.doneOn),
      km: r.odometerKm === null ? '' : String(r.odometerKm),
      cost: r.costEur === null ? '' : String(r.costEur).replace('.', ','),
      garageName: r.garageName ?? '',
      notes: r.notes ?? '',
      invoicePath: r.invoicePath,
    });
  };

  const cancel = () => {
    if (uploaded) removeInvoice(uploaded);
    setUploaded(null);
    setDraft(null);
  };

  const addInvoice = async () => {
    const image = await pickImage('Photo de la facture');
    if (!image) return;
    setUploading(true);
    try {
      const path = await uploadInvoice(userId, image);
      if (uploaded) removeInvoice(uploaded);
      setUploaded(path);
      set({ invoicePath: path });
    } catch (e) {
      Alert.alert('Facture', errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!draft || saving) return;
    const k = num(draft.km);
    const c = num(draft.cost);
    if ((k !== null && (Number.isNaN(k) || k < 0 || k > 2_000_000)) || (c !== null && (Number.isNaN(c) || c < 0 || c > 999_999))) {
      result.fail('Kilométrage ou coût invalide (chiffres seulement).');
      return;
    }
    const before = draft.id ? records.find((r) => r.id === draft.id) : null;
    setSaving(true);
    result.clear();
    try {
      await saveRecord({
        id: draft.id,
        motorcycleId: motoId,
        kind: draft.kind,
        doneOn: isoDay(draft.doneOn),
        odometerKm: k === null ? null : Math.round(k),
        costEur: c === null ? null : Math.round(c * 100) / 100,
        notes: draft.notes.trim() || null,
        garageName: draft.garageName.trim() || null,
        invoicePath: draft.invoicePath,
      });
      // Ancienne facture remplacée ou retirée : effacée du stockage
      if (before?.invoicePath && before.invoicePath !== draft.invoicePath) removeInvoice(before.invoicePath);
      // Compteur en retard sur le kilométrage de l'entretien : on propose de l'avancer
      if (k !== null && garage && Math.round(k) > garage.odometerKm) {
        const km = Math.round(k);
        Alert.alert('Compteur', `Mettre le compteur à ${km.toLocaleString('fr-FR')} km ?`, [
          { text: 'Non', style: 'cancel' },
          {
            text: 'Oui',
            onPress: () =>
              saveGarage(motoId, { odometerKm: km })
                .then(() => result.ok('✅ Compteur mis à jour'))
                .catch((e) => result.fail(e)),
          },
        ]);
      }
      setUploaded(null);
      setDraft(null);
      result.ok(draft.id ? '✅ Entretien modifié' : '✅ Entretien ajouté au carnet');
    } catch (e) {
      result.fail(e);
    } finally {
      setSaving(false);
    }
  };

  const menu = (r: MaintenanceRecord) =>
    showActionSheet({
      title: kindInfo(r.kind).label,
      options: [
        ...(editable ? [{ label: 'Modifier', icon: 'create-outline' as const, onPress: () => edit(r) }] : []),
        ...(r.invoicePath ? [{ label: 'Voir la facture', icon: 'receipt-outline' as const, onPress: () => setViewing(r.invoicePath) }] : []),
        {
          label: 'Supprimer cet entretien',
          icon: 'trash-outline' as const,
          destructive: true,
          onPress: () =>
            Alert.alert('Supprimer cet entretien ?', 'La photo de la facture est effacée aussi.', [
              { text: 'Annuler', style: 'cancel' },
              {
                text: 'Supprimer',
                style: 'destructive',
                onPress: () =>
                  deleteRecord(r)
                    .then(() => result.ok('✅ Entretien supprimé'))
                    .catch((e) => result.fail(e)),
              },
            ]),
        },
      ],
    });

  const years = spentByYear(records);

  return (
    <Section title="Carnet d’entretien">
      {draft ? (
        <View style={styles.editor}>
          {KIND_GROUPS.map((g) => (
            <View key={g} style={{ gap: 6 }}>
              <Text style={styles.small}>{g}</Text>
              <View style={styles.chips}>
                {RECORD_KINDS.filter((k) => k.group === g).map((k) => (
                  <Chip key={k.value} label={k.label} icon={k.icon} selected={draft.kind === k.value} onPress={() => set({ kind: k.value })} />
                ))}
              </View>
            </View>
          ))}
          <View style={styles.row}>
            <View style={styles.col}>
              <DateTimeField label="Date" mode="date" value={draft.doneOn} onChange={(doneOn) => set({ doneOn })} />
            </View>
            <View style={styles.col}>
              <Field label="Kilométrage" value={draft.km} onChangeText={(km) => set({ km })} keyboardType="number-pad" maxLength={7} />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.col}>
              <Field label="Coût (€)" value={draft.cost} onChangeText={(cost) => set({ cost })} keyboardType="decimal-pad" maxLength={9} placeholder="Facultatif" />
            </View>
            <View style={styles.col}>
              <Field label="Garage" value={draft.garageName} onChangeText={(garageName) => set({ garageName })} maxLength={100} placeholder="Facultatif" />
            </View>
          </View>
          <Field label="Note" value={draft.notes} onChangeText={(notes) => set({ notes })} maxLength={500} multiline placeholder="Pièces, huile utilisée…" />
          {draft.invoicePath ? (
            <View style={styles.invoiceRow}>
              <Ionicons name="receipt-outline" size={20} color={Colors.accent} />
              <Text style={[styles.planLabel, { flex: 1 }]}>Facture jointe</Text>
              <Pressable onPress={() => setViewing(draft.invoicePath)} hitSlop={8}>
                <Text style={styles.link}>Voir</Text>
              </Pressable>
              <Pressable onPress={() => set({ invoicePath: null })} hitSlop={8}>
                <Text style={styles.link}>Retirer</Text>
              </Pressable>
            </View>
          ) : (
            <Button title="Photo de la facture" icon="camera-outline" variant="secondary" loading={uploading} onPress={addInvoice} />
          )}
          <Button title={draft.id ? 'Enregistrer' : 'Ajouter au carnet'} loading={saving} loadingTitle="Enregistrement…" disabled={uploading} onPress={save} />
          <SaveStatus status={result.status} />
          <Button title="Annuler" variant="ghost" onPress={cancel} />
        </View>
      ) : (
        <>
          {editable && <Button title="Noter un entretien" icon="add" variant="secondary" onPress={start} />}
          <SaveStatus status={result.status} />
        </>
      )}
      {records.length === 0 ? (
        <Text style={styles.muted}>Aucun entretien noté pour l’instant.</Text>
      ) : (
        records.map((r) => {
          const info = kindInfo(r.kind);
          return (
            <Pressable key={r.id} style={styles.record} onPress={() => menu(r)} onLongPress={() => menu(r)} delayLongPress={350}>
              <Ionicons name={info.icon} size={22} color={Colors.textMuted} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.planLabel}>{info.label}</Text>
                <Text style={styles.small}>
                  {frDay(r.doneOn)}
                  {r.odometerKm !== null ? ` · ${r.odometerKm.toLocaleString('fr-FR')} km` : ''}
                  {r.costEur !== null ? ` · ${euros(r.costEur)}` : ''}
                  {r.garageName ? ` · ${r.garageName}` : ''}
                </Text>
                {!!r.notes && <Text style={styles.notes}>{r.notes}</Text>}
              </View>
              {r.invoicePath && <Ionicons name="receipt-outline" size={18} color={Colors.textMuted} />}
              <Ionicons name="ellipsis-horizontal" size={20} color={Colors.textMuted} />
            </Pressable>
          );
        })
      )}
      {years.length > 0 && (
        <View style={styles.totals}>
          <Text style={styles.label}>Dépenses par an</Text>
          {years.map((y) => (
            <View key={y.year} style={styles.totalRow}>
              <Text style={styles.small}>
                {y.year} · {y.count} entretien{y.count > 1 ? 's' : ''}
              </Text>
              <Text style={styles.totalValue}>{euros(y.total)}</Text>
            </View>
          ))}
        </View>
      )}
      <InvoiceViewer path={viewing} onClose={() => setViewing(null)} />
    </Section>
  );
}

/** Facture en plein écran (URL signée temporaire, bucket privé) */
function InvoiceViewer({ path, onClose }: { path: string | null; onClose: () => void }) {
  const Colors = useColors();
  const styles = useStyles();
  const [loaded, setLoaded] = useState<{ path: string; url: string } | null>(null);
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    invoiceUrl(path)
      .then((url) => !cancelled && setLoaded({ path, url }))
      .catch((e) => {
        if (cancelled) return;
        Alert.alert('Facture', errorMessage(e));
        onClose();
      });
    return () => {
      cancelled = true;
    };
    // onClose change à chaque rendu du parent : seul le chemin compte
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  const url = loaded?.path === path ? loaded.url : null;

  return (
    <Modal visible={!!path} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.viewer}>
        {url ? <Image source={{ uri: url }} style={styles.viewerImage} contentFit="contain" /> : <ActivityIndicator color={Colors.white} />}
        <Pressable style={styles.viewerClose} onPress={onClose} hitSlop={12} accessibilityLabel="Fermer">
          <Ionicons name="close" size={28} color={Colors.white} />
        </Pressable>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  muted: { color: Colors.textMuted, fontSize: Type.body },
  hint: { fontSize: Type.small, color: Colors.textMuted, lineHeight: 18 },
  label: { fontSize: Type.body, fontWeight: '600', color: Colors.text },
  link: { fontSize: Type.body, fontWeight: '700', color: Colors.accent },
  row: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  notice: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: Colors.accentSoft, borderRadius: Radius.md, padding: 12 },
  noticeText: { flex: 1, fontSize: Type.small, color: Colors.accentOnSoft, lineHeight: 18 },
  fuel: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.accentSoft, borderRadius: Radius.md, padding: 12 },
  fuelValue: { fontSize: Type.body, fontWeight: '800', color: Colors.text },
  plan: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, backgroundColor: Colors.background },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 56 },
  planLabel: { fontSize: Type.body, fontWeight: '700', color: Colors.text },
  small: { fontSize: Type.small, color: Colors.textMuted },
  editor: { gap: 12, padding: 12, paddingTop: 0 },
  record: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 8 },
  notes: { fontSize: Type.small, color: Colors.text, marginTop: 2 },
  invoiceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: 12 },
  totals: { gap: 4, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalValue: { fontSize: Type.body, fontWeight: '800', color: Colors.text, fontVariant: ['tabular-nums'] },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: Radius.md, padding: 12 },
  statusText: { flex: 1, fontSize: Type.body, fontWeight: '700' },
  viewer: { flex: 1, backgroundColor: Colors.viewerBackdrop, alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  viewerClose: { position: 'absolute', top: 48, right: 16, padding: 4 },
}));

export default function MotoGarageScreen() {
  return (
    <FeatureGate feature="garage">
      <MotoGarageScreenContent />
    </FeatureGate>
  );
}
