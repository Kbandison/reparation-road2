'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { adminNavItems } from '@/lib/constants';
import { ArrowLeft } from 'lucide-react';

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex w-[260px] flex-col bg-brand-card border-r border-brand-burgundy/20 fixed left-0 top-16 bottom-0">
      <nav className="flex-1 px-3 py-4 space-y-1">
        {adminNavItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-burgundy/10 text-brand-burgundy-light'
                  : 'text-brand-muted hover:text-brand-cream hover:bg-brand-card-hover'
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-brand-burgundy/10">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 px-3 py-2 text-sm text-brand-muted hover:text-brand-cream transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Platform
        </Link>
      </div>
    </aside>
  );
}
