import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { Chip, SmallButton } from '@/components/ui';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { errorMessage } from '@/lib/errors';
import { IS_WEB, webDevice } from '@/lib/app-link';
import {
  bannerDismissed,
  dismissBanner,
  fetchMyWaitlist,
  fetchStoreLinks,
  setWaitlist,
  type StorePlatform,
} from '@/lib/store-waitlist';

type Variant = 'ios-available' | 'ios-wait' | 'android-wait' | 'desktop-wait';

/**
 * Version web, en haut du Mur : « Préviens-moi » quand l'appli sort sur iPhone (ou Android tant que
 * la validation Google est en cours), adapté à l'appareil. Lien App Store renseigné dans la console
 * → sur iPhone, « dispo sur l'App Store ». ✕ = caché 30 jours. Rien dans l'app Android.
 */
export function StoreBanner({ userId }: { userId: string }) {
  const Colors = useColors();
  const styles = useStyles();
  const [variant, setVariant] = useState<Variant | null>(null);
  const [appStoreUrl, setAppStoreUrl] = useState('');
  const [platform, setPlatform] = useState<StorePlatform>('ios');
  const [byEmail, setByEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!IS_WEB) return;
    let alive = true;
    Promise.all([fetchStoreLinks(), fetchMyWaitlist(userId)])
      .then(([links, mine]) => {
        if (!alive) return;
        const device = webDevice();
        let v: Variant | null = null;
        if (device === 'ios') v = links.appStoreUrl ? 'ios-available' : mine.ios.on ? null : 'ios-wait';
        else if (device === 'android') v = links.googleReview && !mine.android.on ? 'android-wait' : null;
        else v = !links.appStoreUrl && !mine.ios.on && !mine.android.on ? 'desktop-wait' : null;
        setAppStoreUrl(links.appStoreUrl);
        setPlatform(device === 'android' ? 'android' : 'ios');
        setVariant(v && !bannerDismissed(v) ? v : null);
      })
      .catch((e) => console.warn('Bandeau « Préviens-moi » indisponible', e));
    return () => {
      alive = false;
    };
  }, [userId]);

  if (!variant) return null;

  const close = () => {
    dismissBanner(variant);
    setVariant(null);
  };

  if (done) {
    return (
      <View style={[styles.banner, styles.row]}>
        <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
        <Text style={styles.text}>C’est noté, on te prévient.</Text>
      </View>
    );
  }

  const subscribe = async () => {
    setBusy(true);
    setError(null);
    try {
      await setWaitlist(platform, true, byEmail);
      setDone(true);
      setTimeout(() => setVariant(null), 4000);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const text =
    variant === 'ios-available'
      ? 'PasseRyder est dispo sur l’App Store'
      : variant === 'ios-wait'
        ? 'L’appli iPhone arrive bientôt. Tu veux être prévenu ?'
        : variant === 'android-wait'
          ? 'L’appli Android arrive bientôt sur Google Play. Tu veux être prévenu ?'
          : 'L’appli mobile arrive sur iPhone. Préviens-moi quand elle sort';

  return (
    <View style={styles.banner}>
      <View style={styles.row}>
        <Ionicons name="phone-portrait-outline" size={22} color={Colors.accent} />
        <Text style={styles.text}>{text}</Text>
        <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Masquer pendant 30 jours">
          <Ionicons name="close" size={20} color={Colors.textMuted} />
        </Pressable>
      </View>
      {variant === 'ios-available' ? (
        <View style={styles.actions}>
          <SmallButton title="Télécharger" icon="download-outline" onPress={() => Linking.openURL(appStoreUrl)} />
        </View>
      ) : (
        <>
          {variant === 'desktop-wait' && (
            <View style={styles.actions}>
              <Chip label="iPhone" selected={platform === 'ios'} onPress={() => setPlatform('ios')} />
              <Chip label="Android" selected={platform === 'android'} onPress={() => setPlatform('android')} />
            </View>
          )}
          <Pressable style={styles.check} onPress={() => setByEmail(!byEmail)} accessibilityRole="checkbox" accessibilityState={{ checked: byEmail }}>
            <Ionicons name={byEmail ? 'checkbox' : 'square-outline'} size={20} color={byEmail ? Colors.accent : Colors.textMuted} />
            <Text style={styles.small}>Aussi par email (un seul, à l’adresse de ton compte)</Text>
          </Pressable>
          <View style={styles.actions}>
            <SmallButton title={busy ? 'Un instant…' : 'Préviens-moi'} icon="notifications-outline" onPress={subscribe} disabled={busy} />
          </View>
          {!!error && <Text style={styles.error}>{error}</Text>}
        </>
      )}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  banner: {
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  text: { flex: 1, fontSize: Type.body, fontWeight: '700', color: Colors.text },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  small: { flex: 1, fontSize: Type.small, color: Colors.textMuted },
  error: { fontSize: Type.small, color: Colors.danger },
}));
