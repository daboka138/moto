import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PhotoViewer } from '@/components/photo-viewer';
import { TripShareCard } from '@/components/trip-share-card';
import { makeStyles, useColors } from '@/constants/theme';
import { useDrivingLock } from '@/lib/driving-lock';
import { messageTime, type Message } from '@/lib/messages';
import { pickImage, type PickedImage } from '@/lib/pick-image';
import type { WallPhoto } from '@/lib/wall';

export type ChatPerson = { username: string; avatarUrl: string };

/** Statut d'un de mes messages : ✓ envoyé, ✓✓ reçu, ✓✓ bleu vu (null : accusés de lecture coupés) */
export type MessageStatus = { delivered: boolean; seen: boolean; seenCount: number } | null;

/** Réactions d'un message, regroupées par emoji */
export type ReactionSummary = { emoji: string; count: number; mine: boolean }[];

type Props = {
  title: string;
  avatarUrl: string | null;
  /** Icône sans photo : drapeau (balade), groupe */
  avatarIcon?: 'flag' | 'people';
  isGroup: boolean;
  /** Sous-titre (membres d'un groupe, sourdine…) */
  subtitle?: string | null;
  onTitlePress?: () => void;
  onMenu?: () => void;
  /** Du plus récent au plus ancien */
  messages: Message[] | null;
  meId: string;
  people: Map<string, ChatPerson>;
  imageUrl: (path: string) => string | undefined;
  statusOf: (m: Message) => MessageStatus;
  reactionsOf: (m: Message) => ReactionSummary;
  onReact: (m: Message, emoji: string) => void;
  onSend: (text: string, image?: PickedImage) => Promise<void>;
  onMessageLongPress?: (m: Message) => void;
  /** Appui sur un de mes messages : détail « Vu à … » / « Vu par … » */
  onMyMessagePress?: (m: Message) => void;
  /** Message en cours de modification (saisie pré-remplie) */
  editing?: Message | null;
  onCancelEdit?: () => void;
  onEdit?: (m: Message, text: string) => Promise<void>;
  /** Saisie impossible (blocage…) : explication affichée à la place */
  disabledReason?: string | null;
};

