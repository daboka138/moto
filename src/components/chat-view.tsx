import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatWallpaper } from '@/components/chat-wallpaper';
import { PhotoViewer } from '@/components/photo-viewer';
import { TripShareCard } from '@/components/trip-share-card';
import { RecordingWave, VoiceMessage, VoiceMicButton } from '@/components/voice-message';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { useDrivingLock } from '@/lib/driving-lock';
import { formatVoiceDuration, messageTime, type Message } from '@/lib/messages';
import { pickImage, type PickedImage } from '@/lib/pick-image';
import type { WallPhoto } from '@/lib/wall';
import { useVoiceRecorder } from '@/lib/use-voice-recorder';
import type { RecordedVoice } from '@/lib/voice-recorder';
import type { Wallpaper } from '@/lib/wallpapers';

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
  /** Petit badge à côté du nom (« Créateur de PasseRyder ») */
  titleBadge?: string | null;
  onTitlePress?: () => void;
  onMenu?: () => void;
  /** Icône 👁 de la barre du haut : voir le fond d'écran (ou le choisir) */
  onWallpaper?: () => void;
  /** Du plus récent au plus ancien */
  messages: Message[] | null;
  meId: string;
  people: Map<string, ChatPerson>;
  imageUrl: (path: string) => string | undefined;
  statusOf: (m: Message) => MessageStatus;
  reactionsOf: (m: Message) => ReactionSummary;
  onReact: (m: Message, emoji: string) => void;
  onSend: (text: string, image?: PickedImage) => Promise<void>;
  /** Message vocal enregistré (micro maintenu, ou tap puis écoute) */
  onSendVoice?: (voice: RecordedVoice) => Promise<void>;
  onMessageLongPress?: (m: Message) => void;
  /** Appui sur un de mes messages : détail « Vu à … » / « Vu par … » */
  onMyMessagePress?: (m: Message) => void;
  /** Message en cours de modification (saisie pré-remplie) */
  editing?: Message | null;
  onCancelEdit?: () => void;
  onEdit?: (m: Message, text: string) => Promise<void>;
  /** Réponse en préparation (citation au-dessus de la saisie) */
  replying?: Message | null;
  onCancelReply?: () => void;
  /** Petit message passager (« Message copié ») */
  flash?: string | null;
  /** Fond d'écran personnel de la conversation */
  wallpaper?: Wallpaper | null;
  wallpaperPhotoUrl?: string | null;
  /** Saisie impossible (blocage…) : explication affichée à la place */
  disabledReason?: string | null;
  /** Texte pré-rempli dans la saisie (non envoyé) */
  initialText?: string;
  /** Message épinglé (groupes) : bandeau sous l'en-tête, touché = en entier */
  pinned?: string | null;
};

