import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { showActionSheet } from '@/components/action-sheet';
import { Button, Field } from '@/components/ui';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { sendTestSms } from '@/lib/alert-sms';
import {
  addMemberContact,
  addPhoneContact,
  fetchContactOf,
  fetchMemberContacts,
  formatPhone,
  leaveContactOf,
  MAX_EMERGENCY_CONTACTS,
  parseFrenchMobile,
  PHONE_ERROR,
  removeMemberContact,
  removePhoneContact,
  usePhoneContacts,
  type MemberContact,
  type PhoneContact,
} from '@/lib/emergency';
import { canPickPhoneContact, pickPhoneContact } from '@/lib/phone-contacts';
import { photoUrl } from '@/lib/profile';
import { useFriends } from '@/lib/use-friends';

type Adding = null | 'phone' | 'friend';

/**
 * Contacts d'urgence : une seule liste (5 max). Chaque contact = nom + numéro (SMS automatique)
 * ou un ami PasseRyder (notification + message dans l'app).
 */
export default function EmergencyContactsScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { state: friends, userId } = useFriends();
  const phones = usePhoneContacts();
  const [members, setMembers] = useState<MemberContact[] | null>(null);
  const [contactOf, setContactOf] = useState<MemberContact[]>([]);
  const [adding, setAdding] = useState<Adding>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  // SMS de test par contact (clé = id du numéro) : en cours, ou résultat exact
  const [tests, setTests] = useState<Record<string, TestState>>({});

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [m, of] = await Promise.all([fetchMemberContacts(userId), fetchContactOf()]);
      setMembers(m);
      setContactOf(of);
    } catch (e) {
      console.warn('Contacts d’urgence indisponibles', e);
      setMembers([]);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const total = (members?.length ?? 0) + phones.length;
  const full = total >= MAX_EMERGENCY_CONTACTS;

  const act = async (action: () => Promise<void> | void) => {
    try {
      await action();
      await load();
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : String(e));
    }
  };

  const closeForm = () => {
    setAdding(null);
    setName('');
    setPhone('');
    setPhoneError(null);
  };

  const savePhone = () => {
    try {
      addPhoneContact(name, phone, total);
      closeForm();
    } catch (e) {
      setPhoneError(e instanceof Error ? e.message : String(e));
    }
  };

  // Contact du téléphone : ajouté directement si un seul portable, sinon choix du numéro
  const fromPhoneBook = async () => {
    try {
      const picked = await pickPhoneContact();
      if (!picked) return;
      const mobiles = picked.phones.filter((p) => parseFrenchMobile(p));
      const label = picked.name || 'Contact';
      if (!mobiles.length) {
        setAdding('phone');
        setName(label);
        setPhone(picked.phones[0] ?? '');
        setPhoneError(picked.phones.length ? PHONE_ERROR : 'Ce contact n’a pas de numéro.');
        return;
      }
      const add = (num: string) => act(() => addPhoneContact(label, num, total));
      if (mobiles.length === 1) return add(mobiles[0]);
      showActionSheet({
        title: `Quel numéro pour ${label} ?`,
        options: mobiles.map((m) => ({
          label: formatPhone(m),
          onPress: () => add(m),
        })),
      });
    } catch (e) {
      Alert.alert('Contacts du téléphone', e instanceof Error ? e.message : String(e));
    }
  };

  const openAdd = () => {
    if (full)
      return Alert.alert('Liste complète', `${MAX_EMERGENCY_CONTACTS} contacts d’urgence maximum. Retire-en un pour en ajouter un autre.`);
    showActionSheet({
      title: 'Ajouter un contact d’urgence',
      options: [
        ...(canPickPhoneContact ? [{ label: 'Choisir dans mes contacts', onPress: fromPhoneBook }] : []),
        { label: 'Saisir un numéro', onPress: () => setAdding('phone') },
        {
          label: 'Choisir un ami PasseRyder',
          onPress: () => setAdding('friend'),
        },
      ],
    });
  };

  const confirmRemove = (label: string, remove: () => Promise<void> | void) =>
    Alert.alert('Retirer ce contact ?', `${label} ne sera plus prévenu(e) en cas d’alerte.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Retirer', style: 'destructive', onPress: () => act(remove) },
    ]);

  // « Test PasseRyder » à CE contact uniquement, après confirmation (compte dans les 10 SMS / 24 h)
  const confirmTest = (p: PhoneContact) =>
    Alert.alert(
      'Envoyer un SMS de test ?',
      `« Test PasseRyder » sera envoyé à ${p.name} (${formatPhone(p.phone)}).
1 crédit SMS sera utilisé (10 SMS max par jour).`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Envoyer',
          onPress: async () => {
            setTests((t) => ({ ...t, [p.id]: 'sending' }));
            const result = await sendTestSms(p.phone).catch((e) => ({
              ok: false,
              message: e instanceof Error ? e.message : String(e),
            }));
            setTests((t) => ({ ...t, [p.id]: result }));
          },
        },
      ],
    );

  const candidates = (friends?.friends ?? []).filter((f) => !members?.some((m) => m.id === f.id));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>
        Ces personnes reçoivent un SMS en cas de SOS, de chute ou si tu n’arrives pas à l’heure prévue avec Je rentre.
      </Text>
      <Text style={styles.help}>
        Un ami PasseRyder reçoit l’alerte dans l’app (notification + message avec ta position) au lieu d’un SMS.
      </Text>

      <Text style={styles.section}>
        Mes contacts ({total}/{MAX_EMERGENCY_CONTACTS})
      </Text>
      <View style={styles.card}>
        {members === null ? (
          <ActivityIndicator color={Colors.accent} />
        ) : total === 0 ? (
          <Text style={styles.help}>Aucun contact d’urgence : personne ne serait prévenu.</Text>
        ) : null}
        {phones.map((p) => (
          <ContactRow
            key={p.id}
            icon={
              <View style={styles.iconBubble}>
                <Ionicons name="call" size={20} color={Colors.accent} />
              </View>
            }
            title={p.name}
            subtitle={`${formatPhone(p.phone)} · SMS`}
            invalid={!parseFrenchMobile(p.phone)}
            test={tests[p.id]}
            onTest={() => confirmTest(p)}
            onRemove={() => confirmRemove(p.name, () => removePhoneContact(p.id))}
          />
        ))}
        {members?.map((m) => (
          <ContactRow
            key={m.id}
            icon={<Image source={{ uri: m.avatarUrl }} style={styles.avatar} />}
            title={`@${m.username}`}
            subtitle="Ami PasseRyder · alerte dans l’app"
            onRemove={() =>
              confirmRemove(`@${m.username}`, async () => {
                if (userId) await removeMemberContact(userId, m.id);
              })
            }
          />
        ))}
      </View>

      {adding === 'phone' ? (
        <View style={styles.card}>
          <Text style={styles.formTitle}>Nouveau numéro</Text>
          <Field label="Nom" value={name} onChangeText={setName} placeholder="Ex. Maman" maxLength={60} />
          <Field
            label="Portable"
            value={phone}
            onChangeText={(t) => {
              setPhone(t);
              setPhoneError(null);
            }}
            placeholder="06 12 34 56 78"
            keyboardType="phone-pad"
          />
          {phoneError && <Text style={styles.error}>{phoneError}</Text>}
          <Button title="Ajouter" onPress={savePhone} disabled={!name.trim() || !phone.trim()} />
          <Button title="Annuler" variant="ghost" onPress={closeForm} />
        </View>
      ) : adding === 'friend' ? (
        <View style={styles.card}>
          <Text style={styles.formTitle}>Choisir un ami</Text>
          {candidates.length === 0 ? (
            <Text style={styles.help}>Tous tes amis sont déjà dans la liste (ou tu n’as pas encore d’amis).</Text>
          ) : (
            candidates.map((f) => (
              <Pressable
                key={f.id}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                onPress={() =>
                  userId &&
                  act(async () => {
                    if (total >= MAX_EMERGENCY_CONTACTS) throw new Error(`${MAX_EMERGENCY_CONTACTS} contacts d’urgence maximum`);
                    await addMemberContact(userId, f.id);
                    setAdding(null);
                  })
                }>
                <Image source={{ uri: photoUrl(f.avatar_path) }} style={styles.avatar} />
                <Text style={[styles.name, styles.rowText]} numberOfLines={1}>
                  @{f.username}
                </Text>
                <Ionicons name="add-circle" size={28} color={Colors.accent} />
              </Pressable>
            ))
          )}
          <Button title="Annuler" variant="ghost" onPress={closeForm} />
        </View>
      ) : (
        <Button title={full ? 'Liste complète (5 max)' : '+ Ajouter'} onPress={openAdd} disabled={full} />
      )}

      {phones.length > 0 && (
        <Text style={styles.help}>
          Icône bulle sur un numéro : lui envoyer un SMS de test « Test PasseRyder » (1 crédit, 10 SMS max par jour).
        </Text>
      )}

      {contactOf.length > 0 && (
        <>
          <Text style={styles.section}>Tu es contact d’urgence de</Text>
          <View style={styles.card}>
            {contactOf.map((m) => (
              <View key={m.id} style={styles.row}>
                <Image source={{ uri: m.avatarUrl }} style={styles.avatar} />
                <Text style={[styles.name, styles.rowText]} numberOfLines={1}>
                  @{m.username}
                </Text>
                <Pressable
                  style={({ pressed }) => [styles.action, pressed && styles.pressed]}
                  onPress={() =>
                    Alert.alert('Ne plus être son contact ?', `@${m.username} ne pourra plus t’alerter.`, [
                      { text: 'Annuler', style: 'cancel' },
                      {
                        text: 'Refuser',
                        style: 'destructive',
                        onPress: () => act(() => leaveContactOf(m.id)),
                      },
                    ])
                  }>
                  <Text style={styles.actionText}>Refuser</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

type TestState = 'sending' | { ok: boolean; message: string };

function ContactRow({
  icon,
  title,
  subtitle,
  invalid,
  test,
  onTest,
  onRemove,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  invalid?: boolean;
  /** Numéros seulement : SMS de test */
  test?: TestState;
  onTest?: () => void;
  onRemove: () => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.row}>
      {icon}
      <View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.help} numberOfLines={1}>
          {subtitle}
        </Text>
        {invalid && <Text style={styles.error}>Numéro non reconnu (06 / 07 attendu) : retire-le et ajoute-le de nouveau.</Text>}
        {test === 'sending' && <Text style={styles.help}>Envoi du SMS de test…</Text>}
        {test && test !== 'sending' && (
          <Text style={[styles.testResult, { color: test.ok ? Colors.success : Colors.danger }]}>
            {test.ok ? '✓ ' : '✗ '}
            {test.message}
          </Text>
        )}
      </View>
      {onTest && (
        <Pressable
          onPress={onTest}
          disabled={test === 'sending'}
          hitSlop={6}
          style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
          accessibilityLabel={`Envoyer un SMS de test à ${title}`}>
          {test === 'sending' ? (
            <ActivityIndicator color={Colors.accent} />
          ) : (
            <Ionicons name="chatbubble-ellipses-outline" size={22} color={Colors.accent} />
          )}
        </Pressable>
      )}
      <Pressable
        onPress={onRemove}
        hitSlop={10}
        style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
        accessibilityLabel={`Retirer ${title}`}>
        <Ionicons name="trash-outline" size={22} color={Colors.danger} />
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  intro: {
    fontSize: Type.body,
    fontWeight: '700',
    color: Colors.text,
    lineHeight: 22,
  },
  section: {
    fontSize: Type.small,
    fontWeight: '800',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 12,
  },
  help: { fontSize: Type.small, color: Colors.textMuted, lineHeight: 18 },
  error: {
    fontSize: Type.small,
    color: Colors.danger,
    lineHeight: 18,
    fontWeight: '600',
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: 12,
    gap: 12,
  },
  formTitle: { fontSize: Type.body, fontWeight: '800', color: Colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  rowText: { flex: 1 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.border,
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: Type.body, fontWeight: '700', color: Colors.text },
  remove: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  action: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.sm,
    backgroundColor: Colors.background,
  },
  actionText: { fontWeight: '800', color: Colors.accent },
  pressed: { opacity: 0.6 },
  testResult: { fontSize: Type.small, fontWeight: '700', lineHeight: 18, marginTop: 2 },
}));
