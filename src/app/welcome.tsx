import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OpenInApp } from '@/components/open-in-app';
import { makeStyles, useColors } from '@/constants/theme';
import { BIENVENUE, PERMISSIONS } from '@/guide/contenu';
import { setWelcomeDone } from '@/guide/state';
import { IS_WEB } from '@/lib/app-link';
import { pushPermission, registerForPush, type PushStatus } from '@/lib/push';

/**
 * Présentation de l'app : au premier lancement (après la création du profil) et depuis
 * Paramètres › Aide › Revoir la présentation (?replay=1). Textes : src/guide/contenu.ts
 */
export default function WelcomeScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { replay } = useLocalSearchParams<{ replay?: string }>();
  const scroller = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const pages = BIENVENUE.length + 1; // + autorisations
  const last = page === pages - 1;

  const goTo = (p: number) => {
    setPage(p);
    scroller.current?.scrollTo({ x: p * width, animated: true });
  };

  const finish = (then?: '/emergency-contacts') => {
    setWelcomeDone(true);
    if (replay) {
      router.back();
      if (then) router.push(then);
    } else {
      router.replace('/');
      if (then) router.push(then);
    }
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const p = Math.round(e.nativeEvent.contentOffset.x / width);
    if (p !== page) setPage(p);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.top}>
        <Text style={styles.brand}>PasseRyder</Text>
        <Pressable onPress={() => (last ? finish() : goTo(pages - 1))} hitSlop={10}>
          <Text style={styles.skip}>{last ? 'Plus tard' : 'Passer'}</Text>
        </Pressable>
      </View>

      <View style={styles.pager} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <ScrollView
            ref={scroller}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={32}>
            {BIENVENUE.map((d) => (
              <ScrollView key={d.titre} style={{ width }} contentContainerStyle={styles.slide}>
                <Text style={styles.emoji}>{d.emoji}</Text>
                <Text style={styles.title}>{d.titre}</Text>
                <Text style={styles.text}>{d.texte}</Text>
                <View style={styles.points}>
                  {d.points.map((p) => (
                    <View key={p} style={styles.point}>
                      <Ionicons name="checkmark-circle" size={20} color={Colors.accent} />
                      <Text style={styles.pointText}>{p}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            ))}
            <ScrollView style={{ width }} contentContainerStyle={styles.slide}>
              <Text style={styles.emoji}>✅</Text>
              <Text style={styles.title}>{PERMISSIONS.titre}</Text>
              {IS_WEB ? <WebPermissions /> : <AppPermissions onContacts={() => finish('/emergency-contacts')} />}
            </ScrollView>
          </ScrollView>
        )}
      </View>

      <View style={styles.bottom}>
        <View style={styles.dots}>
          {Array.from({ length: pages }, (_, i) => (
            <Pressable key={i} onPress={() => goTo(i)} hitSlop={6}>
              <View style={[styles.dot, i === page && styles.dotOn]} />
            </Pressable>
          ))}
        </View>
        <Pressable
          style={({ pressed }) => [styles.next, pressed && { opacity: 0.8 }]}
          onPress={() => (last ? finish() : goTo(page + 1))}>
          <Text style={styles.nextText}>{last ? 'C’est parti !' : 'Suivant'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

/** Dernier écran (app) : position, notifications et contacts d'urgence, avec le pourquoi */
function AppPermissions({ onContacts }: { onContacts: () => void }) {
  const styles = useStyles();
  const [location, setLocation] = useState<boolean | null>(null);
  const [push, setPush] = useState<PushStatus | null>(null);

  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then((p) => setLocation(p.granted))
      .catch(() => setLocation(false));
    pushPermission().then(setPush);
  }, []);

  const askLocation = async () => {
    const p = await Location.requestForegroundPermissionsAsync().catch(() => null);
    setLocation(!!p?.granted);
  };
  const askPush = async () => setPush(await registerForPush(true));

  return (
    <View style={styles.perms}>
      <Text style={styles.text}>{PERMISSIONS.texte}</Text>
      <PermissionRow
        icon="location"
        text={PERMISSIONS.position}
        done={location === true}
        onPress={askLocation}
      />
      {push !== 'unavailable' && (
        <PermissionRow
          icon="notifications"
          text={PERMISSIONS.notifications}
          done={push === 'granted'}
          onPress={askPush}
        />
      )}
      <PermissionRow icon="medkit" text={PERMISSIONS.contacts} action="Ajouter mes contacts d’urgence" onPress={onContacts} />
    </View>
  );
}

function WebPermissions() {
  const styles = useStyles();
  return (
    <View style={styles.perms}>
      <Text style={styles.text}>
        Sur le web, ta position n’est jamais partagée. Le GPS en direct, la navigation, le SOS et « Je rentre » sont dans
        l’app Android.
      </Text>
      <OpenInApp path="/" />
    </View>
  );
}

function PermissionRow({
  icon,
  text,
  done,
  action = 'Autoriser',
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  done?: boolean;
  action?: string;
  onPress: () => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.perm}>
      <Ionicons name={icon} size={24} color={Colors.accent} />
      <View style={styles.permBody}>
        <Text style={styles.permText}>{text}</Text>
        {done ? (
          <Text style={styles.permDone}>✓ Autorisé</Text>
        ) : (
          <Pressable style={({ pressed }) => [styles.permButton, pressed && { opacity: 0.7 }]} onPress={onPress}>
            <Text style={styles.permButtonText}>{action}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  brand: { fontSize: 18, fontWeight: '900', color: Colors.accent },
  skip: { fontSize: 16, fontWeight: '700', color: Colors.textMuted },
  pager: { flex: 1 },
  slide: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28, paddingVertical: 16, gap: 14 },
  emoji: { fontSize: 72 },
  title: { fontSize: 28, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  text: { fontSize: 17, lineHeight: 24, color: Colors.textMuted, textAlign: 'center', maxWidth: 420 },
  points: { gap: 10, marginTop: 8, alignSelf: 'stretch', maxWidth: 420, width: '100%', marginHorizontal: 'auto' },
  point: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pointText: { flex: 1, fontSize: 16, color: Colors.text },
  perms: { gap: 12, alignSelf: 'stretch', maxWidth: 460, width: '100%', marginHorizontal: 'auto' },
  perm: { flexDirection: 'row', gap: 12, backgroundColor: Colors.surface, borderRadius: 16, padding: 14 },
  permBody: { flex: 1, gap: 8 },
  permText: { fontSize: 15, lineHeight: 21, color: Colors.text },
  permDone: { fontSize: 15, fontWeight: '800', color: Colors.success },
  permButton: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.accentSoft,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  permButtonText: { fontSize: 15, fontWeight: '800', color: Colors.accentDark },
  bottom: { padding: 20, gap: 16 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border },
  dotOn: { width: 22, backgroundColor: Colors.accent },
  next: { backgroundColor: Colors.accent, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  nextText: { fontSize: 17, fontWeight: '800', color: Colors.white },
}));
