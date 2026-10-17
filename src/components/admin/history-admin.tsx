import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { showActionSheet } from '@/components/action-sheet';
import { Flag } from '@/components/history/flag';
import { Button, Chip, Field } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import { errorMessage } from '@/lib/errors';
import {
  COUNTRY_NAMES,
  deleteHistoryImage,
  fetchHistoryIndex,
  modelsToText,
  saveBrand,
  saveChapter,
  saveHistoryImage,
  setHistoryHidden,
  slugify,
  textToModels,
  textToTimeline,
  timelineToText,
  type HistoryBrand,
  type HistoryChapter,
  type HistoryImage,
  type HistoryIndex,
  type ImageDraft,
} from '@/lib/history';
import { pickImage, type PickedImage } from '@/lib/pick-image';

// Console › Histoire : fiches des marques et chapitres de « Histoire de la moto » (écriture admin, RLS).

type BrandForm = {
  id?: string;
  name: string;
  slug: string;
  country: string;
  foundedYear: string;
  foundedPlace: string;
  founders: string;
  tagline: string;
  sortOrder: string;
  body: string;
  timeline: string;
  models: string;
  anecdotes: string;
  today: string;
};

type ChapterForm = { id?: string; title: string; slug: string; subtitle: string; sortOrder: string; body: string; timeline: string };

type Editing =
  | { kind: 'brand'; form: BrandForm }
  | { kind: 'chapter'; form: ChapterForm }
  | { kind: 'images'; owner: { brandId: string } | { chapterId: string }; title: string }
  | null;

const brandForm = (b?: HistoryBrand, nextOrder = 100): BrandForm => ({
  id: b?.id,
  name: b?.name ?? '',
  slug: b?.slug ?? '',
  country: b?.country ?? 'FR',
  foundedYear: b?.foundedYear ? String(b.foundedYear) : '',
  foundedPlace: b?.foundedPlace ?? '',
  founders: b?.founders ?? '',
  tagline: b?.tagline ?? '',
  sortOrder: String(b?.sortOrder ?? nextOrder),
  body: b?.body ?? '',
  timeline: timelineToText(b?.timeline ?? []),
  models: modelsToText(b?.models ?? []),
  anecdotes: (b?.anecdotes ?? []).join('\n'),
  today: b?.today ?? '',
});

const chapterForm = (c?: HistoryChapter, nextOrder = 10): ChapterForm => ({
  id: c?.id,
  title: c?.title ?? '',
  slug: c?.slug ?? '',
  subtitle: c?.subtitle ?? '',
  sortOrder: String(c?.sortOrder ?? nextOrder),
  body: c?.body ?? '',
  timeline: timelineToText(c?.timeline ?? []),
});

