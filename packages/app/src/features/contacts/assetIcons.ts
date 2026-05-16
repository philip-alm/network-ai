import {
  Briefcase,
  Mic,
  Building2,
  FileText,
  Calendar,
  Camera,
  Car,
  Wrench,
  KeyRound,
  Database,
  Hotel,
  type LucideIcon,
} from 'lucide-react';

/**
 * Pick an icon for an asset based on keywords in the name + availability.
 * Falls back to Briefcase. Keep mappings short and high-precision — a
 * wrong icon is worse than the generic one.
 */
export function iconForAsset(name: string, availability?: string | null): LucideIcon {
  const text = `${name} ${availability ?? ''}`.toLowerCase();
  if (/podcast|microphone|\bmic\b|audio|recording/.test(text)) return Mic;
  if (/\bhotel\b|\broom\b|stay|airbnb|accommodation/.test(text)) return Hotel;
  if (/studio|workspace|coworking|office|venue|space/.test(text)) return Building2;
  if (/deck|template|doc|contract|brief|pitch|notes|memo|paper/.test(text)) return FileText;
  if (/event|tour|launch|festival|conference|meetup/.test(text)) return Calendar;
  if (/camera|video|film|shoot|lens/.test(text)) return Camera;
  if (/\bcar\b|vehicle|bike|truck|van/.test(text)) return Car;
  if (/tool|gear|equip|kit/.test(text)) return Wrench;
  if (/access|invite|membership|club|pass|rights/.test(text)) return KeyRound;
  if (/list|database|directory|crm|leads/.test(text)) return Database;
  return Briefcase;
}