/** Conversation : bulles, photos, réactions, statuts, « modifié », saisie (bloquée pendant la conduite). */
export function ChatView(p: Props) {
  const Colors = useColors();
  const styles = useStyles();
  const { locked } = useDrivingLock();
  const [text, setText] = useState(p.initialText ?? '');
  const [sending, setSending] = useState(false);
  const [viewing, setViewing] = useState<WallPhoto | null>(null);
  // Web : bouton « ⋯ » sur le message survolé
  const [hoverId, setHoverId] = useState<string | null>(null);
  // Petite aide / erreur des messages vocaux
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const showHint = (m: string, long?: boolean) => {
    setVoiceHint(m);
    setTimeout(() => setVoiceHint((h) => (h === m ? null : h)), long ? 9000 : 3500);
  };
  // Messages vocaux : 🎤 toujours affiché à gauche d'Envoyer (explique quand l'enregistrement est impossible)
  const voice = useVoiceRecorder({
    onInfo: showHint,
    onSend: (v) => {
      setSending(true);
      p.onSendVoice?.(v).finally(() => setSending(false));
    },
  });
  const rec = voice.state.phase === 'recording' ? voice.state : null;
  const voicePreview = voice.state.phase === 'preview' ? voice.state.voice : null;
  const showMic = !!p.onSendVoice && !p.editing && !voicePreview;
  const byId = new Map((p.messages ?? []).map((m) => [m.id, m]));

  // Citation d'un message (réponse) : auteur + début du texte
  const quoteOf = (id: string) => {
    const q = byId.get(id);
    if (!q) return { who: '', text: 'Message' };
    const who = q.senderId === p.meId ? 'Toi' : `@${p.people.get(q.senderId)?.username ?? '?'}`;
    const text = q.deletedAt ? 'Message supprimé' : q.body || (q.imagePath ? '📷 Photo' : 'Message');
    return { who, text };
  };

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
    const quote = item.replyToId && !deleted ? quoteOf(item.replyToId) : null;
    // Web : clic droit = menu du message
    const contextMenu =
      Platform.OS === 'web'
        ? {
            onContextMenu: (e: { preventDefault: () => void }) => {
              e.preventDefault();
              longPress();
            },
          }
        : {};
    const moreButton = Platform.OS === 'web' && !deleted && (
      <Pressable
        onPress={longPress}
        style={[styles.more, hoverId !== item.id && styles.moreHidden]}
        hitSlop={6}
        accessibilityLabel="Actions du message">
        <Ionicons name="ellipsis-horizontal" size={18} color={Colors.textMuted} />
      </Pressable>
    );
    const content = (
      <>
        {!mine && p.isGroup && (
          <View style={styles.senderAvatarBox}>
            {firstOfRun && person && <Image source={{ uri: person.avatarUrl }} style={styles.senderAvatar} />}
          </View>
        )}
        <View style={[styles.column, mine && styles.columnMine]}>
          {!mine && p.isGroup && firstOfRun && (
            <Text style={[styles.sender, !!p.wallpaper && styles.onWallpaper]}>@{person?.username ?? '?'}</Text>
          )}
          <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
          {mine && moreButton}
          <Pressable
            {...contextMenu}
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
                {quote && (
                  <View style={[styles.quote, mine && styles.quoteMine]}>
                    {!!quote.who && <Text style={[styles.quoteWho, mine && styles.quoteWhoMine]}>{quote.who}</Text>}
                    <Text style={[styles.quoteText, mine && styles.quoteTextMine]} numberOfLines={2}>
                      {quote.text}
                    </Text>
                  </View>
                )}
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
                {item.audioPath ? (
                  <VoiceMessage url={p.imageUrl(item.audioPath)} durationMs={item.audioDurationMs} mine={mine} />
                ) : item.tripShareId ? (
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
          {!mine && moreButton}
          </View>
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
              <Text style={[styles.seen, seenSome && styles.seenBlue, !!p.wallpaper && styles.onWallpaper]}>{seenLabel}</Text>
            </Pressable>
          )}
        </View>
      </>
    );
    const lineStyle = [styles.line, mine ? styles.lineMine : styles.lineOther];
    return Platform.OS === 'web' ? (
      <Pressable style={lineStyle} onHoverIn={() => setHoverId(item.id)} onHoverOut={() => setHoverId((h) => (h === item.id ? null : h))}>
        {content}
      </Pressable>
    ) : (
      <View style={lineStyle}>{content}</View>
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
            <View style={styles.titleRow}>
              <Text style={[styles.headerText, styles.shrink]} numberOfLines={1}>
                {p.title}
              </Text>
              {!!p.titleBadge && (
                <View style={styles.titleBadge}>
                  <Ionicons name="shield-checkmark" size={11} color={Colors.accentOnSoft} />
                  <Text style={styles.titleBadgeText} numberOfLines={1}>
                    {p.titleBadge}
                  </Text>
                </View>
              )}
            </View>
            {!!p.subtitle && (
              <Text style={styles.headerSub} numberOfLines={1}>
                {p.subtitle}
              </Text>
            )}
          </View>
        </Pressable>
        {p.onWallpaper && (
          <Pressable onPress={p.onWallpaper} hitSlop={10} accessibilityLabel={p.wallpaper ? 'Voir le fond d’écran' : 'Choisir un fond d’écran'}>
            <Ionicons name="eye-outline" size={24} color={Colors.text} />
          </Pressable>
        )}
        {p.onMenu && (
          <Pressable onPress={p.onMenu} hitSlop={12} accessibilityLabel="Options de la conversation">
            <Ionicons name="ellipsis-horizontal" size={24} color={Colors.text} />
          </Pressable>
        )}
      </View>

      {!!p.pinned && (
        <Pressable style={styles.pinned} onPress={() => setPinnedOpen((o) => !o)} accessibilityLabel="Message épinglé">
          <Text style={styles.pinnedIcon}>📌</Text>
          <Text style={styles.pinnedText} numberOfLines={pinnedOpen ? undefined : 2}>
            {p.pinned}
          </Text>
          <Ionicons name={pinnedOpen ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
        </Pressable>
      )}

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.flex}>
        {!!p.wallpaper && <ChatWallpaper wallpaper={p.wallpaper} photoUrl={p.wallpaperPhotoUrl} />}
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
            ListFooterComponent={
              p.messages.length === 0 ? (
                <Text style={[styles.empty, !!p.wallpaper && styles.onWallpaper]}>Aucun message. Dis bonjour 👋</Text>
              ) : null
            }
          />
        )}
        </View>

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
            {!!(p.flash ?? voiceHint) && <Text style={styles.flash}>{p.flash ?? voiceHint}</Text>}
            {p.replying && !p.editing && (
              <View style={styles.editBar}>
                <Ionicons name="arrow-undo-outline" size={18} color={Colors.accent} />
                <Text style={styles.editText} numberOfLines={1}>
                  Réponse à {quoteOf(p.replying.id).who || 'ce message'} : {quoteOf(p.replying.id).text}
                </Text>
                <Pressable onPress={p.onCancelReply} hitSlop={10} accessibilityLabel="Annuler la réponse">
                  <Ionicons name="close" size={20} color={Colors.textMuted} />
                </Pressable>
              </View>
            )}
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
              {!p.editing && !rec && !voicePreview && (
                <Pressable onPress={sendPhoto} hitSlop={8} disabled={sending} style={styles.sideButton}>
                  <Ionicons name="image-outline" size={28} color={Colors.accent} />
                </Pressable>
              )}
              {rec?.mode === 'tap' && (
                <Pressable onPress={voice.cancel} hitSlop={8} style={styles.sideButton} accessibilityLabel="Supprimer l’enregistrement">
                  <Ionicons name="trash-outline" size={24} color={Colors.danger} />
                </Pressable>
              )}
              {voicePreview && (
                <Pressable
                  onPress={voice.discardPreview}
                  hitSlop={8}
                  style={styles.sideButton}
                  accessibilityLabel="Supprimer le message vocal">
                  <Ionicons name="trash-outline" size={24} color={Colors.danger} />
                </Pressable>
              )}
              {rec ? (
                <View style={styles.recording}>
                  <View style={styles.recDot} />
                  <Text style={styles.recTime}>{formatVoiceDuration(rec.elapsedMs)}</Text>
                  <RecordingWave elapsedMs={rec.elapsedMs} />
                  <Text style={[styles.recHint, rec.cancelling && styles.recCancel]} numberOfLines={1}>
                    {rec.mode === 'tap' ? 'Touche ■ pour arrêter' : rec.cancelling ? 'Relâche pour annuler' : '‹ Glisse pour annuler'}
                  </Text>
                </View>
              ) : voicePreview ? (
                <View style={styles.recording}>
                  <VoiceMessage url={voicePreview.uri} durationMs={voicePreview.durationMs} mine={false} />
                </View>
              ) : (
              <TextInput
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder="Message…"
                placeholderTextColor={Colors.textFaint}
                multiline
                maxLength={2000}
              />
              )}
              {showMic && <VoiceMicButton recorder={voice} />}
              {voicePreview || rec?.mode === 'tap' ? (
                <Pressable
                  style={[styles.sendButton, sending && styles.sendDisabled]}
                  onPress={voicePreview ? voice.sendPreview : voice.stopAndSend}
                  disabled={sending}
                  accessibilityLabel="Envoyer le message vocal">
                  {sending ? <ActivityIndicator color={Colors.white} size="small" /> : <Ionicons name="send" size={18} color={Colors.white} />}
                </Pressable>
              ) : (
              <Pressable
                style={[styles.sendButton, (!text.trim() || sending || !!rec) && styles.sendDisabled]}
                onPress={() => send()}
                disabled={!text.trim() || sending || !!rec}
                accessibilityLabel={p.editing ? 'Enregistrer la modification' : 'Envoyer'}>
                {sending ? (
                  <ActivityIndicator color={Colors.white} size="small" />
                ) : (
                  <Ionicons name={p.editing ? 'checkmark' : 'send'} size={18} color={Colors.white} />
                )}
              </Pressable>
              )}
            </View>
          </>
        )}
      </KeyboardAvoidingView>

      <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />
    </SafeAreaView>
  );
}

