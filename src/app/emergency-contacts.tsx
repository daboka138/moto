import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { Button, Field } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import {
  addMemberContact,
  addPhoneContact,
  fetchContactOf,
  fetchMemberContacts,
  leaveContactOf,
  removeMemberContact,
  removePhoneContact,
  usePhoneContacts,
  type MemberContact,
} from '@/lib/emergency';
import { photoUrl } from '@/lib/profile';
import { useFriends } from '@/lib/use-friends';

/** Contacts d'urgence : amis de l'app (alerte dans l'app) et numéros de téléphone (SMS prérempli). */
export default function EmergencyContactsScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { state: friends, userId } = useFriends();
  const phones = usePhoneContacts();
  const [members, setMembers] = useState<MemberContact[] | null>(null);
  const [contactOf, setContactOf] = useState<MemberContact[]>([]);
  const [picking, setPicking] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

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

  const act = async (action: () => Promise<void> | void) => {
    try {
      await action();
      await load();
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : String(e));
    }
  };

  const addPhone = () =>
    act(() => {
      addPhoneContact(name, phone);
      setName('');
      setPhone('');
    });

  const candidates = (friends?.friends ?? []).filter((f) => !members?.some((m) => m.id === f.id));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>
        En cas de SOS (bouton SOS, chute sans réponse, « Je rentre » dépassé), tes contacts d’urgence reçoivent ta position.
      </Text>

      <Text style={styles.section}>Amis de l’app</Text>
      <Text style={styles.help}>Notification + message avec ta position. Fonctionne aussi pour les alertes automatiques.</Text>
      <View style={styles.card}>
        {members === null ? (
          <Text style={styles.help}>Chargement…</Text>
        ) : members.length === 0 ? (
          <Text style={styles.help}>Aucun ami contact d’urgence.</Text>
        ) : (
          members.map((m) => (
            <PersonRow
              key={m.id}
              username={m.username}
              avatarUrl={m.avatarUrl}
              action="Retirer"
              onAction={() => userId && act(() => removeMemberContact(userId, m.id))}
            />
          ))
        )}
        {picking ? (
          candidates.length === 0 ? (
            <Text style={styles.help}>Tous tes amis sont déjà contacts d’urgence (ou tu n’as pas encore d’amis).</Text>
          ) : (
            candidates.map((f) => (
              <PersonRow
                key={f.id}
                username={f.username}
                avatarUrl={photoUrl(f.avatar_path)}
                action="Ajouter"
                onAction={() => userId && act(() => addMemberContact(userId, f.id))}
              />
            ))
          )
        ) : (
          <Pressable style={styles.add} onPress={() => setPicking(true)}>
            <Ionicons name="person-add" size={22} color={Colors.accent} />
            <Text style={styles.addText}>Ajouter un ami</Text>
          </Pressable>
        )}
      </View>

      <Text style={styles.section}>Numéros de téléphone</Text>
      <Text style={styles.help}>
        Pour un proche sans l’app : un SMS prérempli avec ta position s’ouvre, il faut appuyer sur Envoyer (Android n’autorise
        pas l’envoi automatique). Ces numéros restent sur ce téléphone.
      </Text>
      <View style={styles.card}>
        {phones.map((p) => (
          <View key={p.id} style={styles.row}>
            <Ionicons name="call" size={22} color={Colors.accent} />
            <View style={styles.rowText}>
              <Text style={styles.name}>{p.name}</Text>
              <Text style={styles.help}>{p.phone}</Text>
            </View>
            <Pressable onPress={() => removePhoneContact(p.id)} hitSlop={10} accessibilityLabel={`Retirer ${p.name}`}>
              <Ionicons name="close-circle" size={26} color={Colors.textMuted} />
            </Pressable>
          </View>
        ))}
        <Field label="Nom" value={name} onChangeText={setName} placeholder="Ex. Maman" maxLength={60} />
        <Field label="Numéro" value={phone} onChangeText={setPhone} placeholder="06 12 34 56 78" keyboardType="phone-pad" />
        <Button title="Ajouter le numéro" variant="secondary" onPress={addPhone} disabled={!name.trim() || !phone.trim()} />
      </View>

      {contactOf.length > 0 && (
        <>
          <Text style={styles.section}>Tu es contact d’urgence de</Text>
          <View style={styles.card}>
            {contactOf.map((m) => (
              <PersonRow
                key={m.id}
                username={m.username}
                avatarUrl={m.avatarUrl}
                action="Refuser"
                onAction={() => act(() => leaveContactOf(m.id))}
              />
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function PersonRow({
  username,
  avatarUrl,
  action,
  onAction,
}: {
  username: string;
  avatarUrl: string;
  action: string;
  onAction: () => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <Image source={{ uri: avatarUrl }} style={styles.avatar} />
      <Text style={[styles.name, styles.rowText]} numberOfLines={1}>
        @{username}
      </Text>
      <Pressable style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]} onPress={onAction}>
        <Text style={styles.actionText}>{action}</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 10, paddingBottom: 48 },
  intro: { fontSize: 15, color: Colors.text, lineHeight: 21 },
  section: { fontSize: 13, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 12 },
  help: { fontSize: 13, color: Colors.textMuted, lineHeight: 18 },
  card: { backgroundColor: Colors.surface, borderRadius: 18, padding: 12, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  rowText: { flex: 1 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.border },
  name: { fontSize: 16, fontWeight: '700', color: Colors.text },
  action: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.background },
  actionText: { fontWeight: '800', color: Colors.accent },
  add: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  addText: { fontSize: 16, fontWeight: '700', color: Colors.accent },
}));
