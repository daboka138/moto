import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { Button, Field } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { useSession } from '@/lib/session';
import { addWallPhoto } from '@/lib/wall';

/** Publication d'une photo sur mon mur (la photo est choisie avant d'arriver ici). */
export default function NewPhotoScreen() {
  const { uri, mimeType } = useLocalSearchParams<{ uri: string; mimeType?: string }>();
  const { session } = useSession();
  const [caption, setCaption] = useState('');
  const [saving, setSaving] = useState(false);

  if (!session || !uri) return null;

  const publish = async () => {
    setSaving(true);
    try {
      await addWallPhoto(session.user.id, { uri, mimeType }, caption);
      router.back();
    } catch (e) {
      Alert.alert('Publication impossible', e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Image source={{ uri }} style={styles.preview} contentFit="cover" />
        <Field
          label="Légende (facultative)"
          value={caption}
          onChangeText={setCaption}
          placeholder="Où, quand, avec qui…"
          multiline
          maxLength={300}
          style={styles.caption}
        />
        <Button title="Publier" onPress={publish} loading={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16 },
  preview: { width: '100%', aspectRatio: 1, borderRadius: 18, backgroundColor: Colors.border },
  caption: { minHeight: 70, textAlignVertical: 'top' },
});
