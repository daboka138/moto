import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { showActionSheet } from '@/components/action-sheet';
import { DateTimeField } from '@/components/form-fields';
import { Button, Chip, Field, Section } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import {
  addRecord,
  deletePlan,
  deleteRecord,
  dueText,
  fuelRange,
  kindInfo,
  MAINTENANCE_KINDS,
  markFilled,
  PLAN_KINDS,
  planStatus,
  savePlan,
  saveGarage,
  useMyGarage,
  type Garage,
  type MaintenanceKind,
  type MaintenancePlan,
  type PlanKind,
} from '@/lib/garage';
import { useSession } from '@/lib/session';

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

/** Fiche garage d'une moto : compteur, carburant, rappels d'entretien, carnet. */
export default function MotoGarageScreen() {
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

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: `${moto.brand} ${moto.model}` }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Remonté quand les données arrivent : les champs repartent des valeurs enregistrées */}
        <CounterSection key={all ? `g-${data.garage?.odometerKm}-${data.garage?.fillOdometerKm}` : 'loading'} motoId={id} garage={data.garage} />
        <Section title="Rappels d’entretien">
          {PLAN_KINDS.map((k) => (
            <PlanRow key={k} motoId={id} kind={k} plan={data.plans.find((p) => p.kind === k) ?? null} odometerKm={data.garage?.odometerKm ?? null} />
          ))}
          <Text style={styles.hint}>Tu reçois une notification 500 km ou 15 jours avant l’échéance, puis le jour J.</Text>
        </Section>
        <LogSection motoId={id} garage={data.garage} records={data.records} />
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
  const [saving, setSaving] = useState(false);
  const range = fuelRange(garage);

  const save = async () => {
    const o = num(odometer);
    const t = num(tank);
    const c = num(conso);
    const errors: string[] = [];
    if (o === null || Number.isNaN(o) || o < 0 || o > 2_000_000) errors.push('Kilométrage invalide.');
    if (t !== null && (Number.isNaN(t) || t <= 0 || t > 60)) errors.push('Réservoir : entre 1 et 60 litres.');
    if (c !== null && (Number.isNaN(c) || c <= 0 || c > 30)) errors.push('Consommation : entre 1 et 30 L/100 km.');
    if (errors.length) {
      Alert.alert('À corriger', errors.join('\n'));
      return;
    }
    setSaving(true);
    try {
      await saveGarage(motoId, {
        odometerKm: Math.round(o!),
        tankL: t === null ? null : Math.round(t * 10) / 10,
        consumptionL100: c === null ? null : Math.round(c * 10) / 10,
        // Premier enregistrement : on considère le plein fait maintenant
        ...(garage?.fillOdometerKm == null && t !== null ? { fillOdometerKm: Math.round(o!) } : {}),
      });
    } catch (e) {
      Alert.alert('Enregistrement impossible', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const filled = async () => {
    if (!garage) return;
    try {
      await markFilled(garage);
    } catch (e) {
      Alert.alert('Plein', e instanceof Error ? e.message : String(e));
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
      <Button title="Enregistrer" variant="secondary" loading={saving} onPress={save} />
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
      {garage?.tankL && <Button title="⛽ J’ai fait le plein" onPress={filled} />}
      <Text style={styles.hint}>
        En navigation avec ta moto principale, l’app te prévient si l’autonomie devient juste et te propose une station sur
        le trajet.
      </Text>
    </Section>
  );
}

function PlanRow({ motoId, kind, plan, odometerKm }: { motoId: string; kind: PlanKind; plan: MaintenancePlan | null; odometerKm: number | null }) {
  const Colors = useColors();
  const styles = useStyles();
  const info = kindInfo(kind);
  const [editing, setEditing] = useState(false);
  const [everyKm, setEveryKm] = useState('');
  const [everyMonths, setEveryMonths] = useState('');
  const [baseKm, setBaseKm] = useState('');
  const [baseOn, setBaseOn] = useState(new Date());
  const [saving, setSaving] = useState(false);
  const status = plan ? planStatus(plan, odometerKm) : null;

  const edit = () => {
    setEveryKm(String(plan?.everyKm ?? info.everyKm ?? ''));
    setEveryMonths(String(plan?.everyMonths ?? info.everyMonths ?? ''));
    setBaseKm(String(plan?.baseKm ?? odometerKm ?? ''));
    setBaseOn(plan ? fromIsoDay(plan.baseOn) : new Date());
    setEditing(true);
  };

  const save = async () => {
    const k = num(everyKm);
    const m = num(everyMonths);
    const b = num(baseKm);
    const errors: string[] = [];
    if (k === null && m === null) errors.push('Indique un intervalle en km et/ou en mois.');
    if (k !== null && (Number.isNaN(k) || k < 100 || k > 100_000)) errors.push('Intervalle : entre 100 et 100 000 km.');
    if (m !== null && (Number.isNaN(m) || m < 1 || m > 120)) errors.push('Intervalle : entre 1 et 120 mois.');
    if (b !== null && (Number.isNaN(b) || b < 0)) errors.push('Kilométrage du dernier entretien invalide.');
    if (errors.length) {
      Alert.alert('À corriger', errors.join('\n'));
      return;
    }
    setSaving(true);
    try {
      await savePlan(motoId, kind, {
        everyKm: k === null ? null : Math.round(k),
        everyMonths: m === null ? null : Math.round(m),
        baseKm: b === null ? null : Math.round(b),
        baseOn: isoDay(baseOn),
      });
      setEditing(false);
    } catch (e) {
      Alert.alert('Rappel', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!plan) return;
    try {
      await deletePlan(plan.id);
      setEditing(false);
    } catch (e) {
      Alert.alert('Rappel', e instanceof Error ? e.message : String(e));
    }
  };

  const color = status?.level === 'due' ? Colors.danger : status?.level === 'soon' ? Colors.warning : Colors.textMuted;

  return (
    <View style={styles.plan}>
      <Pressable style={styles.planHeader} onPress={editing ? () => setEditing(false) : edit}>
        <Text style={styles.emoji}>{info.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.planLabel}>{info.label}</Text>
          <Text style={[styles.small, { color }, status && status.level !== 'ok' && { fontWeight: '800' }]}>
            {plan && status
              ? `${dueText(status)} · tous les ${[plan.everyKm ? `${plan.everyKm.toLocaleString('fr-FR')} km` : null, plan.everyMonths ? `${plan.everyMonths} mois` : null].filter(Boolean).join(' / ')}`
              : 'Pas de rappel · touche pour l’activer'}
          </Text>
        </View>
        <Ionicons name={editing ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
      </Pressable>
      {editing && (
        <View style={styles.editor}>
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
          <Button title="Enregistrer le rappel" loading={saving} onPress={save} />
          {plan && <Button title="Supprimer le rappel" variant="ghost" onPress={remove} />}
        </View>
      )}
    </View>
  );
}

function LogSection({
  motoId,
  garage,
  records,
}: {
  motoId: string;
  garage: Garage | null;
  records: { id: string; kind: MaintenanceKind; doneOn: string; odometerKm: number | null; costEur: number | null; notes: string | null }[];
}) {
  const Colors = useColors();
  const styles = useStyles();
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<MaintenanceKind>('oil');
  const [doneOn, setDoneOn] = useState(new Date());
  const [km, setKm] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const start = () => {
    setKind('oil');
    setDoneOn(new Date());
    setKm(garage ? String(garage.odometerKm) : '');
    setCost('');
    setNotes('');
    setAdding(true);
  };

  const save = async () => {
    const k = num(km);
    const c = num(cost);
    if ((k !== null && (Number.isNaN(k) || k < 0)) || (c !== null && (Number.isNaN(c) || c < 0))) {
      Alert.alert('À corriger', 'Kilométrage ou coût invalide.');
      return;
    }
    setSaving(true);
    try {
      await addRecord({
        motorcycleId: motoId,
        kind,
        doneOn: isoDay(doneOn),
        odometerKm: k === null ? null : Math.round(k),
        costEur: c === null ? null : Math.round(c * 100) / 100,
        notes: notes.trim() || null,
      });
      setAdding(false);
    } catch (e) {
      Alert.alert('Carnet', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const menu = (id: string, title: string) =>
    showActionSheet({
      title,
      options: [
        {
          label: 'Supprimer cet entretien',
          destructive: true,
          onPress: () => deleteRecord(id).catch((e) => Alert.alert('Carnet', String(e))),
        },
      ],
    });

  const total = records.reduce((s, r) => s + (r.costEur ?? 0), 0);

  return (
    <Section title="Carnet d’entretien">
      {adding ? (
        <View style={styles.editor}>
          <View style={styles.chips}>
            {MAINTENANCE_KINDS.map((k) => (
              <Chip key={k.value} label={`${k.emoji} ${k.label}`} selected={kind === k.value} onPress={() => setKind(k.value)} />
            ))}
          </View>
          <View style={styles.row}>
            <View style={styles.col}>
              <DateTimeField label="Date" mode="date" value={doneOn} onChange={setDoneOn} />
            </View>
            <View style={styles.col}>
              <Field label="Kilométrage" value={km} onChangeText={setKm} keyboardType="number-pad" maxLength={7} />
            </View>
          </View>
          <Field label="Coût (€)" value={cost} onChangeText={setCost} keyboardType="decimal-pad" maxLength={9} placeholder="Facultatif" />
          <Field label="Notes" value={notes} onChangeText={setNotes} maxLength={500} multiline placeholder="Garage, pièces, huile utilisée…" />
          <Button title="Ajouter au carnet" loading={saving} onPress={save} />
          <Button title="Annuler" variant="ghost" onPress={() => setAdding(false)} />
        </View>
      ) : (
        <Button title="+ Noter un entretien" variant="secondary" onPress={start} />
      )}
      {records.length === 0 ? (
        <Text style={styles.muted}>Aucun entretien noté pour l’instant.</Text>
      ) : (
        <>
          {records.map((r) => {
            const info = kindInfo(r.kind);
            return (
              <Pressable key={r.id} style={styles.record} onLongPress={() => menu(r.id, info.label)} delayLongPress={350}>
                <Text style={styles.emoji}>{info.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.planLabel}>{info.label}</Text>
                  <Text style={styles.small}>
                    {frDay(r.doneOn)}
                    {r.odometerKm !== null ? ` · ${r.odometerKm.toLocaleString('fr-FR')} km` : ''}
                    {r.costEur !== null ? ` · ${r.costEur.toLocaleString('fr-FR')} €` : ''}
                  </Text>
                  {!!r.notes && <Text style={styles.notes}>{r.notes}</Text>}
                </View>
                <Pressable onPress={() => menu(r.id, info.label)} hitSlop={10} accessibilityLabel="Options">
                  <Ionicons name="ellipsis-horizontal" size={20} color={Colors.textMuted} />
                </Pressable>
              </Pressable>
            );
          })}
          {total > 0 && <Text style={styles.hint}>Total dépensé : {total.toLocaleString('fr-FR')} €</Text>}
        </>
      )}
    </Section>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  muted: { color: Colors.textMuted, fontSize: 14 },
  hint: { fontSize: 13, color: Colors.textMuted, lineHeight: 18 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.text },
  row: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fuel: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.accentSoft, borderRadius: 12, padding: 12 },
  fuelValue: { fontSize: 16, fontWeight: '800', color: Colors.text },
  plan: { borderWidth: 1, borderColor: Colors.border, borderRadius: 14, backgroundColor: Colors.background },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, minHeight: 56 },
  planLabel: { fontSize: 15, fontWeight: '700', color: Colors.text },
  emoji: { fontSize: 22 },
  small: { fontSize: 13, color: Colors.textMuted },
  editor: { gap: 12, padding: 12, paddingTop: 0 },
  record: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
  notes: { fontSize: 13, color: Colors.text, marginTop: 2 },
}));
