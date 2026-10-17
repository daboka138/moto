import { useEffect, useRef, useState } from 'react';

// Lecture des messages vocaux sur le web : élément <audio> du navigateur, créé au premier appui.

let current: HTMLAudioElement | null = null;

export function useVoicePlayback(url: string | undefined) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);

  useEffect(
    () => () => {
      audio.current?.pause();
      if (current === audio.current) current = null;
      audio.current = null;
    },
    [],
  );

  const toggle = () => {
    if (!url) return;
    if (!audio.current) {
      const a = new Audio(url);
      a.preload = 'auto';
      a.onplay = () => setPlaying(true);
      a.onpause = () => setPlaying(false);
      a.ontimeupdate = () => setPositionMs(a.currentTime * 1000);
      a.onended = () => {
        a.currentTime = 0;
        setPositionMs(0);
      };
      audio.current = a;
    }
    const a = audio.current;
    if (!a.paused) a.pause();
    else {
      if (current && current !== a) current.pause();
      current = a;
      a.play().catch((e) => console.warn('Lecture du message vocal impossible', e));
    }
  };

  return { playing, positionMs, toggle };
}
