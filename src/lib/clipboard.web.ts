// Copier du texte (version web) : API du navigateur, repli react-native-web
import { Clipboard } from 'react-native';

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    Clipboard.setString(text);
  }
}
