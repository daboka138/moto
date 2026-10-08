import { File } from 'expo-file-system';

/** Contenu d'un fichier local (photo, vidéo choisie) pour l'envoyer dans Supabase Storage. */
export function readFileBytes(uri: string): Promise<ArrayBuffer> {
  return new File(uri).arrayBuffer();
}
