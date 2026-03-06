import Link from 'next/link';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Bookmark, CalendarDays, MessageSquare, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils/format';

export const metadata: Metadata = {
  title: 'Dashboard',
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name, email')
    .eq('id', user!.id)
    .single();

  const { count: bookmarkCount } = await supabase
    .from('bookmarks_unified')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user!.id);

  const { data: recentBookmarks } = await supabase
    .from('bookmarks_unified')
    .select('id, collection_slug, record_id, record_title, created_at')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(5);

  const today = new Date().toISOString().split('T')[0];
  const { data: upcomingBookings } = await supabase
    .from('bookings')
    .select('id, session_type, date, time')
    .eq('email', profile?.email || user!.email)
    .gte('date', today)
    .order('date')
    .limit(5);

  const { count: forumPostCount } = await supabase
    .from('forum_posts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user!.id);

  return (
    <>
      <PageHeader
        title={`Welcome back, ${profile?.first_name || 'Researcher'}`}
        description="Your research hub — bookmarks, upcoming sessions, and community activity."
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-10">
        <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6">
          <Bookmark className="w-5 h-5 text-brand-gold mb-3" />
          <p className="font-display text-2xl font-semibold text-brand-cream">{bookmarkCount || 0}</p>
          <p className="text-sm text-brand-muted">Bookmarks</p>
        </div>
        <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6">
          <CalendarDays className="w-5 h-5 text-brand-sage mb-3" />
          <p className="font-display text-2xl font-semibold text-brand-cream">{upcomingBookings?.length || 0}</p>
          <p className="text-sm text-brand-muted">Upcoming Bookings</p>
        </div>
        <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6">
          <MessageSquare className="w-5 h-5 text-brand-burgundy-light mb-3" />
          <p className="font-display text-2xl font-semibold text-brand-cream">{forumPostCount || 0}</p>
          <p className="text-sm text-brand-muted">Forum Posts</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Bookmarks */}
        <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold text-brand-cream">Recent Bookmarks</h2>
            <Link href="/dashboard/bookmarks" className="text-xs text-brand-gold hover:text-brand-gold-light">
              View all
            </Link>
          </div>
          {recentBookmarks && recentBookmarks.length > 0 ? (
            <ul className="space-y-3">
              {recentBookmarks.map((bm) => (
                <li key={bm.id}>
                  <Link
                    href={`/collection/${bm.collection_slug}/${bm.record_id}`}
                    className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-brand-card-hover transition-colors group"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-brand-cream truncate">{bm.record_title || 'Untitled Record'}</p>
                      <p className="text-xs text-brand-muted">{bm.collection_slug}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-brand-muted group-hover:text-brand-gold flex-shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-brand-muted py-4 text-center">
              No bookmarks yet. Start exploring the{' '}
              <Link href="/collection" className="text-brand-gold">collection</Link>.
            </p>
          )}
        </div>

        {/* Upcoming Bookings */}
        <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold text-brand-cream">Upcoming Bookings</h2>
            <Link href="/booking" className="text-xs text-brand-gold hover:text-brand-gold-light">
              Book a session
            </Link>
          </div>
          {upcomingBookings && upcomingBookings.length > 0 ? (
            <ul className="space-y-3">
              {upcomingBookings.map((booking) => (
                <li key={booking.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-brand-card-hover/50">
                  <div>
                    <p className="text-sm text-brand-cream">{booking.session_type}</p>
                    <p className="text-xs text-brand-muted">
                      {formatDate(booking.date)} at {booking.time}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-brand-muted mb-3">No upcoming sessions</p>
              <Link href="/booking">
                <Button size="sm" className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl">
                  Book a Session
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
