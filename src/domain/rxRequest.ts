import type { CareProfile, Medication, PrescriberContact } from './types';

interface MessageInput {
  profile: CareProfile;
  medication: Medication;
  prescriber?: PrescriberContact;
  shortageAt: string | null;
}

export function buildRxRequestMessage({ profile, medication, prescriber, shortageAt }: MessageInput): string {
  const greeting = prescriber ? `Dobrý den, ${prescriber.name},` : 'Dobrý den,';
  const strength = medication.strength ? ` ${medication.strength}` : '';
  const timing = shortageAt
    ? `Podle evidence zásoba vystačí přibližně do ${new Intl.DateTimeFormat('cs-CZ', {
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
      }).format(new Date(shortageAt))}.`
    : '';
  return `${greeting}\nprosím o vystavení nového eReceptu pro ${profile.displayName}: ${medication.name}${strength}. ${timing}\nDěkuji.`
    .replace(/ +\n/g, '\n')
    .replace(/  +/g, ' ');
}
