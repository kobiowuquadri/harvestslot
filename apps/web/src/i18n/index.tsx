'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { en, type MessageKey } from './en';
import { yo, YORUBA_REVIEW_STATUS } from './yo';

export type Locale = 'en' | 'yo';

interface I18n {
  locale: Locale;
  t: (key: MessageKey) => string;
  /** True when the active locale has strings still awaiting review by a fluent speaker. */
  partial: boolean;
}

const I18nContext = createContext<I18n>({ locale: 'en', t: (k) => en[k], partial: false });

/**
 * English is complete. Yoruba covers navigation and common labels only, every string marked
 * "needs fluent review"; anything missing falls back to English.
 */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo<I18n>(
    () => ({
      locale,
      t: (key) => (locale === 'yo' ? (yo[key] ?? en[key]) : en[key]),
      partial: locale === 'yo' && YORUBA_REVIEW_STATUS !== 'reviewed',
    }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT() {
  return useContext(I18nContext);
}