/** Conversation : bulles, photos, réactions, statuts, « modifié », saisie (bloquée pendant la conduite). */
export function ChatView(p: Props) {
  const Colors = useColors();
  const styles = useStyles();
  const { locked } = useDrivingLock();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [viewing, setViewing] = useState<WallPhoto | null>(null);

  // Modification : texte du message dans la saisie (ajusté au rendu quand le message change)
  const editingId = p.editing?.id ?? null;
  const [shownEditId, setShownEditId] = useState<string | null>(null);
  if (editingId !== shownEditId) {
    setShownEditId(editingId);
    if (p.editing) setText(p.editing.body ?? '');
  }

  const send = async (image?: PickedImage) => {
    if (sending || (!text.trim() && !image)) return;
    setSending(true);
    try {
      if (p.editing && !image) await p.onEdit?.(p.editing, text);
      else await p.onSend(image ? '' : text, image);
      if (!image) setText('');
    } catch {
      // erreur déjà affichée par l'écran ; la saisie est gardée
    } finally {
      setSending(false);
    }
  };

  const sendPhoto = async () => {
    const image = await pickImage('Envoyer une photo');
    if (image) await send(image);
  };

  // « Vu » sous mon dernier message
  const lastMine = p.messages?.find((m) => m.senderId === p.meId && m.kind === 'user' && !m.deletedAt);
  const lastStatus = lastMine ? p.statusOf(lastMine) : null;
  // Groupe : « Vu par N » dès qu'un membre a lu (✓✓ bleues quand tous l'ont lu)
  const seenSome = !!lastStatus && (p.isGroup ? lastStatus.seenCount > 0 : lastStatus.seen);
  const seenLabel = !lastStatus
    ? null
    : seenSome
      ? p.isGroup
        ? `Vu par ${lastStatus.seenCount}`
        : 'Vu'
      : lastStatus.delivered
        ? 'Reçu'
        : 'Envoyé';

  const ticks = (status: MessageStatus) => {
    if (!status) return null;
    const blue = status.seen;
    return (
      <Ionicons
        name={status.delivered || status.seen ? 'checkmark-done' : 'checkmark'}
        size={14}
        color={blue ? Colors.seenTickOnBubble : Colors.accentSoft}
      />
    );
  };

  const renderItem = ({ item, index }: { item: Message; index: number }) => {
    if (item.kind === 'system') {
      return (
        <View style={styles.systemLine}>
          <Text style={styles.system}>{item.body}</Text>
        </View>
      );
    }
    const mine = item.senderId === p.meId;
    const older = p.messages?.[index + 1];
    const firstOfRun = !older || older.senderId !== item.senderId || older.kind === 'system';
    const person = p.people.get(item.senderId);
    const deleted = !!item.deletedAt;
    const url = !deleted && item.imagePath ? p.imageUrl(item.imagePath) : undefined;
    const reactions = deleted ? [] : p.reactionsOf(item);
    const longPress = () => !deleted && p.onMessageLongPress?.(item);
    return (
      <View style={[styles.line, mine ? styles.lineMine : styles.lineOther]}>
        {!mine && p.isGroup && (
          <View style={styles.senderAvatarBox}>
            {firstOfRun && person && <Image source={{ uri: person.avatarUrl }} style={styles.senderAvatar} />}
          </View>
        )}
        <View style={[styles.column, mine && styles.columnMine]}>
          {!mine && p.isGroup && firstOfRun && <Text style={styles.sender}>@{person?.username ?? '?'}</Text>}
          <Pressable
            onLongPress={longPress}
            onPress={() => mine && !deleted && p.onMyMessagePress?.(item)}
            delayLongPress={350}
            style={[
              styles.bubble,
              mine ? styles.bubbleMine : styles.bubbleOther,
              !!url && styles.bubblePhoto,
              deleted && styles.bubbleDeleted,
            ]}>
            {deleted ? (
              <Text style={[styles.deleted, mine && styles.deletedMine]}>🚫 Message supprimé</Text>
            ) : (
              <>
                {item.imagePath &&
                  (url ? (
                    <Pressable
                      onPress={() =>
                        setViewing({ id: item.id, ownerId: item.senderId, path: null, url, caption: item.body, createdAt: item.createdAt })
                      }
                      onLongPress={longPress}>
                      <Image source={{ uri: url }} style={styles.photo} contentFit="cover" transition={150} />
                    </Pressable>
                  ) : (
                    <View style={[styles.photo, styles.photoLoading]}>
                      <ActivityIndicator color={Colors.textMuted} />
                    </View>
                  ))}
                {item.tripShareId ? (
                  <TripShareCard id={item.tripShareId} mine={mine} fallback={item.body} />
                ) : (
                  !!item.body && <Text style={[styles.body, mine && styles.bodyMine]}>{item.body}</Text>
                )}
              </>
            )}
            <View style={styles.meta}>
              {!!item.editedAt && !deleted && <Text style={[styles.time, mine && styles.timeMine]}>modifié ·</Text>}
              <Text style={[styles.time, mine && styles.timeMine]}>{messageTime(item.createdAt)}</Text>
              {mine && !deleted && ticks(p.statusOf(item))}
            </View>
          </Pressable>
          {reactions.length > 0 && (
            <View style={[styles.reactions, mine && styles.reactionsMine]}>
              {reactions.map((r) => (
                <Pressable
                  key={r.emoji}
                  onPress={() => p.onReact(item, r.emoji)}
                  style={[styles.reaction, r.mine && styles.reactionMine]}
                  accessibilityLabel={`${r.emoji} ${r.count}`}>
                  <Text style={styles.reactionText}>
                    {r.emoji}
                    {r.count > 1 ? ` ${r.count}` : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          {item.id === lastMine?.id && !!seenLabel && (
            <Pressable onPress={() => p.onMyMessagePress?.(item)} hitSlop={6}>
              <Text style={[styles.seen, seenSome && styles.seenBlue]}>{seenLabel}</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color={Colors.text} />
        </Pressable>
        <Pressable style={styles.headerTitle} onPress={p.onTitlePress} disabled={!p.onTitlePress}>
          {p.avatarUrl ? (
            <Image source={{ uri: p.avatarUrl }} style={styles.headerAvatar} />
          ) : (
            <View style={[styles.headerAvatar, styles.groupAvatar]}>
              <Ionicons name={p.avatarIcon ?? 'flag'} size={18} color={Colors.accent} />
            </View>
          )}
          <View style={styles.flex}>
            <Text style={styles.headerText} numberOfLines={1}>
              {p.title}
            </Text>
            {!!p.subtitle && (
              <Text style={styles.headerSub} numberOfLines={1}>
                {p.subtitle}
              </Text>
            )}
          </View>
        </Pressable>
        {p.onMenu && (
          <Pressable onPress={p.onMenu} hitSlop={12}>
            <Ionicons name="ellipsis-horizontal" size={24} color={Colors.text} />
          </Pressable>
        )}
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {!p.messages ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.accent} />
          </View>
        ) : (
          <FlatList
            inverted
            data={p.messages}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            ListFooterComponent={p.messages.length === 0 ? <Text style={styles.empty}>Aucun message. Dis bonjour 👋</Text> : null}
          />
        )}

        {p.disabledReason ? (
          <View style={styles.notice}>
            <Ionicons name="ban" size={18} color={Colors.textMuted} />
            <Text style={styles.noticeText}>{p.disabledReason}</Text>
          </View>
        ) : locked ? (
          <View style={styles.notice}>
            <Ionicons name="lock-closed" size={18} color={Colors.textMuted} />
            <Text style={styles.noticeText}>Saisie désactivée pendant la conduite</Text>
          </View>
        ) : (
          <>
            {p.editing && (
              <View style={styles.editBar}>
                <Ionicons name="create-outline" size={18} color={Colors.accent} />
                <Text style={styles.editText} numberOfLines={1}>
                  Modification : {p.editing.body}
                </Text>
                <Pressable
                  onPress={() => {
                    setText('');
                    p.onCancelEdit?.();
                  }}
                  hitSlop={10}
                  accessibilityLabel="Annuler la modification">
                  <Ionicons name="close" size={20} color={Colors.textMuted} />
                </Pressable>
              </View>
            )}
            <View style={styles.inputBar}>
              {!p.editing && (
                <Pressable onPress={sendPhoto} hitSlop={8} disabled={sending}>
                  <Ionicons name="image-outline" size={28} color={Colors.accent} />
                </Pressable>
              )}
              <TextInput
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder="Message…"
                placeholderTextColor={Colors.textFaint}
                multiline
                maxLength={2000}
              />
              <Pressable
                style={[styles.sendButton, (!text.trim() || sending) && styles.sendDisabled]}
                onPress={() => send()}
                disabled={!text.trim() || sending}
                accessibilityLabel={p.editing ? 'Enregistrer la modification' : 'Envoyer'}>
                {sending ? (
                  <ActivityIndicator color={Colors.white} size="small" />
                ) : (
                  <Ionicons name={p.editing ? 'checkmark' : 'send'} size={18} color={Colors.white} />
                )}
              </Pressable>
            </View>
          </>
        )}
      </KeyboardAvoidingView>

      <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />
    </SafeAreaView>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.border },
  groupAvatar: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accentSoft },
  headerText: { fontSize: 17, fontWeight: '800', color: Colors.text },
  headerSub: { fontSize: 12, color: Colors.textMuted },
  list: { padding: 12, gap: 4 },
  empty: { color: Colors.textMuted, textAlign: 'center', padding: 24 },
  systemLine: { alignItems: 'center', paddingVertical: 6 },
  system: {
    fontSize: 12,
    color: Colors.textMuted,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    textAlign: 'center',
    overflow: 'hidden',
  },
  line: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  lineMine: { justifyContent: 'flex-end' },
  lineOther: { justifyContent: 'flex-start' },
  senderAvatarBox: { width: 28 },
  senderAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.border },
  column: { maxWidth: '78%', gap: 2 },
  columnMine: { alignItems: 'flex-end' },
  sender: { fontSize: 12, color: Colors.textMuted, marginLeft: 8, marginTop: 6 },
  bubble: { borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  bubbleMine: { backgroundColor: Colors.accent, borderBottomRightRadius: 6 },
  bubbleOther: { backgroundColor: Colors.surface, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: Colors.border },
  bubblePhoto: { padding: 4 },
  bubbleDeleted: { opacity: 0.75 },
  photo: { width: 220, height: 220, borderRadius: 14, backgroundColor: Colors.border },
  photoLoading: { alignItems: 'center', justifyContent: 'center' },
  body: { fontSize: 16, lineHeight: 21, color: Colors.text, paddingHorizontal: 2 },
  bodyMine: { color: Colors.white },
  deleted: { fontSize: 15, fontStyle: 'italic', color: Colors.textMuted },
  deletedMine: { color: Colors.accentSoft },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingHorizontal: 2 },
  time: { fontSize: 11, color: Colors.textMuted },
  timeMine: { color: Colors.accentSoft },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: -2, marginLeft: 6 },
  reactionsMine: { marginLeft: 0, marginRight: 6, justifyContent: 'flex-end' },
  reaction: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reactionMine: { borderColor: Colors.accent, backgroundColor: Colors.accentSoft },
  reactionText: { fontSize: 13, color: Colors.text },
  seen: { fontSize: 12, color: Colors.textMuted, marginRight: 4 },
  seenBlue: { color: Colors.seenTick, fontWeight: '700' },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  noticeText: { color: Colors.textMuted, fontWeight: '600' },
  editBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  editText: { flex: 1, color: Colors.textMuted, fontSize: 13 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 40,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
}));
