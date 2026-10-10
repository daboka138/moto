import { Directory, File } from 'expo-file-system';
import { Share } from 'react-native';

// App Android : enregistrement d'un GPX dans un dossier choisi (sélecteur système), et choix
// d'un fichier GPX à importer. Version web : gpx-file.web.ts.

const LAST_DIR_KEY = 'moto.gpxDir';

function lastDir() {
  try {
    return localStorage.getItem(LAST_DIR_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Enregistre le fichier dans le dossier choisi par l'utilisateur (Documents, Drive…).
 * Renvoie false si l'utilisateur a annulé.
 */
export async function saveGpxFile(fileName: string, content: string): Promise<boolean> {
  let dir: Directory;
  try {
    dir = await Directory.pickDirectoryAsync(lastDir());
  } catch (e) {
    // Sélecteur fermé sans choix
    if (String(e).toLowerCase().includes('cancel')) return false;
    // Sélecteur indisponible : partage du contenu en texte
    console.warn('Choix du dossier impossible, partage en texte', e);
    await Share.share({ title: fileName, message: content });
    return true;
  }
  try {
    localStorage.setItem(LAST_DIR_KEY, dir.uri);
  } catch {
    // pas grave
  }
  const file = dir.createFile(fileName.replace(/\.gpx$/, ''), 'application/gpx+xml');
  file.write(content);
  return true;
}

/** Choisit un fichier GPX sur le téléphone et renvoie son contenu (null si annulé). */
export async function pickGpxFile(): Promise<string | null> {
  const picked = await File.pickFileAsync({ mimeTypes: ['*/*'] });
  if (picked.canceled) return null;
  return picked.result.text();
}
