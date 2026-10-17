import { createVideoPlayer, type VideoPlayer } from 'expo-video';
import { useEffect, useRef, useState } from 'react';

// Lecture des messages vocaux sur Android : le lecteur d'expo-video (déjà dans l'APK 1.2.0, ExoPlayer)
// lit aussi les fichiers audio seuls (WebM/Opus du web, M4A/AAC). Créé au premier appui seulement.

/** Un seul vocal à la fois : lancer un vocal met en pause celui en cours */
let current: { pause: () => void } | null = null;

export function useVoicePlayback(url: string | undefined) {
  const player = useRef<VideoPlayer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const self = useRef({ pause: () => player.current?.pause() });

  useEffect(
    () => () => {
      if (current === self.current) current = null;
      player.current?.release();
      player.current = null;
    },
    [],
  );

  const toggle = () => {
    if (!url) return;
    if (!player.current) {
      const p = createVideoPlayer({ uri: url });
      p.timeUpdateEventInterval = 0.25;
      p.addListener('playingChange', ({ isPlaying }) => setPlaying(isPlaying));
      p.addListener('timeUpdate', ({ currentTime }) => setPositionMs(currentTime * 1000));
      p.addListener('playToEnd', () => {
        p.pause();
        p.currentTime = 0;
        setPositionMs(0);
      });
      player.current = p;
    }
    const p = player.current;
    if (p.playing) p.pause();
    else {
      if (current && current !== self.current) current.pause();
      current = self.current;
      p.play();
    }
  };

  return { playing, positionMs, toggle };
}
