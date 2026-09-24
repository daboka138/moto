import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PhotoViewer } from '@/components/photo-viewer';
import { Chip } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import { AVAILABILITIES, categoryInfo, inferCategory, paceInfo } from '@/lib/moto';
import { photoUrl, RIDING_STYLES, type Motorcycle, type Profile } from '@/lib/profile';
import type { ProfileStats, WallPhoto } from '@/lib/wall';

type Props = {
  profile: Profile;
  /** Transforme un chemin de photo en URL (Supabase Storage par défaut) */
  resolvePhoto?: (path: string) => string;
  stats?: ProfileStats | null;
  /** null pendant le chargement */
  photos?: WallPhoto[] | null;
  /** Boutons sous les compteurs (Modifier, Ajouter en ami...) */
  actions?: ReactNode;
  /** En bas de l'onglet « À propos » (réglages, déconnexion...) */
  footer?: ReactNode;
  /** Profil affiché sans barre de titre : la couverture passe sous la barre d'état */
  underStatusBar?: boolean;
  /** Mon profil : ajout/suppression de photos, changement de couverture */
  onAddPhoto?: () => void;
  onDeletePhoto?: (photo: WallPhoto) => void;
  onEditCover?: () => void;
  /** Mon profil : bouton engrenage vers les paramètres */
  onOpenSettings?: () => void;
};

const COVER_HEIGHT = 170;
const AVATAR_SIZE = 108;
const GRID_GAP = 2;

/** Fiche motard façon réseau social : couverture, avatar, pseudo, compteurs, mur de photos. */
export function ProfileView({
  profile,
  resolvePhoto = photoUrl,
  stats,
  photos,
  actions,
  footer,
  underStatusBar,
  onAddPhoto,
  onDeletePhoto,
  onEditCover,
  onOpenSettings,
}: Props) {
  const Colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<'photos' | 'about'>('photos');
  const [viewing, setViewing] = useState<WallPhoto | null>(null);
  const tile = (width - GRID_GAP * 2) / 3;
  const coverHeight = COVER_HEIGHT + (underStatusBar ? insets.top : 0);
  const mainMoto = profile.motorcycles[0];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.cover, { height: coverHeight }]}>
          {profile.cover_path ? (
            <Image source={{ uri: resolvePhoto(profile.cover_path) }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <View style={styles.coverFallback}>
              <MaterialCommunityIcons name="road-variant" size={64} color={Colors.coverIcon} />
            </View>
          )}
          {onOpenSettings && (
            <Pressable
              style={[styles.settingsButton, { top: (underStatusBar ? insets.top : 0) + 12 }]}
              onPress={onOpenSettings}
              hitSlop={8}
              accessibilityLabel="Paramètres">
              <Ionicons name="settings-sharp" size={22} color={Colors.white} />
            </Pressable>
          )}
          {onEditCover && (
            <Pressable style={[styles.coverButton, { top: (underStatusBar ? insets.top : 0) + 12 }]} onPress={onEditCover}>
              <Ionicons name="camera" size={16} color={Colors.white} />
              <Text style={styles.coverButtonText}>Couverture</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.identity}>
          <Image source={{ uri: resolvePhoto(profile.avatar_path) }} style={styles.avatar} contentFit="cover" />
          <Text style={styles.username}>@{profile.username}</Text>
          <View style={styles.metaRow}>
            {!!profile.city && <Meta icon="location-sharp" text={profile.city} />}
            {mainMoto && <Meta icon="motorbike" text={`${mainMoto.brand} ${mainMoto.model}`} community />}
          </View>
          {!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}
        </View>

        <View style={styles.stats}>
          <Stat value={stats?.photos} label="photos" />
          <View style={styles.statDivider} />
          <Stat value={stats?.friends} label="amis" />
          <View style={styles.statDivider} />
          <Stat value={stats?.rides} label="balades" />
        </View>

        {actions && <View style={styles.actions}>{actions}</View>}

        <View style={styles.tabs}>
          <TabButton label="Photos" icon="grid" active={tab === 'photos'} onPress={() => setTab('photos')} />
          <TabButton label="À propos" icon="information-circle" active={tab === 'about'} onPress={() => setTab('about')} />
        </View>

        {tab === 'photos' ? (
          <View style={styles.grid}>
            {onAddPhoto && (
              <Pressable style={[styles.tile, styles.addTile, { width: tile, height: tile }]} onPress={onAddPhoto}>
                <Ionicons name="add" size={36} color={Colors.accent} />
                <Text style={styles.addText}>Ajouter</Text>
              </Pressable>
            )}
            {photos?.map((p) => (
              <Pressable key={p.id} style={{ width: tile, height: tile }} onPress={() => setViewing(p)}>
                <Image source={{ uri: p.url }} style={styles.tile} contentFit="cover" transition={150} />
              </Pressable>
            ))}
            {photos && photos.length === 0 && !onAddPhoto && (
              <Text style={styles.empty}>Aucune photo pour l’instant.</Text>
            )}
          </View>
        ) : (
          <About profile={profile} resolvePhoto={resolvePhoto} footer={footer} />
        )}
      </ScrollView>

      <PhotoViewer
        photo={viewing}
        onClose={() => setViewing(null)}
        onDelete={
          onDeletePhoto
            ? (p) => {
                setViewing(null);
                onDeletePhoto(p);
              }
            : undefined
        }
      />
    </View>
  );
}