/** Web : mots très longs et liens coupés proprement au lieu de déborder (pas de scroll horizontal) */
const wrapAnywhere = (Platform.OS === 'web' ? { overflowWrap: 'anywhere', wordBreak: 'break-word' } : {}) as object;

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.border },
  groupAvatar: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accentSoft },
  headerText: { fontSize: Type.large, fontWeight: '800', color: Colors.text },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shrink: { flexShrink: 1 },
  titleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: Colors.accentSoft,
  },
  titleBadgeText: { fontSize: Type.small, fontWeight: '800', color: Colors.accentOnSoft },
  headerSub: { fontSize: Type.small, color: Colors.textMuted },
  pinned: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pinnedIcon: { fontSize: Type.body },
  pinnedText: { flex: 1, fontSize: Type.small, lineHeight: 18, color: Colors.text, ...wrapAnywhere },
  list: { padding: 12, gap: 4, ...(Platform.OS === 'web' ? ({ overflowX: 'hidden' } as object) : {}) },
  empty: { color: Colors.textMuted, textAlign: 'center', padding: 24 },
  systemLine: { alignItems: 'center', paddingVertical: 8 },
  system: {
    fontSize: Type.small,
    color: Colors.textMuted,
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 4,
    textAlign: 'center',
    overflow: 'hidden',
  },
  line: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  lineMine: { justifyContent: 'flex-end' },
  lineOther: { justifyContent: 'flex-start' },
  senderAvatarBox: { width: 28 },
  senderAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.border },
  // Bulles à 80 % max ; minWidth 0 + flexShrink : sur le web, un élément flex ne rétrécit pas tout seul
  // (react-native-web) et les longues lignes débordaient à droite au lieu de passer à la ligne
  column: { maxWidth: '80%', minWidth: 0, flexShrink: 1, gap: 2 },
  columnMine: { alignItems: 'flex-end' },
  sender: { fontSize: Type.small, color: Colors.textMuted, marginLeft: 8, marginTop: 8 },
  bubbleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%', minWidth: 0 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  more: { padding: 4, borderRadius: Radius.md, backgroundColor: Colors.surface },
  moreHidden: { opacity: 0 },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    backgroundColor: Colors.background,
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 2,
  },
  quoteMine: { borderLeftColor: Colors.white, backgroundColor: Colors.accentDark },
  quoteWho: { fontSize: Type.small, fontWeight: '800', color: Colors.accent },
  quoteWhoMine: { color: Colors.white },
  quoteText: { fontSize: Type.small, color: Colors.textMuted, ...wrapAnywhere },
  quoteTextMine: { color: Colors.accentSoft },
  flash: {
    alignSelf: 'center',
    fontSize: Type.small,
    fontWeight: '700',
    color: Colors.white,
    backgroundColor: Colors.neutral,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 8,
    marginHorizontal: 12,
    maxWidth: 520,
    textAlign: 'center',
    overflow: 'hidden',
  },
  bubble: { borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, gap: 2, flexShrink: 1, minWidth: 0 },
  bubbleMine: { backgroundColor: Colors.accent, borderBottomRightRadius: Radius.sm },
  bubbleOther: { backgroundColor: Colors.surface, borderBottomLeftRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border },
  bubblePhoto: { padding: 4 },
  bubbleDeleted: { opacity: 0.75 },
  photo: { width: 220, height: 220, borderRadius: Radius.md, backgroundColor: Colors.border },
  photoLoading: { alignItems: 'center', justifyContent: 'center' },
  body: { fontSize: Type.body, lineHeight: 21, color: Colors.text, paddingHorizontal: 2, ...wrapAnywhere },
  bodyMine: { color: Colors.white },
  deleted: { fontSize: Type.body, fontStyle: 'italic', color: Colors.textMuted },
  deletedMine: { color: Colors.accentSoft },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingHorizontal: 2 },
  time: { fontSize: Type.small, color: Colors.textMuted },
  timeMine: { color: Colors.accentSoft },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: -2, marginLeft: 8 },
  reactionsMine: { marginLeft: 0, marginRight: 8, justifyContent: 'flex-end' },
  reaction: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reactionMine: { borderColor: Colors.accent, backgroundColor: Colors.accentSoft },
  reactionText: { fontSize: Type.small, color: Colors.text },
  seen: { fontSize: Type.small, color: Colors.textMuted, marginRight: 4 },
  seenBlue: { color: Colors.seenTick, fontWeight: '700' },
  /** Petits textes posés sur un fond d'écran : pastille pour rester lisibles */
  onWallpaper: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 1,
    overflow: 'hidden',
  },
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  editText: { flex: 1, color: Colors.textMuted, fontSize: Type.small },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: Type.body,
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
  sideButton: { height: 40, justifyContent: 'center' },
  recording: { flex: 1, minWidth: 0, minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8 },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.danger },
  recTime: { fontSize: Type.body, fontWeight: '800', color: Colors.text, minWidth: 40 },
  recHint: { flex: 1, minWidth: 0, fontSize: Type.body, color: Colors.textMuted, textAlign: 'right' },
  recCancel: { color: Colors.danger, fontWeight: '800' },
}));
