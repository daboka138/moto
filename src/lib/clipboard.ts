// Copier du texte. Le presse-papier du cœur de React Native (module natif déjà dans l'APK) suffit :
// pas de module en plus. Version web : clipboard.web.ts.
import { Clipboard } from 'react-native';

export async function copyText(text: string): Promise<void> {
  Clipboard.setString(text);
}
