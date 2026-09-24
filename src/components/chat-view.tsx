import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PhotoViewer } from '@/components/photo-viewer';
import { makeStyles, useColors } from '@/constants/theme';
import { useDrivingLock } from '@/lib/driving-lock';
import { messageTime, type Message } from '@/lib/messages';
import { pickImage, type PickedImage } from '@/lib/pick-image';
import type { WallPhoto } from '@/lib/wall';

export type ChatPerson = { username: string; avatarUrl: string };

type Props = {
  title: string;
  avatarUrl: string | null;
  isGroup: boolean;
  onTitlePress?: () => void;
  onMenu?: () => void;
  /** Du plus récent au plus ancien */
  messages: Message[] | null;
  meId: string;
  people: Map<string, ChatPerson>;
  /** Dernière lecture de chaque autre membre */
  readers: { id: string; lastReadAt: string }[];
  imageUrl: (path: string) => string | undefined;
  onSend: (text: string, image?: PickedImage) => Promise<void>;
  onMessageLongPress?: (m: Message) => void;
  /** Saisie impossible (blocage…) : explication affichée à la place */
  disabledReason?: string | null;
};

/** Conversation : bulles, photos, heure, « Vu », saisie (bloquée pendant la conduite). */
export function ChatView(p: Props) {
  const Colors = useColors();
  const styles = useStyles();
  const { locked } = useDrivingLock();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [viewing, setViewing] = useState<WallPhoto | null>(null);

  const send = async (image?: PickedImage) => {
    if (sending || (!text.trim() && !image)) return;
    setSending(true);
    try {
      await p.onSend(image ? '' : text, image);
      if (!image) setText('');
    } finally {
      setSending(false);
    }
  };

  const sendPhoto = async () => {
    const image = await pickImage('Envoyer une photo');
    if (image) await send(image);
  };

  // « Vu » sous mon dernier message
  const lastMine = p.messages?.find((m) => m.senderId === p.meId);
  const seenBy = lastMine ? p.readers.filter((r) => r.lastReadAt >= lastMine.createdAt).length : 0;
  const seenLabel = !lastMine ? null : seenBy === 0 ? 'Envoyé' : p.isGroup ? `Vu par ${seenBy}` : 'Vu';

  const renderItem = ({ item, index }: { item: Message; index: number }) => {
    const mine = item.senderId === p.meId;
    const older = p.messages?.[index + 1];
    const firstOfRun = !older || older.senderId !== item.senderId;
    const person = p.people.get(item.senderId);
    const url = item.imagePath ? p.imageUrl(item.imagePath) : undefined;
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
            onLongPress={() => !mine && p.onMessageLongPress?.(item)}
            delayLongPress={350}
            style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther, !!item.imagePath && styles.bubblePhoto]}>
            {item.imagePath &&
              (url ? (
                <Pressable
                  onPress={() =>
                    setViewing({ id: item.id, ownerId: item.senderId, path: null, url, caption: item.body, createdAt: item.createdAt })
                  }
                  onLongPress={() => !mine && p.onMessageLongPress?.(item)}>
                  <Image source={{ uri: url }} style={styles.photo} contentFit="cover" transition={150} />
                </Pressable>
              ) : (
                <View style={[styles.photo, styles.photoLoading]}>
                  <ActivityIndicator color={Colors.textMuted} />
                </View>
              ))}
            {!!item.body && <Text style={[styles.body, mine && styles.bodyMine]}>{item.body}</Text>}
            <Text style={[styles.time, mine && styles.timeMine]}>{messageTime(item.createdAt)}</Text>
          </Pressable>
          {item.id === lastMine?.id && !!seenLabel && <Text style={styles.seen}>{seenLabel}</Text>}
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
              <Ionicons name="flag" size={18} color={Colors.accent} />
            </View>
          )}
          <Text style={styles.headerText} numberOfLines={1}>
            {p.title}
          </Text>
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
            ListFooterComponent={
              p.messages.length === 0 ? (
                <Text style={styles.empty}>Aucun message. Dis bonjour 👋</Text>
              ) : null
            }
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
          <View style={styles.inputBar}>
            <Pressable onPress={sendPhoto} hitSlop={8} disabled={sending}>
              <Ionicons name="image-outline" size={28} color={Colors.accent} />
            </Pressable>
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
              disabled={!text.trim() || sending}>
              {sending ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (
                <Ionicons name="send" size={18} color={Colors.white} />
              )}
            </Pressable>
          </View>
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
  headerText: { flex: 1, fontSize: 17, fontWeight: '800', color: Colors.text },
  list: { padding: 12, gap: 4 },
  empty: { color: Colors.textMuted, textAlign: 'center', padding: 24 },
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
  photo: { width: 220, height: 220, borderRadius: 14, backgroundColor: Colors.border },
  photoLoading: { alignItems: 'center', justifyContent: 'center' },
  body: { fontSize: 16, lineHeight: 21, color: Colors.text, paddingHorizontal: 2 },
  bodyMine: { color: Colors.white },
  time: { fontSize: 11, color: Colors.textMuted, alignSelf: 'flex-end', paddingHorizontal: 2 },
  timeMine: { color: Colors.accentSoft },
  seen: { fontSize: 12, color: Colors.textMuted, marginRight: 4 },
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
