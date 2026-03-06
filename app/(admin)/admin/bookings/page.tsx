import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { formatDate } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Admin — Bookings' };

export default async function AdminBookingsPage() {
  const supabase = await createClient();

  const { data: bookings } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <>
      <PageHeader eyebrow="Admin" title="Bookings" />

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-brand-gold/[0.08]">
              <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">Name</th>
              <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">Email</th>
              <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">Session</th>
              <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">Date</th>
              <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">Time</th>
            </tr>
          </thead>
          <tbody>
            {(bookings || []).map((b) => (
              <tr key={b.id} className="border-b border-brand-gold/[0.04] hover:bg-brand-card-hover transition-colors">
                <td className="py-3 px-4 text-sm text-brand-cream">{b.name}</td>
                <td className="py-3 px-4 text-sm text-brand-muted">{b.email}</td>
                <td className="py-3 px-4 text-sm text-brand-cream">{b.session_type}</td>
                <td className="py-3 px-4 text-sm text-brand-muted">{formatDate(b.date)}</td>
                <td className="py-3 px-4 text-sm text-brand-muted">{b.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