export function HistoryAdmin() {
  const Colors = useColors();
  const styles = useStyles();
  const [data, setData] = useState<HistoryIndex | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await fetchHistoryIndex());
    } catch (e) {
      Alert.alert('Oups', errorMessage(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!data) return <ActivityIndicator color={Colors.accent} />;

  const run = async (fn: () => Promise<unknown>) => {
    setSaving(true);
    try {
      await fn();
      setEditing(null);
      await load();
    } catch (e) {
      Alert.alert('Oups', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (editing?.kind === 'brand') {
    const f = editing.form;
    const set = (patch: Partial<BrandForm>) => setEditing({ kind: 'brand', form: { ...f, ...patch } });
    const slug = f.slug || slugify(f.name);
    const year = f.foundedYear.trim() ? Number(f.foundedYear) : null;
    const error =
      f.name.trim().length < 2
        ? 'Nom trop court'
        : !/^[A-Z]{2}$/.test(f.country.toUpperCase())
          ? 'Pays : code à 2 lettres (FR, IT…)'
          : year !== null && (!Number.isInteger(year) || year < 1600 || year > 2100)
            ? 'Année de création invalide'
            : null;
    return (
      <View style={styles.form}>
        <Field label="Nom" value={f.name} onChangeText={(v) => set({ name: v })} maxLength={80} />
        <Field label="Identifiant (adresse)" value={slug} onChangeText={(v) => set({ slug: slugify(v) })} maxLength={60} />
        <Field
          label={`Pays (code ISO : ${Object.keys(COUNTRY_NAMES).join(', ')})`}
          value={f.country}
          onChangeText={(v) => set({ country: v.toUpperCase().slice(0, 2) })}
          autoCapitalize="characters"
        />
        <Field label="Année de création" value={f.foundedYear} onChangeText={(v) => set({ foundedYear: v })} keyboardType="number-pad" maxLength={4} />
        <Field label="Lieu de création" value={f.foundedPlace} onChangeText={(v) => set({ foundedPlace: v })} maxLength={120} />
        <Field label="Fondateurs" value={f.founders} onChangeText={(v) => set({ founders: v })} maxLength={300} />
        <Field label="Accroche (liste)" value={f.tagline} onChangeText={(v) => set({ tagline: v })} maxLength={200} />
        <Field label="Ordre (1 = en tête de liste)" value={f.sortOrder} onChangeText={(v) => set({ sortOrder: v })} keyboardType="number-pad" />
        <Field
          label="Texte (paragraphes séparés par une ligne vide, « ## » au début d’une ligne = intertitre)"
          value={f.body}
          onChangeText={(v) => set({ body: v })}
          multiline
          style={styles.big}
        />
        <Field label="Frise : une ligne par étape « année | texte »" value={f.timeline} onChangeText={(v) => set({ timeline: v })} multiline style={styles.medium} />
        <Field label="Modèles mythiques : « nom | année | texte »" value={f.models} onChangeText={(v) => set({ models: v })} multiline style={styles.medium} />
        <Field label="Anecdotes : une par ligne" value={f.anecdotes} onChangeText={(v) => set({ anecdotes: v })} multiline style={styles.medium} />
        <Field label="Aujourd’hui" value={f.today} onChangeText={(v) => set({ today: v })} multiline style={styles.medium} maxLength={4000} />
        <Button
          title={error ?? 'Enregistrer'}
          disabled={!!error}
          loading={saving}
          onPress={() =>
            run(() =>
              saveBrand({
                id: f.id,
                slug,
                name: f.name,
                country: f.country,
                foundedYear: year,
                foundedPlace: f.foundedPlace,
                founders: f.founders,
                tagline: f.tagline,
                body: f.body.trim(),
                timeline: textToTimeline(f.timeline),
                models: textToModels(f.models),
                anecdotes: f.anecdotes.split('\n').map((x) => x.trim()).filter(Boolean),
                today: f.today,
                sortOrder: Number(f.sortOrder) || 100,
              }),
            )
          }
        />
        <Button title="Annuler" variant="ghost" onPress={() => setEditing(null)} />
      </View>
    );
  }

  if (editing?.kind === 'chapter') {
    const f = editing.form;
    const set = (patch: Partial<ChapterForm>) => setEditing({ kind: 'chapter', form: { ...f, ...patch } });
    const slug = f.slug || slugify(f.title);
    const error = f.title.trim().length < 2 ? 'Titre trop court' : null;
    return (
      <View style={styles.form}>
        <Field label="Titre" value={f.title} onChangeText={(v) => set({ title: v })} maxLength={120} />
        <Field label="Identifiant (adresse)" value={slug} onChangeText={(v) => set({ slug: slugify(v) })} maxLength={60} />
        <Field label="Sous-titre" value={f.subtitle} onChangeText={(v) => set({ subtitle: v })} maxLength={200} />
        <Field label="Ordre" value={f.sortOrder} onChangeText={(v) => set({ sortOrder: v })} keyboardType="number-pad" />
        <Field label="Texte (« ## » = intertitre, ligne vide entre les paragraphes)" value={f.body} onChangeText={(v) => set({ body: v })} multiline style={styles.big} />
        <Field label="Frise : « année | texte »" value={f.timeline} onChangeText={(v) => set({ timeline: v })} multiline style={styles.medium} />
        <Button
          title={error ?? 'Enregistrer'}
          disabled={!!error}
          loading={saving}
          onPress={() =>
            run(() =>
              saveChapter({
                id: f.id,
                slug,
                title: f.title,
                subtitle: f.subtitle,
                body: f.body.trim(),
                timeline: textToTimeline(f.timeline),
                sortOrder: Number(f.sortOrder) || 10,
              }),
            )
          }
        />
        <Button title="Annuler" variant="ghost" onPress={() => setEditing(null)} />
      </View>
    );
  }

  if (editing?.kind === 'images') {
    const images = [...data.brands, ...data.chapters]
      .find((x) => ('brandId' in editing.owner ? x.id === editing.owner.brandId : x.id === editing.owner.chapterId))
      ?.images ?? [];
    return <ImagesEditor title={editing.title} owner={editing.owner} images={images} onChanged={load} onClose={() => setEditing(null)} />;
  }

  const menu = (table: 'history_brands' | 'history_chapters', item: HistoryBrand | HistoryChapter, title: string) =>
    showActionSheet({
      title,
      options: [
        {
          label: 'Modifier le texte',
          onPress: () =>
            setEditing(table === 'history_brands' ? { kind: 'brand', form: brandForm(item as HistoryBrand) } : { kind: 'chapter', form: chapterForm(item as HistoryChapter) }),
        },
        {
          label: `Images et crédits (${item.images.length})`,
          onPress: () =>
            setEditing({ kind: 'images', owner: table === 'history_brands' ? { brandId: item.id } : { chapterId: item.id }, title }),
        },
        { label: item.hidden ? 'Afficher' : 'Masquer', onPress: () => run(() => setHistoryHidden(table, item.id, !item.hidden)) },
      ],
    });

  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.section}>Chapitres</Text>
      {data.chapters.map((c) => (
        <Pressable key={c.id} style={[styles.card, c.hidden && styles.hidden]} onPress={() => menu('history_chapters', c, c.title)}>
          <Text style={styles.label}>{c.title}</Text>
          <Text style={styles.small}>{[`${c.images.length} image(s)`, c.hidden ? 'masqué' : null].filter(Boolean).join(' · ')}</Text>
        </Pressable>
      ))}
      <Button
        title="+ Nouveau chapitre"
        variant="secondary"
        onPress={() => setEditing({ kind: 'chapter', form: chapterForm(undefined, data.chapters.length + 1) })}
      />

      <Text style={styles.section}>Marques ({data.brands.length})</Text>
      {data.brands.map((b) => (
        <Pressable key={b.id} style={[styles.card, styles.row, b.hidden && styles.hidden]} onPress={() => menu('history_brands', b, b.name)}>
          <Flag country={b.country} width={22} />
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>
              {b.sortOrder}. {b.name}
            </Text>
            <Text style={styles.small}>
              {[b.foundedYear, `${b.images.length} image(s)`, b.hidden ? 'masquée' : null].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </Pressable>
      ))}
      <Button
        title="+ Nouvelle marque"
        variant="secondary"
        onPress={() => setEditing({ kind: 'brand', form: brandForm(undefined, data.brands.length + 1) })}
      />
      <Text style={styles.small}>
        Images : uniquement domaine public, CC0, CC BY ou CC BY-SA (Wikimedia Commons), jamais de logo. Auteur et licence obligatoires,
        affichés sous l’image. « Signaler une erreur » sur une fiche t’envoie un message privé.
      </Text>
    </View>
  );
}

const EMPTY_IMAGE = { caption: '', author: '', license: 'CC BY-SA 4.0', licenseUrl: '', sourceUrl: '' };

function ImagesEditor({
  title,
  owner,
  images,
  onChanged,
  onClose,
}: {
  title: string;
  owner: ImageDraft['owner'];
  images: HistoryImage[];
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const styles = useStyles();
  const [draft, setDraft] = useState<(typeof EMPTY_IMAGE & { id?: string; sortOrder: string; photo: PickedImage | null; preview: string | null }) | null>(null);
  const [saving, setSaving] = useState(false);

  if (draft) {
    const set = (patch: Partial<typeof draft>) => setDraft({ ...draft, ...patch });
    const error = !draft.id && !draft.photo ? 'Choisis une image' : !draft.author.trim() ? 'Auteur obligatoire' : draft.license.trim().length < 2 ? 'Licence obligatoire' : null;
    return (
      <View style={styles.form}>
        <Text style={styles.label}>{title}</Text>
        {!!draft.preview && <Image source={{ uri: draft.preview }} style={styles.preview} contentFit="cover" />}
        <Chip
          label={draft.photo ? 'Image choisie ✓ (toucher pour changer)' : draft.id ? 'Remplacer l’image' : 'Choisir l’image'}
          selected={!!draft.photo}
          onPress={async () => {
            const p = await pickImage('Image (licence libre uniquement)');
            if (p) setDraft((d) => d && { ...d, photo: p, preview: p.uri });
          }}
        />
        <Field label="Légende" value={draft.caption} onChangeText={(v) => set({ caption: v })} maxLength={300} />
        <Field label="Auteur (obligatoire)" value={draft.author} onChangeText={(v) => set({ author: v })} maxLength={200} />
        <Field label="Licence (ex. CC BY-SA 4.0, CC0, Domaine public)" value={draft.license} onChangeText={(v) => set({ license: v })} maxLength={60} />
        <Field label="Lien de la licence (https://…)" value={draft.licenseUrl} onChangeText={(v) => set({ licenseUrl: v })} autoCapitalize="none" />
        <Field label="Source (page Wikimedia Commons, https://…)" value={draft.sourceUrl} onChangeText={(v) => set({ sourceUrl: v })} autoCapitalize="none" />
        <Field label="Ordre (0 = image principale)" value={draft.sortOrder} onChangeText={(v) => set({ sortOrder: v })} keyboardType="number-pad" />
        <Button
          title={error ?? 'Enregistrer'}
          disabled={!!error}
          loading={saving}
          onPress={async () => {
            setSaving(true);
            try {
              await saveHistoryImage({ ...draft, owner, sortOrder: Number(draft.sortOrder) || 0 }, draft.photo);
              setDraft(null);
              await onChanged();
            } catch (e) {
              Alert.alert('Oups', errorMessage(e));
            } finally {
              setSaving(false);
            }
          }}
        />
        <Button title="Annuler" variant="ghost" onPress={() => setDraft(null)} />
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>Images : {title}</Text>
      {images.map((img) => (
        <Pressable
          key={img.id}
          style={[styles.card, styles.row]}
          onPress={() =>
            showActionSheet({
              title: img.caption ?? 'Image',
              options: [
                {
                  label: 'Modifier les crédits',
                  onPress: () =>
                    setDraft({
                      id: img.id,
                      caption: img.caption ?? '',
                      author: img.author,
                      license: img.license,
                      licenseUrl: img.licenseUrl ?? '',
                      sourceUrl: img.sourceUrl ?? '',
                      sortOrder: String(img.sortOrder),
                      photo: null,
                      preview: img.url,
                    }),
                },
                {
                  label: 'Supprimer',
                  destructive: true,
                  onPress: () =>
                    Alert.alert('Supprimer cette image ?', img.caption ?? '', [
                      { text: 'Annuler', style: 'cancel' },
                      {
                        text: 'Supprimer',
                        style: 'destructive',
                        onPress: () => deleteHistoryImage(img).then(onChanged, (e) => Alert.alert('Oups', errorMessage(e))),
                      },
                    ]),
                },
              ],
            })
          }>
          <Image source={{ uri: img.url }} style={styles.thumb} contentFit="cover" />
          <View style={{ flex: 1 }}>
            <Text style={styles.label} numberOfLines={2}>
              {img.sortOrder}. {img.caption ?? 'Sans légende'}
            </Text>
            <Text style={styles.small}>
              {img.author} · {img.license}
            </Text>
          </View>
        </Pressable>
      ))}
      <Button
        title="+ Ajouter une image"
        variant="secondary"
        onPress={() => setDraft({ ...EMPTY_IMAGE, sortOrder: String(images.length), photo: null, preview: null })}
      />
      <Button title="Retour" variant="ghost" onPress={onClose} />
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  form: { backgroundColor: Colors.surface, borderRadius: 14, padding: 12, gap: 8 },
  big: { minHeight: 260, textAlignVertical: 'top' },
  medium: { minHeight: 110, textAlignVertical: 'top' },
  section: { fontSize: 13, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 },
  card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 12, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hidden: { opacity: 0.5 },
  label: { fontSize: 15, fontWeight: '700', color: Colors.text },
  small: { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
  thumb: { width: 64, height: 48, borderRadius: 8, backgroundColor: Colors.border },
  preview: { width: '100%', height: 180, borderRadius: 12, backgroundColor: Colors.border },
}));
