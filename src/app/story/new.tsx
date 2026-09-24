import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Button, Chip } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import { useDrivingLock } from '@/lib/driving-lock';
import { useSession } from '@/lib/session';
import { MAX_VIDEO_S, publishStory, type StoryVisibility } from '@/lib/stories';
import { useStories } from '@/lib/stories-context';

type Media = { uri: string; mimeType?: string; type: 'image' | 'video'; durationS: number | null };

/** Publication d'une story : photo ou vidéo courte (30 s max), texte facultatif, visibilité. */
export default function NewStoryScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { session } = useSession();
  const { refresh } = useStories();
  const { locked } = useDrivingLock();
  const [media, setMedia] = useState<Media | null>(null);
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<StoryVisibility>('friends');
  const [saving, setSaving] = useState(false);

  const pick = async (source: 'camera' | 'library') => {
    if (source === 'camera') {
      const { granted } = await ImagePicker.requestCameraPermissionsAsync();
      if (!granted) {
        Alert.alert('Appareil photo', "L'accès à l'appareil photo a été refusé.");
        return;
      }
    }
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images', 'videos'],
      quality: 0.7,
      videoMaxDuration: MAX_VIDEO_S,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    };
    const result =
      source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return;
    const asset = result.assets[0];
    const isVideo = asset.type === 'video';
    const durationS = isVideo && asset.duration ? asset.duration / 1000 : null;
    if (isVideo && durationS !== null && durationS > MAX_VIDEO_S + 0.5) {
      Alert.alert('Vidéo trop longue', `Une story vidéo dure ${MAX_VIDEO_S} secondes maximum.`);
      return;
    }
    setMedia({ uri: asset.uri, mimeType: asset.mimeType ?? undefined, type: isVideo ? 'video' : 'image', durationS });
  };

  const publish = async () => {
    if (!media || !session) return;
    setSaving(true);
    try {
      await publishStory(session.user.id, media, caption, visibility);
      await refresh();
      router.back();
    } catch (e) {
      Alert.alert('Publication impossible', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!media ? (
          <View style={styles.sources}>
            <Pressable style={styles.source} onPress={() => pick('camera')}>
              <Ionicons name="camera" size={36} color={Colors.accent} />
              <Text style={styles.sourceText}>Appareil photo</Text>
            </Pressable>
            <Pressable style={styles.source} onPress={() => pick('library')}>
              <Ionicons name="images" size={36} color={Colors.accent} />
              <Text style={styles.sourceText}>Galerie</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.preview}>
            {media.type === 'image' ? (
              <Image source={{ uri: media.uri }} style={styles.fill} contentFit="cover" />
            ) : (
              <VideoPreview uri={media.uri} />
            )}
            {!!caption.trim() && (
              <View style={styles.captionBox} pointerEvents="none">
                <Text style={styles.captionText}>{caption}</Text>
              </View>
            )}
            <Pressable style={styles.change} onPress={() => setMedia(null)}>
              <Ionicons name="refresh" size={18} color={Colors.white} />
              <Text style={styles.changeText}>Changer</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.label}>Texte (facultatif)</Text>
        <TextInput
          style={styles.input}
          value={caption}
          onChangeText={setCaption}
          placeholder="Écris par-dessus ta story…"
          placeholderTextColor={Colors.textFaint}
          maxLength={200}
          editable={!locked}
        />

        <Text style={styles.label}>Qui peut la voir ?</Text>
        <View style={styles.chips}>
          <Chip label="👥 Mes amis" selected={visibility === 'friends'} onPress={() => setVisibility('friends')} />
          <Chip label="🌍 Tout le monde" selected={visibility === 'everyone'} onPress={() => setVisibility('everyone')} />
        </View>
        <Text style={styles.hint}>Ta story disparaît automatiquement au bout de 24 h.</Text>

        <Button title="Publier ma story" onPress={publish} loading={saving} disabled={!media} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function VideoPreview({ uri }: { uri: string }) {
  const styles = useStyles();
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} style={styles.fill} contentFit="cover" nativeControls={false} />;
}

const useStyles = makeStyles((Colors) => ({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 12 },
  sources: { flexDirection: 'row', gap: 12 },
  source: {
    flex: 1,
    aspectRatio: 0.8,
    borderRadius: 18,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  sourceText: { fontWeight: '800', color: Colors.text },
  preview: {
    width: '70%',
    alignSelf: 'center',
    aspectRatio: 9 / 16,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: Colors.dark,
  },
  fill: { width: '100%', height: '100%' },
  captionBox: { position: 'absolute', left: 12, right: 12, bottom: '20%', alignItems: 'center' },
  captionText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    backgroundColor: Colors.overlayLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    overflow: 'hidden',
  },
  change: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.overlayLight,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  changeText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  label: { fontSize: 14, fontWeight: '700', color: Colors.text, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  hint: { fontSize: 13, color: Colors.textMuted },
}));
