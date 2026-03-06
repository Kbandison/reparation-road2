import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Users, CalendarDays, MessageSquare, Library } from 'lucide-react';

export const metadata: Metadata = { title: 'Admin Dashboard' };

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const [
    { count: userCount },
    { count: bookingCount },
    { count: threadCount },
    { count: collectionCount },
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('bookings').select('id', { count: 'exact', head: true }),
    supabase.from('forum_threads').select('id', { count: 'exact', head: true }),
    supabase.from('collections').select('id', { count: 'exact', head: true }),
  ]);

  const stats = [
    { label: 'Total Users', count: userCount || 0, icon: Users, color: 'text-brand-gold' },
    { label: 'Total Bookings', count: bookingCount || 0, icon: CalendarDays, color: 'text-brand-sage' },
    { label: 'Forum Threads', count: threadCount || 0, icon: MessageSquare, color: 'text-brand-burgundy-light' },
    { label: 'Collections', count: collectionCount || 0, icon: Library, color: 'text-brand-gold-light' },
  ];

  return (
    <>
      <PageHeader eyebrow="Admin" title="Dashboard" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6">
            <stat.icon className={`w-5 h-5 ${stat.color} mb-3`} />
            <p className="font-display text-2xl font-semibold text-brand-cream">{stat.count}</p>
            <p className="text-sm text-brand-muted">{stat.label}</p>
          </div>
        ))}
      </div>
    </>
  );
}
