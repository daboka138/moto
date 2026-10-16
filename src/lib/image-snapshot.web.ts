import { PhotoUnreadableError } from '@/lib/errors';

/** Plus grand côté des photos envoyées depuis le navigateur */
const MAX_SIDE = 1600;
const QUALITY = 0.82;

/**
 * Navigateur : le sélecteur ne renvoie qu'une URL blob: vers le fichier du téléphone. Sur
 * Android (Chrome, Samsung Internet), ce fichier peut devenir illisible quelques minutes plus
 * tard (photo de Google Photos, de l'appareil photo…) : l'envoi échouait alors en « Failed to
 * fetch ». On le lit donc tout de suite, réduit à 1600 px (envoi plus rapide), en mémoire.
 */
export async function snapshotImage(uri: string, mimeType?: string): Promise<{ uri: string; mimeType?: string }> {
  let blob: Blob;
  try {
    blob = await (await fetch(uri)).blob();
  } catch {
    throw new PhotoUnreadableError(uri);
  }
  const small = await downscale(blob).catch(() => null);
  const out = small && small.size < blob.size ? small : blob;
  return { uri: URL.createObjectURL(out), mimeType: out.type || mimeType };
}

/** Vidéo (story) : copiée en mémoire telle quelle, pour la même raison */
export async function snapshotVideo(uri: string, mimeType?: string): Promise<{ uri: string; mimeType?: string }> {
  try {
    const blob = await (await fetch(uri)).blob();
    return { uri: URL.createObjectURL(blob), mimeType: blob.type || mimeType };
  } catch {
    throw new PhotoUnreadableError(uri);
  }
}

/** Image réduite en JPEG (null si le navigateur ne sait pas la décoder, ex. HEIC) */
async function downscale(blob: Blob): Promise<Blob | null> {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', QUALITY));
  } finally {
    bitmap.close();
  }
}
