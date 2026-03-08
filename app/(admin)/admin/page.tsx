import type { Metadata } from 'next';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/shared/page-header';
import { formatDate } from '@/lib/utils/format';
import {
  Users,
  CalendarDays,
  MessageSquare,
  Library,
  Crown,
  UserPlus,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';

export const metadata: Metadata = { title: 'Admin Dashboard' };

export default async function AdminDashboardPage() {
  const supabase = createAdminClient();

  const [
    { count: userCount },
    { count: premiumCount },
    { count: adminCount },
    { count: bookingCount },
    { count: threadCount },
    { count: postCount },
    { count: collectionCount },
    { data: recentUsers },
    { data: recentBookings },
    { data: recentThreads },
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('subscription_status', 'paid'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin'),
    supabase.from('bookings').select('id', { count: 'exact', head: true }),
    supabase.from('forum_threads').select('id', { count: 'exact', head: true }),
    supabase.from('forum_posts').select('id', { count: 'exact', head: true }),
    supabase.from('collections').select('id', { count: 'exact', head: true }),
    supabase
      .from('profiles')
      .select('id, first_name, last_name, email, subscription_status, role, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('bookings')
      .select('id, name, email, session_type, date, time, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('forum_threads')
      .select('id, title, slug, created_at, profiles(first_name, last_name)')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const stats = [
    { label: 'Total Users', count: userCount || 0, icon: Users, color: 'text-brand-gold', href: '/admin/users' },
    { label: 'Premium Members', count: premiumCount || 0, icon: Crown, color: 'text-brand-gold-light', href: '/admin/users' },
    { label: 'Bookings', count: bookingCount || 0, icon: CalendarDays, color: 'text-brand-sage', href: '/admin/bookings' },
    { label: 'Forum Threads', count: threadCount || 0, icon: MessageSquare, color: 'text-brand-burgundy-light', href: '/admin/forum' },
    { label: 'Forum Posts', count: postCount || 0, icon: TrendingUp, color: 'text-brand-cream', href: '/admin/forum' },
    { label: 'Collections', count: collectionCount || 0, icon: Library, color: 'text-brand-sage', href: '/admin/collections' },
  ];

  const freeCount = (userCount || 0) - (premiumCount || 0);

  return (
    <>
      <PageHeader eyebrow="Admin" title="Dashboard" />

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-5 hover:border-brand-gold/[0.2] transition-colors group"
          >
            <stat.icon className={`w-5 h-5 ${stat.color} mb-2`} />
            <p className="font-display text-2xl font-semibold text-brand-cream">{stat.count}</p>
            <p className="text-xs text-brand-muted group-hover:text-brand-cream transition-colors">{stat.label}</p>
          </Link>
        ))}
      </div>

      {/* Membership breakdown */}
      <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6 mb-8">
        <h3 className="font-display text-lg font-semibold text-brand-cream mb-4">Membership Breakdown</h3>
        <div className="flex items-center gap-4 mb-3">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-brand-muted">Free</span>
              <span className="text-sm text-brand-cream">{freeCount}</span>
            </div>
            <div className="h-2 bg-brand-bg rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-muted/40 rounded-full transition-all"
                style={{ width: userCount ? `${(freeCount / userCount) * 100}%` : '0%' }}
              />
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-brand-muted">Premium</span>
              <span className="text-sm text-brand-gold">{premiumCount || 0}</span>
            </div>
            <div className="h-2 bg-brand-bg rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-gold rounded-full transition-all"
                style={{ width: userCount ? `${((premiumCount || 0) / userCount) * 100}%` : '0%' }}
              />
            </div>
          </div>
          <div className="w-20 text-center">
            <p className="text-xs text-brand-muted">Admins</p>
            <p className="text-lg font-semibold text-brand-burgundy-light">{adminCount || 0}</p>
          </div>
        </div>
      </div>

      {/* Recent activity panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Users */}
        <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-semibold text-brand-cream flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-brand-gold" />
              Recent Users
            </h3>
            <Link href="/admin/users" className="text-xs text-brand-gold hover:text-brand-gold-light flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {(recentUsers || []).map((u) => (
              <div key={u.id} className="flex items-center justify-between py-2 border-b border-brand-gold/[0.04] last:border-0">
                <div>
                  <p className="text-sm text-brand-cream">
                    {(`${u.first_name || ''} ${u.last_name || ''}`).trim() || u.email?.split('@')[0]}
                  </p>
                  <p className="text-xs text-brand-muted">{u.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {u.role === 'admin' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-burgundy/10 text-brand-burgundy-light">
                      Admin
                    </span>
                  )}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    u.subscription_status === 'paid'
                      ? 'bg-brand-gold/10 text-brand-gold'
                      : 'bg-brand-muted/10 text-brand-muted'
                  }`}>
                    {u.subscription_status === 'paid' ? 'Premium' : 'Free'}
                  </span>
                  <span className="text-[10px] text-brand-muted">{formatDate(u.created_at)}</span>
                </div>
              </div>
            ))}
            {(!recentUsers || recentUsers.length === 0) && (
              <p className="text-sm text-brand-muted text-center py-4">No users yet</p>
            )}
          </div>
        </div>

        {/* Recent Bookings */}
        <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-semibold text-brand-cream flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-brand-sage" />
              Recent Bookings
            </h3>
            <Link href="/admin/bookings" className="text-xs text-brand-gold hover:text-brand-gold-light flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {(recentBookings || []).map((b) => (
              <div key={b.id} className="flex items-center justify-between py-2 border-b border-brand-gold/[0.04] last:border-0">
                <div>
                  <p className="text-sm text-brand-cream">{b.name}</p>
                  <p className="text-xs text-brand-muted">{b.session_type}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-brand-cream">{formatDate(b.date)}</p>
                  <p className="text-xs text-brand-muted">{b.time}</p>
                </div>
              </div>
            ))}
            {(!recentBookings || recentBookings.length === 0) && (
              <p className="text-sm text-brand-muted text-center py-4">No bookings yet</p>
            )}
          </div>
        </div>

        {/* Recent Forum Threads */}
        <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-semibold text-brand-cream flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-brand-burgundy-light" />
              Recent Forum Activity
            </h3>
            <Link href="/admin/forum" className="text-xs text-brand-gold hover:text-brand-gold-light flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {(recentThreads || []).map((t: any) => (
              <div key={t.id} className="flex items-center justify-between py-2 border-b border-brand-gold/[0.04] last:border-0">
                <div>
                  <p className="text-sm text-brand-cream">{t.title}</p>
                  <p className="text-xs text-brand-muted">
                    by {(`${t.profiles?.first_name || ''} ${t.profiles?.last_name || ''}`).trim() || 'Unknown'}
                  </p>
                </div>
                <span className="text-xs text-brand-muted">{formatDate(t.created_at)}</span>
              </div>
            ))}
            {(!recentThreads || recentThreads.length === 0) && (
              <p className="text-sm text-brand-muted text-center py-4">No forum threads yet</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
