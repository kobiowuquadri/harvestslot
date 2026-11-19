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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

function WorkspaceAvatar({ label }: { label: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-leaf-50 font-display text-xs font-semibold text-ink ring-1 ring-inset ring-leaf-100" aria-hidden>
      {initials(label) || '•'}
    </span>
  );
}

function isActive(pathname: string, href: string) {
  return href === '/app' || href === '/admin' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function WorkspaceSwitcher() {
  const { workspaces, workspace, setWorkspace } = useSession();
  const router = useRouter();
  if (!workspace) return null;
  if (workspaces.length < 2) {
    return (
      <span className="hidden min-w-0 items-center gap-2 text-sm sm:inline-flex">
        <WorkspaceAvatar label={workspace.label} />
        <span className="min-w-0 truncate font-medium text-ink">{workspace.label}</span>
        <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted ring-1 ring-inset ring-line">{KIND_LABEL[workspace.kind]}</span>
      </span>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex min-w-0 items-center gap-2 rounded-2xl border border-line bg-surface py-1.5 pl-1.5 pr-2.5 text-sm shadow-[0_1px_2px_rgb(16_24_40/0.05)] transition-colors hover:bg-canvas" aria-label="Switch workspace">
        <WorkspaceAvatar label={workspace.label} />
        <span className="min-w-0 truncate text-left">
          <span className="block truncate font-medium leading-tight text-ink">{workspace.label}</span>
          <span className="block text-[11px] leading-tight text-muted">{KIND_LABEL[workspace.kind]}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
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
    <Link href="/notifications" className="relative rounded-full p-2.5 text-muted transition-colors hover:bg-canvas hover:text-ink" aria-label={n ? `Notifications, ${n} unread` : 'Notifications'}>
      <Bell className="size-5" aria-hidden />
      {n ? <span className="absolute right-0.5 top-0.5 min-w-[18px] rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-[18px] text-white ring-2 ring-surface">{n > 99 ? '99+' : n}</span> : null}
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
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-canvas md:pr-3" aria-label="Account menu">
        <span className="flex size-8 items-center justify-center rounded-full bg-ink font-display text-xs font-semibold text-white" aria-hidden>
          {initials(me.user.displayName) || <UserRound className="size-4" />}
        </span>
        <span className="hidden max-w-32 truncate text-sm font-medium text-ink md:inline">{me.user.displayName}</span>
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
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                active ? 'bg-surface font-semibold text-ink shadow-[var(--shadow-card)] ring-1 ring-line' : 'font-medium text-muted hover:bg-surface/70 hover:text-ink',
              )}
            >
              <Icon className={cn('size-[18px] shrink-0', active ? 'text-forest' : 'text-muted')} aria-hidden />
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
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4 sm:px-6">
          <Link href={workspace?.kind === 'admin' ? '/admin' : '/app'} aria-label="HarvestSlot home" className="shrink-0">
            <Logo />
          </Link>
          <span className="hidden h-6 w-px bg-line sm:block" aria-hidden />
          <div className="min-w-0 flex-1">
            <WorkspaceSwitcher />
          </div>
          {me.user.isDemo ? <Badge tone="accent" className="hidden sm:inline-flex">Demo account</Badge> : null}
          <NotificationBell />
          <UserMenu />
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 gap-8 px-4 pb-28 pt-6 sm:px-6 md:pb-12">
        <nav aria-label="Main" className="sticky top-[5.5rem] hidden h-[calc(100dvh-7rem)] w-60 shrink-0 overflow-y-auto md:block">
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">{workspace ? KIND_LABEL[workspace.kind] : 'Menu'}</p>
          <NavLinks items={items.filter((i) => !i.secondary)} pathname={pathname} />
          {items.some((i) => i.secondary) ? (
            <>
              <p className="mb-2 mt-6 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">More</p>
              <NavLinks items={items.filter((i) => i.secondary)} pathname={pathname} />
            </>
          ) : null}
        </nav>
        <main id="main" className="min-w-0 flex-1">
          {workspace ? (
            children
          ) : (
            <div className="rounded-2xl border border-line bg-surface p-6 text-sm">
              <p className="font-display font-semibold text-ink">Your account is not set up yet</p>
              <p className="mt-1 text-muted">You have no farmer profile or organisation membership. If you were invited by an organisation, open the invitation link from your email. Otherwise contact support.</p>
            </div>
          )}
        </main>
      </div>
      {/* Phone navigation: large targets, labels always visible. */}
      <nav aria-label="Quick" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <ul className="mx-auto flex max-w-md">
          {mobileItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link href={item.href} aria-current={active ? 'page' : undefined} className={cn('relative flex flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-[11px] font-medium', active ? 'text-forest' : 'text-muted')}>
                  {active ? <span className="absolute top-0 h-0.5 w-8 rounded-full bg-forest" aria-hidden /> : null}
                  <Icon className="size-[22px]" aria-hidden />
                  <span className="truncate">{item.labelKey ? t(item.labelKey) : item.label}</span>
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button type="button" onClick={() => setMoreOpen(true)} className="flex w-full flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-[11px] font-medium text-muted">
              <Menu className="size-[22px]" aria-hidden />
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
