import type { MessageKey } from './en';

/**
 * Yoruba strings — DRAFT. These were drafted without a fluent speaker and MUST be reviewed before
 * being shown to farmers as the default. The UI labels Yoruba as "partial / needs review".
 * Only navigation and common labels are covered; everything else falls back to English.
 */
export const YORUBA_REVIEW_STATUS: 'needs-fluent-review' | 'reviewed' = 'needs-fluent-review';

export const yo: Partial<Record<MessageKey, string>> = {
  'nav.home': 'Ilé',
  'nav.harvests': 'Ìkórè',
  'nav.bookings': 'Ìfipamọ́',
  'nav.payments': 'Ìsanwó',
  'nav.more': 'Síwájú sí i',
  'nav.notifications': 'Ìfitónilétí',
  'nav.settings': 'Ètò',
  'nav.signOut': 'Jáde',
  'common.loading': 'Ó ń gbé e wọlé…',
  'common.retry': 'Tún gbìyànjú',
  'common.save': 'Fi pamọ́',
  'common.cancel': 'Fagilé',
  'common.back': 'Padà',
  'farmer.readyToHarvest': 'Ó ti ṣetán fún ìkórè',
  'farmer.newRequest': 'Ìbéèrè ìkórè tuntun',
};
