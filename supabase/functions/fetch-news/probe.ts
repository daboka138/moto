// Taille réelle d'une image d'actu : on ne lit que le début du fichier (128 Ko max), assez pour
// l'en-tête JPEG / PNG / GIF / WebP. Rien n'est gardé, seulement largeur et hauteur.
import { imageSize } from './rss.ts';

const MAX_BYTES = 128 * 1024;

export async function probeImageSize(url: string): Promise<{ width: number; height: number } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'PasseRyder/1.0 (+https://passeryder.fr)', Range: `bytes=0-${MAX_BYTES - 1}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.length;
      const size = imageSize(concat(chunks, total));
      if (size) {
        reader.cancel().catch(() => {});
        return size;
      }
    }
    reader.cancel().catch(() => {});
    return imageSize(concat(chunks, total));
  } catch {
    return null;
  }
}

function concat(chunks: Uint8Array[], total: number) {
  const out = new Uint8Array(total);
  let i = 0;
  for (const c of chunks) {
    out.set(c, i);
    i += c.length;
  }
  return out;
}
