import { router } from 'expo-router';
import { Alert } from 'react-native';

import { showActionSheet } from '@/components/action-sheet';
import { IS_WEB } from '@/lib/app-link';
import { parseGpx, setPendingGpx, trackLengthM, type GpxData } from '@/lib/gpx';
import { pickGpxFile } from '@/lib/gpx-file';
import { shortDistance } from '@/lib/navigation';

/** Choisit un fichier GPX et le lit (null si annulé ; message d'erreur si illisible) */
export async function pickAndParseGpx(): Promise<GpxData | null> {
  try {
    const text = await pickGpxFile();
    return text ? parseGpx(text) : null;
  } catch (e) {
    Alert.alert('Import GPX', e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** Import d'un GPX puis choix : créer une balade avec ce tracé, ou naviguer en le suivant (app). */
export async function importGpx() {
  const data = await pickAndParseGpx();
  if (!data) return;
  const title = `${data.name ?? 'Tracé GPX'} · ${shortDistance(trackLengthM(data.points))}`;
  const options = [
    {
      label: 'Créer une balade avec ce tracé',
      onPress: () => {
        setPendingGpx(data);
        router.push({ pathname: '/ride/new', params: { gpx: '1' } });
      },
    },
  ];
  // Navigation guidée : app Android uniquement
  if (!IS_WEB) {
    options.push({
      label: 'Naviguer en suivant ce tracé',
      onPress: () => {
        setPendingGpx(data);
        router.navigate({ pathname: '/', params: { gpx: String(Date.now()) } });
      },
    });
  }
  showActionSheet({ title, options });
}
