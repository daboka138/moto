import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';

import { Button, Field } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import { deleteAccount } from '@/lib/auth';

const CONFIRM_WORD = 'SUPPRIMER';

const DELETED = [
  'Ton profil, ton nom et ton prénom, tes motos',
  'Tes photos (profil, couverture, mur, motos)',
  'Tes stories et tes messages, tes conversations privées',
  'Ta position en direct et tes réglages de confidentialité',
  'Tes amis, tes demandes et tes blocages',
  'Les balades que tu as créées et tes inscriptions',
  'Tes signalements routiers et tes votes',
];

export default function DeleteAccountScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const onDelete = async () => {
    setLoading(true);
    try {
      // En cas de succès, la session disparaît et l'app revient à l'écran de connexion
      await deleteAccount();
    } catch (e) {
      setLoading(false);
      Alert.alert('Suppression impossible', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.warning}>
        <Ionicons name="warning" size={28} color={Colors.danger} />
        <Text style={styles.warningText}>
          La suppression est immédiate et définitive. Rien ne pourra être récupéré.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Ce qui sera effacé</Text>
        {DELETED.map((item) => (
          <View key={item} style={styles.item}>
            <Ionicons name="trash-outline" size={18} color={Colors.textMuted} />
            <Text style={styles.itemText}>{item}</Text>
          </View>
        ))}
      </View>

      <Field
        label={`Pour confirmer, écris ${CONFIRM_WORD}`}
        value={confirm}
        onChangeText={setConfirm}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder={CONFIRM_WORD}
      />

      <Button
        title="Supprimer définitivement mon compte"
        variant="danger"
        loading={loading}
        disabled={confirm.trim().toUpperCase() !== CONFIRM_WORD}
        onPress={onDelete}
      />
    </ScrollView>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.danger,
    backgroundColor: Colors.surface,
  },
  warningText: { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.text },
  card: { backgroundColor: Colors.surface, borderRadius: 18, padding: 16, gap: 10 },
  title: { fontSize: 16, fontWeight: '800', color: Colors.text },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemText: { flex: 1, fontSize: 14, color: Colors.textMuted },
}));