function About({
  profile,
  resolvePhoto,
  footer,
}: {
  profile: Profile;
  resolvePhoto: (path: string) => string;
  footer?: ReactNode;
}) {
  const styles = useStyles();
  const licenseYears = profile.license_year ? new Date().getFullYear() - profile.license_year : null;
  const styleLabels = profile.riding_styles.map((s) => RIDING_STYLES.find((r) => r.value === s)?.label ?? s);

  return (
    <View style={styles.about}>
      {(styleLabels.length > 0 || licenseYears !== null || !!profile.pace || profile.availability?.length > 0) && (
        <Card title="Style de conduite">
          {styleLabels.length > 0 && (
            <View style={styles.chips}>
              {styleLabels.map((s) => (
                <Chip key={s} label={s} selected />
              ))}
            </View>
          )}
          {licenseYears !== null && (
            <Text style={styles.muted}>
              Permis depuis {licenseYears} an{licenseYears > 1 ? 's' : ''}
            </Text>
          )}
          {!!profile.pace && (
            <Text style={styles.muted}>
              Rythme : {paceInfo(profile.pace).label} ({paceInfo(profile.pace).description})
            </Text>
          )}
          {profile.availability?.length > 0 && (
            <Text style={styles.muted}>
              Dispo : {AVAILABILITIES.filter((a) => profile.availability.includes(a.value)).map((a) => a.label.toLowerCase()).join(' et ')}
            </Text>
          )}
        </Card>
      )}

      <Card title="Garage">
        {profile.motorcycles.length === 0 ? (
          <Text style={styles.muted}>Aucune moto pour l&apos;instant.</Text>
        ) : (
          profile.motorcycles.map((m) => <MotoCard key={m.id} moto={m} resolvePhoto={resolvePhoto} />)
        )}
      </Card>

      {profile.interests.length > 0 && (
        <Card title="Centres d'intérêt">
          <View style={styles.chips}>
            {profile.interests.map((i) => (
              <Chip key={i} label={i} />
            ))}
          </View>
        </Card>
      )}

      {footer}
    </View>
  );
}

function Meta({ icon, text, community }: { icon: string; text: string; community?: boolean }) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.meta}>
      {community ? (
        <MaterialCommunityIcons name={icon as 'motorbike'} size={16} color={Colors.accent} />
      ) : (
        <Ionicons name={icon as 'location-sharp'} size={14} color={Colors.accent} />
      )}
      <Text style={styles.metaText}>{text}</Text>
    </View>
  );
}

