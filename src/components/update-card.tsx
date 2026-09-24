import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { Alert, Text } from 'react-native';

import { Card } from '@/components/profile-view';
import { Button } from '@/components/ui';
import { makeStyles } from '@/constants/theme';

/**
 * Version de l'app et mise à jour à distance (EAS Update).
 * L'app vérifie déjà toute seule au lancement et applique la mise à jour au lancement suivant ;
 * ce bouton permet de l'installer tout de suite.
 */
export function UpdateCard() {
  const styles = useStyles();
  const [busy, setBusy] = useState(false);
  const version = Constants.expoConfig?.version ?? '?';
  const updatedAt = Updates.isEmbeddedLaunch ? null : Updates.createdAt;

  const check = async () => {
    setBusy(true);
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        Alert.alert('À jour', 'Tu as déjà la dernière version.');
        return;
      }
      await Updates.fetchUpdateAsync();
      Alert.alert('Mise à jour prête', 'L’app va redémarrer pour l’installer.', [
        { text: 'Redémarrer', onPress: () => Updates.reloadAsync() },
      ]);
    } catch (e) {
      Alert.alert('Vérification impossible', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="À propos">
      <Text style={styles.line}>
        Version {version}
        {Updates.channel ? ` · canal ${Updates.channel}` : ''}
      </Text>
      {updatedAt && (
        <Text style={styles.hint}>
          Mise à jour du{' '}
          {updatedAt.toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
        </Text>
      )}
      {Updates.isEnabled ? (
        <Button title="Rechercher une mise à jour" variant="secondary" loading={busy} onPress={check} />
      ) : (
        <Text style={styles.hint}>Mises à jour à distance désactivées en développement.</Text>
      )}
    </Card>
  );
}

const useStyles = makeStyles((Colors) => ({
  line: { fontSize: 15, fontWeight: '700', color: Colors.text },
  hint: { fontSize: 13, color: Colors.textMuted },
}));
