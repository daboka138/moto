import { createElement, forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import type { MapFrameHandle, MapFrameProps } from '@/components/map-frame-types';
import { countMapMessage } from '@/lib/perf-meter';

// Variante web de MapFrame : la même page de carte dans une iframe (srcdoc). La page appelle
// window.ReactNativeWebView.postMessage comme dans l'app ; ici, ses messages remontent par
// postMessage, et injectJavaScript s'exécute dans l'iframe.

let nextId = 1;

export const MapFrame = forwardRef<MapFrameHandle, MapFrameProps>(function MapFrame(
  { html, onMessage },
  ref,
) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const id = useRef(0);
  if (!id.current) id.current = nextId++;
  const handler = useRef(onMessage);
  useEffect(() => {
    handler.current = onMessage;
  });

  useEffect(() => {
    const listen = (e: MessageEvent) => {
      const d = e.data as { mapFrame?: number; data?: string } | null;
      if (d && d.mapFrame === id.current && typeof d.data === 'string') handler.current(d.data);
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, []);

  useImperativeHandle(ref, () => ({
    injectJavaScript: (code: string) => {
      countMapMessage();
      const win = frame.current?.contentWindow as (Window & { eval: (c: string) => unknown }) | null | undefined;
      try {
        win?.eval(code);
      } catch {
        // page pas encore prête : l'état est renvoyé à son « ready »
      }
    },
  }));

  const shim = `<script>window.ReactNativeWebView={postMessage:function(m){parent.postMessage({mapFrame:${id.current},data:m},'*')}};</script>`;
  const srcDoc = html.replace('<head>', '<head>' + shim);
  return createElement('iframe', {
    ref: frame,
    srcDoc,
    title: 'Carte',
    style: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', border: 0 },
  });
});