function Stat({ value, label }: { value: number | undefined; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value ?? '–'}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function TabButton({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: 'grid' | 'information-circle';
  active: boolean;
  onPress: () => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <Pressable style={[styles.tab, active && styles.tabActive]} onPress={onPress}>
      <Ionicons name={active ? icon : `${icon}-outline`} size={18} color={active ? Colors.accent : Colors.textMuted} />
      <Text style={[styles.tabText, active && { color: Colors.accent }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function MotoCard({ moto, resolvePhoto }: { moto: Motorcycle; resolvePhoto: (path: string) => string }) {
  const Colors = useColors();
  const styles = useStyles();
  const details = [moto.year?.toString(), moto.displacement_cc ? `${moto.displacement_cc} cc` : null, moto.color].filter(
    Boolean,
  );
  const category = moto.category ?? inferCategory(moto.displacement_cc, moto.model);

  return (
    <View style={styles.moto}>
      {moto.photo_path ? (
        <Image source={{ uri: resolvePhoto(moto.photo_path) }} style={styles.motoPhoto} contentFit="cover" />
      ) : (
        <View style={[styles.motoPhoto, styles.motoPlaceholder]}>
          <MaterialCommunityIcons name="motorbike" size={48} color={Colors.textMuted} />
        </View>
      )}
      <View style={styles.motoInfo}>
        <View style={styles.motoTop}>
          <Text style={styles.motoBrand}>{moto.brand}</Text>
          {moto.is_main && <Ionicons name="star" size={14} color={Colors.accent} />}
          {category && (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{categoryInfo(category).short}</Text>
            </View>
          )}
        </View>
        <Text style={styles.motoModel}>{moto.model}</Text>
        {details.length > 0 && <Text style={styles.muted}>{details.join(' · ')}</Text>}
      </View>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { paddingBottom: 32 },
  cover: { backgroundColor: Colors.dark, overflow: 'hidden' },
  coverFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.darkSoft },
  coverButton: {
    position: 'absolute',
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.overlayLight,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  settingsButton: {
    position: 'absolute',
    left: 12,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.overlayLight,
  },
  coverButtonText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  identity: { alignItems: 'center', paddingHorizontal: 24, marginTop: -AVATAR_SIZE / 2, gap: 6 },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 4,
    borderColor: Colors.accent,
    backgroundColor: Colors.border,
  },
  username: { fontSize: 28, fontWeight: '900', color: Colors.text, marginTop: 4 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 14, color: Colors.textMuted, fontWeight: '600' },
  bio: { fontSize: 15, lineHeight: 21, color: Colors.text, textAlign: 'center', marginTop: 4 },
  stats: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 18,
    paddingVertical: 12,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '900', color: Colors.text },
  statLabel: { fontSize: 13, color: Colors.textMuted },
  statDivider: { width: 1, backgroundColor: Colors.border },
  actions: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  tabs: {
    flexDirection: 'row',
    marginTop: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: Colors.accent },
  tabText: { fontSize: 15, fontWeight: '700', color: Colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, marginTop: GRID_GAP },
  tile: { flex: 1, backgroundColor: Colors.border },
  addTile: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accentSoft, flex: 0 },
  addText: { color: Colors.accent, fontWeight: '700', fontSize: 13 },
  empty: { color: Colors.textMuted, padding: 24, textAlign: 'center', width: '100%' },
  about: { padding: 16, gap: 16 },
  card: { backgroundColor: Colors.surface, borderRadius: 18, padding: 16, gap: 12 },
  cardTitle: { fontSize: 13, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  muted: { color: Colors.textMuted, fontSize: 14 },
  moto: { borderRadius: 14, overflow: 'hidden', backgroundColor: Colors.background },
  motoPhoto: { width: '100%', aspectRatio: 16 / 9 },
  motoPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.border },
  motoInfo: { padding: 12, gap: 2 },
  motoTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  categoryBadge: { backgroundColor: Colors.accentSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  categoryText: { color: Colors.accent, fontSize: 12, fontWeight: '800' },
  motoBrand: { fontSize: 13, fontWeight: '700', color: Colors.accent, textTransform: 'uppercase', letterSpacing: 1 },
  motoModel: { fontSize: 20, fontWeight: '800', color: Colors.text },
}));
