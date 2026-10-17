import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';

import { makeStyles, useColors } from '@/constants/theme';
import { useCreatorId } from '@/lib/creator';
import { errorMessage } from '@/lib/errors';
import { bodyBlocks, type HistoryImage, type TimelineItem } from '@/lib/history';
import { openDirectConversation } from '@/lib/messages';
import { useSession } from '@/lib/session';

/** Image libre avec sa légende, son auteur et sa licence (obligatoire pour CC BY / CC BY-SA) */
export function CreditedImage({ image, height = 220 }: { image: HistoryImage; height?: number }) {
  const styles = useStyles();
  const open = () => image.sourceUrl && Linking.openURL(image.sourceUrl);
  return (
    <View style={styles.figure}>
      <Image source={{ uri: image.url }} style={[styles.image, { height }]} contentFit="cover" transition={150} accessibilityLabel={image.caption ?? undefined} />
      {!!image.caption && <Text style={styles.caption}>{image.caption}</Text>}
      <Pressable onPress={open} disabled={!image.sourceUrl} accessibilityRole="link" accessibilityLabel="Source de l’image">
        <Text style={styles.credit}>
          Photo : {image.author} · {image.license}
          {image.sourceUrl ? ' · Wikimedia Commons' : ''}
        </Text>
      </Pressable>
    </View>
  );
}

/** Illustration neutre aux couleurs PasseRyder quand une fiche n'a pas d'image libre */
export function NeutralCover({ label, height = 160 }: { label: string; height?: number }) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <View style={[styles.neutral, { height }]}>
      <MaterialCommunityIcons name="motorbike" size={46} color={Colors.white} />
      <Text style={styles.neutralText}>{label}</Text>
    </View>
  );
}

/** Texte de fiche : intertitres « ## » et paragraphes */
export function HistoryBody({ body }: { body: string }) {
  const styles = useStyles();
  return (
    <View style={styles.body}>
      {bodyBlocks(body).map((b, i) =>
        b.kind === 'title' ? (
          <Text key={i} style={styles.h2}>
            {b.text}
          </Text>
        ) : (
          <Text key={i} style={styles.paragraph}>
            {b.text}
          </Text>
        ),
      )}
    </View>
  );
}

/** Frise chronologique verticale */
export function Timeline({ items }: { items: TimelineItem[] }) {
  const styles = useStyles();
  if (!items.length) return null;
  return (
    <View style={styles.timeline}>
      {items.map((t, i) => (
        <View key={i} style={styles.tlRow}>
          <View style={styles.tlRail}>
            <View style={styles.tlDot} />
            {i < items.length - 1 && <View style={styles.tlLine} />}
          </View>
          <View style={styles.tlBody}>
            <Text style={styles.tlYear}>{t.year}</Text>
            <Text style={styles.tlText}>{t.text}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function HistoryCard({ title, children }: { title: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

/** « Signaler une erreur » : message privé pré-rempli à @admin (créateur de l'appli) */
export function ReportHistoryError({ subject }: { subject: string }) {
  const Colors = useColors();
  const styles = useStyles();
  const creatorId = useCreatorId();
  const { session } = useSession();
  const [busy, setBusy] = useState(false);
  const report = async () => {
    if (!creatorId || !session) return;
    if (creatorId === session.user.id) {
      Alert.alert('Signaler une erreur', 'Tu es @admin : corrige directement dans Console › Histoire.');
      return;
    }
    setBusy(true);
    try {
      const id = await openDirectConversation(creatorId);
      router.push({
        pathname: '/chat/[id]',
        params: { id, draft: `📜 Erreur dans « ${subject} » (Histoire de la moto) : ` },
      });
    } catch (e) {
      Alert.alert('Oups', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Pressable style={({ pressed }) => [styles.report, (pressed || busy) && { opacity: 0.6 }]} onPress={report} disabled={busy || !creatorId}>
      <Ionicons name="flag-outline" size={18} color={Colors.textMuted} />
      <Text style={styles.reportText}>Signaler une erreur dans cette fiche</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  figure: { gap: 4 },
  image: { width: '100%', borderRadius: 14, backgroundColor: Colors.border },
  caption: { fontSize: 13, color: Colors.text, fontStyle: 'italic' },
  credit: { fontSize: 11, color: Colors.textMuted },
  neutral: {
    width: '100%',
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  neutralText: { color: Colors.white, fontSize: 20, fontWeight: '900' },
  body: { gap: 12 },
  h2: { fontSize: 19, fontWeight: '800', color: Colors.text, marginTop: 8 },
  paragraph: { fontSize: 16, lineHeight: 25, color: Colors.text },
  timeline: { gap: 0 },
  tlRow: { flexDirection: 'row', gap: 12 },
  tlRail: { width: 14, alignItems: 'center' },
  tlDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.accent, marginTop: 4 },
  tlLine: { flex: 1, width: 2, backgroundColor: Colors.border, marginVertical: 2 },
  tlBody: { flex: 1, paddingBottom: 14, gap: 2 },
  tlYear: { fontSize: 14, fontWeight: '900', color: Colors.accent },
  tlText: { fontSize: 15, lineHeight: 21, color: Colors.text },
  card: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, gap: 10 },
  cardTitle: { fontSize: 13, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  report: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  reportText: { color: Colors.textMuted, fontWeight: '700' },
}));
