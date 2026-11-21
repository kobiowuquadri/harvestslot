import {
  BarChart3,
  Bell,
  Building2,
  CalendarRange,
  ClipboardCheck,
  FileText,
  Gauge,
  Handshake,
  Home,
  Inbox,
  KeyRound,
  Landmark,
  ListChecks,
  MapPin,
  Map as MapIcon,
  PackageSearch,
  Receipt,
  ScrollText,
  Scale,
  Settings,
  ShieldAlert,
  Sprout,
  Truck,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { MessageKey } from '@/i18n/en';
import { can } from '@/lib/hooks';
import type { Workspace } from '@/lib/session';

export interface NavItem {
  href: string;
  label: string;
  labelKey?: MessageKey;
  icon: LucideIcon;
  /** Shown in the phone bottom bar (max 4 + "More"). */
  mobile?: boolean;
  /** Listed under "More" in the sidebar, after the main areas. */
  secondary?: boolean;
}

export function navFor(w: Workspace | undefined, devTools: boolean): NavItem[] {
  if (!w) return [];
  const items: Array<NavItem | false> = (() => {
    switch (w.kind) {
      case 'farmer':
        return [
          { href: '/app', label: 'Home', labelKey: 'nav.home', icon: Home, mobile: true },
          { href: '/farmer/harvests', label: 'Harvests', labelKey: 'nav.harvests', icon: Sprout, mobile: true },
          { href: '/bookings', label: 'My plans', icon: ClipboardCheck, mobile: true },
          { href: '/invoices', label: 'Payments', labelKey: 'nav.payments', icon: Receipt, mobile: true },
          { href: '/farmer/locations', label: 'Farm locations', labelKey: 'nav.locations', icon: MapPin, secondary: true },
          { href: '/disputes', label: 'Problems reported', icon: Scale, secondary: true },
          { href: '/farmer/permissions', label: 'Cooperative permissions', labelKey: 'nav.permissions', icon: KeyRound, secondary: true },
        ] satisfies NavItem[];
      case 'processor':
        return [
          // Three main areas: Buying slots, Requests and Bookings (weights and payments are recorded from a booking).
          { href: '/app', label: 'Home', icon: Gauge, mobile: true },
          can(w, 'processor.slot.manage') && { href: '/processor/capacity', label: 'Buying slots', icon: CalendarRange, mobile: true },
          can(w, 'processor.offer.manage') && { href: '/processor/inbox', label: 'Requests', icon: Inbox, mobile: true },
          { href: '/bookings', label: 'Bookings', labelKey: 'nav.bookings', icon: ClipboardCheck, mobile: true },
          can(w, 'processor.invoice.view') && { href: '/invoices', label: 'Payments', icon: Receipt, secondary: true },
          { href: '/processor/intake', label: 'Intake schedule', labelKey: 'nav.intake', icon: ListChecks, secondary: true, mobile: !can(w, 'processor.slot.manage') },
          can(w, 'processor.offer.manage') && { href: '/processor/offers', label: 'All offers sent', icon: Handshake, secondary: true },
          { href: '/disputes', label: 'Problems reported', icon: ShieldAlert, secondary: true },
          can(w, 'processor.facility.manage') && { href: '/processor/facilities', label: 'Facilities', labelKey: 'nav.facilities', icon: Building2, secondary: true },
          can(w, 'processor.analytics.view') && { href: '/reports', label: 'Reports', labelKey: 'nav.reports', icon: BarChart3, secondary: true },
          { href: '/organisation', label: 'Business & staff', icon: Landmark, secondary: true },
        ];
      case 'transporter': {
        const manager = can(w, 'transport.quote.manage');
        return [
          { href: '/app', label: 'Dashboard', icon: Gauge, mobile: true },
          manager && { href: '/transport/opportunities', label: 'Find jobs', labelKey: 'nav.opportunities', icon: PackageSearch, mobile: true },
          manager && { href: '/transport/quotes', label: 'Quotes', labelKey: 'nav.quotes', icon: FileText },
          { href: '/transport/jobs', label: 'Jobs', labelKey: 'nav.jobs', icon: Truck, mobile: true },
          can(w, 'transport.fleet.manage') && { href: '/transport/fleet', label: 'Fleet', labelKey: 'nav.fleet', icon: Wrench },
          can(w, 'transport.invoice.manage') && { href: '/invoices', label: 'Invoices', labelKey: 'nav.invoices', icon: Receipt, mobile: true },
          manager && { href: '/disputes', label: 'Disputes', labelKey: 'nav.disputes', icon: ShieldAlert },
          can(w, 'transport.org.manage') && { href: '/reports', label: 'Reports', labelKey: 'nav.reports', icon: BarChart3 },
          { href: '/organisation', label: 'Organisation & staff', labelKey: 'nav.organisation', icon: Landmark },
        ];
      }
      case 'cooperative':
        return [
          { href: '/app', label: 'Dashboard', icon: Gauge, mobile: true },
          { href: '/coop/members', label: 'Members', labelKey: 'nav.members', icon: Users, mobile: true },
          { href: '/bookings', label: 'Member bookings', labelKey: 'nav.bookings', icon: ClipboardCheck, mobile: true },
          { href: '/reports', label: 'Reports', labelKey: 'nav.reports', icon: BarChart3 },
          { href: '/organisation', label: 'Organisation & staff', labelKey: 'nav.organisation', icon: Landmark },
        ];
      case 'admin':
        return [
          { href: '/admin', label: 'Overview', icon: Gauge, mobile: true },
          { href: '/admin/organisations', label: 'Verification', icon: Building2, mobile: true },
          { href: '/admin/users', label: 'Users', icon: Users },
          { href: '/admin/incidents', label: 'Incidents', icon: ShieldAlert, mobile: true },
          { href: '/admin/disputes', label: 'Disputes', icon: Scale },
          { href: '/bookings', label: 'All bookings', icon: ClipboardCheck },
          { href: '/admin/policies', label: 'Policies', icon: Settings },
          { href: '/admin/crops', label: 'Crops', icon: Sprout },
          { href: '/admin/locations', label: 'Locations', icon: MapIcon },
          { href: '/admin/integrations', label: 'Integrations', icon: Wrench },
          { href: '/admin/outbox', label: 'Messages & webhooks', icon: Bell },
          { href: '/admin/audit', label: 'Audit log', icon: ScrollText },
          { href: '/admin/exports', label: 'Exports', icon: FileText },
          { href: '/admin/data-requests', label: 'Data requests', icon: KeyRound },
          { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
        ];
    }
  })();
  const out = items.filter((i): i is NavItem => Boolean(i));
  if (devTools) out.push({ href: '/dev/mailbox', label: 'Dev mailbox', icon: Inbox });
  return out;
}
