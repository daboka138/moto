import { requireOptionalNativeModule } from 'expo';

// Choisir un contact du téléphone (sélecteur Android) pour l'ajouter aux contacts d'urgence.
// expo-contacts est un module natif : il n'existe que dans les APK construits après son ajout.
// Sur un APK plus ancien (mis à jour par eas update), l'option est simplement masquée.

export const canPickPhoneContact = requireOptionalNativeModule('ExpoContactsNext') != null;

export type PickedContact = { name: string; phones: string[] };

/** Ouvre le sélecteur de contacts ; null si annulé */
export async function pickPhoneContact(): Promise<PickedContact | null> {
  // Chargé seulement si le module natif est là (sinon l'import planterait)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Contacts = require('expo-contacts') as typeof import('expo-contacts');
  const perm = await Contacts.requestPermissionsAsync();
  if (!perm.granted) throw new Error('Accès aux contacts refusé. Autorise-le dans les réglages Android, ou saisis le numéro.');
  const contact = await Contacts.Contact.presentPicker();
  if (!contact) return null;
  const [name, phones] = await Promise.all([contact.getFullName().catch(() => ''), contact.getPhones()]);
  return {
    name: name.trim(),
    phones: [...new Set(phones.map((p) => p.number ?? '').filter(Boolean))],
  };
}
