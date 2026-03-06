import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { formatDate } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Admin — Users' };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page || '1');
  const pageSize = 25;
  const supabase = await createClient();

  const { data: profiles, count } = await supabase
    .from('profiles')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  return (
    <>
      <PageHeader eyebrow="Admin" title="Users" description={`${count || 0} total users`} />

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-brand-gold/[0.08]">
              <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">Name</th>
              <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">Email</th>
              <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">Status</th>
              <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">Role</th>
              <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">Joined</th>
            </tr>
          </thead>
          <tbody>
            {(profiles || []).map((p) => (
              <tr key={p.id} className="border-b border-brand-gold/[0.04] hover:bg-brand-card-hover transition-colors">
                <td className="py-3 px-4 text-sm text-brand-cream">
                  {(`${p.first_name || ''} ${p.last_name || ''}`).trim() || p.email?.split('@')[0] || 'Unknown'}
                </td>
                <td className="py-3 px-4 text-sm text-brand-muted">{p.email}</td>
                <td className="py-3 px-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${p.subscription_status === 'paid' ? 'bg-brand-gold/10 text-brand-gold' : 'bg-brand-muted/10 text-brand-muted'}`}>
                    {p.subscription_status === 'paid' ? 'Premium' : 'Free'}
                  </span>
                </td>
                <td className="py-3 px-4 text-sm text-brand-muted capitalize">{p.role}</td>
                <td className="py-3 px-4 text-sm text-brand-muted">{formatDate(p.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
