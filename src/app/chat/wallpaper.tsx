import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, View, type GestureResponderEvent } from 'react-native';

import { ChatWallpaper } from '@/components/chat-wallpaper';
import { Button } from '@/components/ui';
import { makeStyles, Radius, Type, useColors, WallpaperColors, WallpaperPresets } from '@/constants/theme';
import { errorMessage } from '@/lib/errors';
import { useSession } from '@/lib/session';
import {
  MAX_DIM,
  PHOTO_DEFAULT_DIM,
  pickWallpaperPhoto,
  saveChatWallpaper,
  useChatWallpaper,
  useWallpaperPhotoUrl,
  type Wallpaper,
} from '@/lib/wallpapers';

/** Menu ⋯ d'une conversation › « Fond d'écran » : fond PERSONNEL (l'autre ne le voit pas). */
export default function ChatWallpaperScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const { loaded, wallpaper: current, inherited } = useChatWallpaper(userId, id);
  if (!loaded) return <Loading />;
  return <Editor key={id} userId={userId} conversationId={id} current={current} inherited={inherited} />;
}

function Loading() {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <View style={[styles.screen, styles.center]}>
      <ActivityIndicator color={Colors.accent} />
    </View>
  );
}

function Editor({
  userId,
  conversationId,
  current,
  inherited,
}: {
  userId: string;
  conversationId: string;
  current: Wallpaper | null;
  inherited: boolean;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const [draft, setDraft] = useState<Wallpaper | null>(current);
  const [all, setAll] = useState(inherited);
  const [busy, setBusy] = useState<'photo' | 'save' | 'reset' | null>(null);
  const photoUrl = useWallpaperPhotoUrl(draft?.kind === 'photo' ? draft.value : null);

  const choosePhoto = async () => {
    setBusy('photo');
    try {
      const path = await pickWallpaperPhoto(userId);
      if (path) setDraft({ kind: 'photo', value: path, dim: PHOTO_DEFAULT_DIM });
    } catch (e) {
      Alert.alert('Photo impossible', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const save = async (wallpaper: Wallpaper | null, kind: 'save' | 'reset') => {
    setBusy(kind);
    try {
      await saveChatWallpaper(userId, conversationId, wallpaper, all);
      router.back();
    } catch (e) {
      Alert.alert('Enregistrement impossible', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const same = (w: Wallpaper) => draft?.kind === w.kind && draft.value === w.value;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Aperçu avec deux bulles */}
      <View style={styles.preview}>
        {draft ? <ChatWallpaper wallpaper={draft} photoUrl={photoUrl} /> : <View style={styles.defaultBg} />}
        <View style={[styles.bubble, styles.bubbleOther]}>
          <Text style={styles.bubbleText}>On part à 9 h du café ?</Text>
        </View>
        <View style={[styles.bubble, styles.bubbleMine]}>
          <Text style={styles.bubbleTextMine}>Carrément, j’ai fait le plein 🏍️</Text>
        </View>
        {draft?.kind === 'photo' && !photoUrl && <ActivityIndicator color={Colors.white} style={styles.previewSpinner} />}
      </View>
      <Text style={styles.hint}>Ce fond est rien qu’à toi : les autres membres ne le voient pas.</Text>

      <Text style={styles.section}>Fonds PasseRyder</Text>
      <View style={styles.grid}>
        {Object.entries(WallpaperPresets).map(([key, p]) => {
          const w: Wallpaper = { kind: 'preset', value: key, dim: 0 };
          return (
            <Pressable
              key={key}
              onPress={() => setDraft(w)}
              style={[styles.thumb, same(w) && styles.thumbSelected]}
              accessibilityLabel={`Fond ${p.label}`}>
              <ChatWallpaper wallpaper={w} />
              <Text style={[styles.thumbLabel, p.dark && styles.thumbLabelDark]} numberOfLines={1}>
                {p.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.section}>Couleur unie</Text>
      <View style={styles.colors}>
        {WallpaperColors.map((c) => {
          const w: Wallpaper = { kind: 'color', value: c, dim: 0 };
          return (
            <Pressable
              key={c}
              onPress={() => setDraft(w)}
              style={[styles.swatch, { backgroundColor: c }, same(w) && styles.swatchSelected]}
              accessibilityLabel={`Couleur ${c}`}
            />
          );
        })}
      </View>

      <Text style={styles.section}>Ma photo</Text>
      <Button
        title={draft?.kind === 'photo' ? 'Choisir une autre photo' : '🖼️ Choisir dans la galerie'}
        variant="secondary"
        loading={busy === 'photo'}
        disabled={!!busy}
        onPress={choosePhoto}
      />
      <Text style={styles.hint}>Recadrée au format de l’écran et assombrie pour garder les bulles lisibles.</Text>

      {draft && (
        <>
          <Text style={styles.section}>Luminosité</Text>
          <BrightnessSlider dim={draft.dim} onChange={(dim) => setDraft({ ...draft, dim })} />
        </>
      )}

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Appliquer à toutes mes conversations</Text>
        <Switch
          value={all}
          onValueChange={setAll}
          trackColor={{ true: Colors.accent, false: Colors.border }}
          thumbColor={Colors.white}
        />
      </View>
      {all && <Text style={styles.hint}>Les fonds choisis conversation par conversation seront remplacés.</Text>}

      <Button title="Enregistrer" loading={busy === 'save'} disabled={!draft || !!busy} onPress={() => draft && save(draft, 'save')} />
      <Button
        title={all ? 'Réinitialiser toutes mes conversations' : 'Réinitialiser'}
        variant="secondary"
        loading={busy === 'reset'}
        disabled={!!busy || (!current && !all)}
        onPress={() => save(null, 'reset')}
      />
    </ScrollView>
  );
}

/** Curseur de luminosité (100 % = image telle quelle) : sans module natif, marche aussi sur le web */
function BrightnessSlider({ dim, onChange }: { dim: number; onChange: (dim: number) => void }) {
  const styles = useStyles();
  const [width, setWidth] = useState(0);
  const brightness = 100 - dim;
  const min = 100 - MAX_DIM;
  const ratio = (brightness - min) / (100 - min);
  const move = (e: GestureResponderEvent) => {
    if (!width) return;
    const r = Math.min(1, Math.max(0, e.nativeEvent.locationX / width));
    const b = Math.round((min + r * (100 - min)) / 5) * 5;
    onChange(Math.min(MAX_DIM, Math.max(0, 100 - b)));
  };
  return (
    <View style={styles.sliderRow}>
      <Text style={styles.sliderIcon}>🌑</Text>
      <View
        style={styles.sliderTrack}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={move}
        onResponderMove={move}
        accessibilityRole="adjustable"
        accessibilityLabel={`Luminosité ${brightness} %`}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) =>
          onChange(Math.min(MAX_DIM, Math.max(0, dim + (e.nativeEvent.actionName === 'increment' ? -5 : 5))))
        }>
        <View style={styles.sliderRail} pointerEvents="none">
          <View style={[styles.sliderFill, { width: `${ratio * 100}%` }]} />
        </View>
        <View style={[styles.sliderThumb, { left: `${ratio * 100}%` }]} pointerEvents="none" />
      </View>
      <Text style={styles.sliderIcon}>☀️</Text>
      <Text style={styles.sliderValue}>{brightness} %</Text>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  preview: {
    height: 220,
    borderRadius: Radius.md,
    overflow: 'hidden',
    padding: 16,
    gap: 8,
    justifyContent: 'flex-end',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  defaultBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: Colors.background },
  previewSpinner: { position: 'absolute', top: 90, alignSelf: 'center' },
  bubble: { maxWidth: '78%', borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: Colors.accent, borderBottomRightRadius: Radius.sm },
  bubbleText: { fontSize: Type.body, color: Colors.text },
  bubbleTextMine: { fontSize: Type.body, color: Colors.white },
  hint: { fontSize: Type.small, color: Colors.textMuted },
  section: { fontSize: Type.body, fontWeight: '800', color: Colors.text, marginTop: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  thumb: {
    width: 96,
    height: 150,
    borderRadius: Radius.md,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    borderWidth: 2,
    borderColor: Colors.border,
  },
  thumbSelected: { borderColor: Colors.accent, borderWidth: 3 },
  thumbLabel: { fontSize: Type.small, fontWeight: '700', color: Colors.dark, textAlign: 'center', paddingVertical: 8 },
  thumbLabelDark: { color: Colors.white },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: Colors.border },
  swatchSelected: { borderColor: Colors.accent, borderWidth: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8 },
  switchLabel: { flex: 1, fontSize: Type.body, fontWeight: '600', color: Colors.text },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sliderIcon: { fontSize: Type.large },
  sliderTrack: { flex: 1, height: 36, justifyContent: 'center' },
  sliderRail: { height: 6, borderRadius: 3, backgroundColor: Colors.border, overflow: 'hidden' },
  sliderFill: { height: 6, backgroundColor: Colors.accent },
  sliderThumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    marginLeft: -12,
    borderRadius: 12,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  sliderValue: { width: 48, textAlign: 'right', fontSize: Type.small, fontWeight: '700', color: Colors.textMuted },
}));
