'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, ChevronDown, FlaskConical, LogOut, Menu, Settings, UserRound } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { PERSONAS } from '@/app/(public)/demo-entry';
import { DemoBanner, OfflineBanner } from '@/components/domain/banners';
import { Logo } from '@/components/domain/logo';
import { LoadingState } from '@/components/domain/states';
import { Badge, Dialog, DialogContent, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/primitives';
import { useT } from '@/i18n';
import { post } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { navFor, type NavItem } from './nav';

const KIND_LABEL = { farmer: 'Farmer', processor: 'Processor', transporter: 'Transporter', cooperative: 'Cooperative', admin: 'Admin' } as const;

function isActive(pathname: string, href: string) {
  return href === '/app' || href === '/admin' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function WorkspaceSwitcher() {
  const { workspaces, workspace, setWorkspace } = useSession();
  const router = useRouter();
  if (!workspace) return null;
  if (workspaces.length < 2) {
    return (
      <span className="hidden min-w-0 truncate text-sm text-muted sm:inline">
        {KIND_LABEL[workspace.kind]} · {workspace.label}
      </span>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex min-w-0 items-center gap-1 rounded-lg border border-line px-2 py-1.5 text-sm hover:bg-leaf-50" aria-label="Switch workspace">
        <span className="truncate">
          <span className="text-muted">{KIND_LABEL[workspace.kind]} · </span>
          {workspace.label}
        </span>
        <ChevronDown className="size-4 shrink-0" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
        {workspaces.map((w) => (
          <DropdownMenuItem
            key={w.key}
            onSelect={() => {
              setWorkspace(w.key);
              router.push(w.kind === 'admin' ? '/admin' : '/app');
            }}
          >
            <span className="font-medium">{w.label}</span>
            <span className="ml-auto text-xs text-muted">{KIND_LABEL[w.kind]}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationBell() {
  const q = useApi<{ unread: number }>(['notifications', 'unread'], '/notifications/unread-count', { refetchInterval: 30_000 });
  const n = q.data?.unread ?? 0;
  return (
    <Link href="/notifications" className="relative rounded-lg p-2 hover:bg-leaf-50" aria-label={n ? `Notifications, ${n} unread` : 'Notifications'}>
      <Bell className="size-5" aria-hidden />
      {n ? <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-danger px-1 text-center text-[11px] font-bold leading-5 text-white">{n > 99 ? '99+' : n}</span> : null}
    </Link>
  );
}

/** Demo-only persona switching. The server refuses demo logins unless demonstration mode is permitted. */
function DemoSwitch() {
  const { config, refresh } = useSession();
  const router = useRouter();
  if (!config?.demoMode) return null;
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>
        <span className="inline-flex items-center gap-1">
          <FlaskConical className="size-3.5" aria-hidden /> Demo: switch persona
        </span>
      </DropdownMenuLabel>
      {PERSONAS.map((p) => (
        <DropdownMenuItem
          key={p.persona}
          onSelect={async () => {
            try {
              await post('/auth/demo-login', { persona: p.persona });
              await refresh();
              router.push(p.home);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Could not switch persona');
            }
          }}
        >
          {p.label}
        </DropdownMenuItem>
      ))}
    </>
  );
}

function UserMenu() {
  const { me, signOut } = useSession();
  const { t } = useT();
  if (!me) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1 rounded-lg p-2 hover:bg-leaf-50" aria-label="Account menu">
        <UserRound className="size-5" aria-hidden />
        <span className="hidden max-w-32 truncate text-sm md:inline">{me.user.displayName}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[80vh] overflow-y-auto">
        <DropdownMenuLabel>{me.user.email ?? me.user.phone ?? me.user.displayName}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="size-4" aria-hidden /> {t('nav.settings')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut className="size-4" aria-hidden /> {t('nav.signOut')}
        </DropdownMenuItem>
        <DemoSwitch />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavLinks({ items, pathname, onNavigate }: { items: NavItem[]; pathname: string; onNavigate?: () => void }) {
  const { t } = useT();
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium', active ? 'bg-forest text-white' : 'text-ink hover:bg-leaf-50')}
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              {item.labelKey ? t(item.labelKey) : item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { status, workspace, config, me } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { t, partial } = useT();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated' || status === 'mfa') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status !== 'authenticated' || !me) {
    return (
      <div className="mx-auto max-w-md p-8">
        <LoadingState label="Checking your session…" rows={1} />
      </div>
    );
  }

  const items = navFor(workspace, Boolean(config?.devTools));
  const mobileItems = items.filter((i) => i.mobile).slice(0, 4);

  return (
    <div className="flex min-h-dvh flex-col">
      <DemoBanner />
      <OfflineBanner />
      {partial ? (
        <div className="bg-info-50 px-4 py-1.5 text-xs text-info">Yorùbá translation is partial and awaiting review by a fluent speaker; untranslated text is shown in English.</div>
      ) : null}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
          <Link href={workspace?.kind === 'admin' ? '/admin' : '/app'} aria-label="HarvestSlot home" className="shrink-0">
            <Logo />
          </Link>
          <div className="min-w-0 flex-1">
            <WorkspaceSwitcher />
          </div>
          {me.user.isDemo ? <Badge tone="accent" className="hidden sm:inline-flex">Demo account</Badge> : null}
          <NotificationBell />
          <UserMenu />
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 pb-24 pt-4 md:pb-8">
        <nav aria-label="Main" className="sticky top-16 hidden h-[calc(100dvh-5rem)] w-56 shrink-0 overflow-y-auto md:block">
          <NavLinks items={items} pathname={pathname} />
        </nav>
        <main id="main" className="min-w-0 flex-1">
          {workspace ? (
            children
          ) : (
            <div className="rounded-xl border border-line bg-surface p-6 text-sm">
              <p className="font-semibold text-forest">Your account is not set up yet</p>
              <p className="mt-1 text-muted">You have no farmer profile or organisation membership. If you were invited by an organisation, open the invitation link from your email. Otherwise contact support.</p>
            </div>
          )}
        </main>
      </div>
      {/* Phone navigation: large targets, labels always visible. */}
      <nav aria-label="Quick" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface md:hidden">
        <ul className="mx-auto flex max-w-md">
          {mobileItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link href={item.href} aria-current={active ? 'page' : undefined} className={cn('flex flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-medium', active ? 'text-forest' : 'text-muted')}>
                  <Icon className={cn('size-6', active && 'text-forest')} aria-hidden />
                  <span className="truncate">{item.labelKey ? t(item.labelKey) : item.label}</span>
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button type="button" onClick={() => setMoreOpen(true)} className="flex w-full flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-medium text-muted">
              <Menu className="size-6" aria-hidden />
              {t('nav.more')}
            </button>
          </li>
        </ul>
      </nav>
      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent title="Menu">
          <NavLinks items={[...items, { href: '/notifications', label: 'Notifications', labelKey: 'nav.notifications', icon: Bell }, { href: '/settings', label: 'Settings', labelKey: 'nav.settings', icon: Settings }]} pathname={pathname} onNavigate={() => setMoreOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
