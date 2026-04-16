'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/publicacoes', label: 'Publicações' },
  { href: '/agenda', label: 'Agenda' },
  { href: '/pecas', label: 'Peças' },
  { href: '/processos', label: 'Processos' },
  { href: '/configuracoes', label: 'Configurações' },
];

export interface SidebarProps {
  userName: string;
}

export function Sidebar({ userName }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 flex-col bg-surface-container-low px-6 py-8">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-md bg-primary" aria-hidden />
        <span className="font-headline text-xl font-bold tracking-[-0.02em] text-on-surface">
          Placitum
        </span>
      </div>

      <nav className="mt-10 flex flex-col gap-1" aria-label="Navegação principal">
        {ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname?.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'rounded-md px-4 py-2.5 font-body text-sm transition',
                active
                  ? 'bg-surface-container-highest font-semibold text-on-surface'
                  : 'text-on-surface-variant hover:bg-surface-container',
              ].join(' ')}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-6">
        <p className="font-body text-xs font-medium uppercase tracking-[0.05em] text-on-surface-variant">
          Conta
        </p>
        <p className="mt-2 font-body text-sm font-medium text-on-surface">
          {userName}
        </p>
      </div>
    </aside>
  );
}
