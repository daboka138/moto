/**
 * Photo choisie : sur le téléphone (app), le fichier reste lisible jusqu'à l'envoi, rien à faire.
 * Version web : image-snapshot.web.ts (copie en mémoire dès le choix).
 */
export async function snapshotImage(uri: string, mimeType?: string): Promise<{ uri: string; mimeType?: string }> {
  return { uri, mimeType };
}

/** Vidéo choisie : rien à faire dans l'app */
export async function snapshotVideo(uri: string, mimeType?: string): Promise<{ uri: string; mimeType?: string }> {
  return { uri, mimeType };
}
