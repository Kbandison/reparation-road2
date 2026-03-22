'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Shield,
  ShieldOff,
  Crown,
  UserMinus,
} from 'lucide-react';
import type { Profile } from '@/lib/types';

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function AdminUsersTable() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [editUser, setEditUser] = useState<Profile | null>(null);
  const [isNewUser, setIsNewUser] = useState(false);
  const [deleteUser, setDeleteUser] = useState<Profile | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set('search', search);

    const res = await fetch(`/api/admin/users?${params}`);
    const data = await res.json();

    if (res.ok) {
      setProfiles(data.profiles);
      setCount(data.count);
      setPageSize(data.pageSize);
    } else {
      toast.error(data.error || 'Failed to load users');
    }
    setLoading(false);
  }, [page, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const totalPages = Math.ceil(count / pageSize);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  }

  function openNewUser() {
    setIsNewUser(true);
    setEditUser({
      id: '',
      email: '',
      first_name: '',
      last_name: '',
      subscription_status: 'free',
      role: 'user',
      stripe_customer_id: null,
      stripe_subscription_id: null,
      subscription_interval: null,
      subscription_period_start: null,
      subscription_period_end: null,
      subscription_cancel_at_period_end: false,
      created_at: '',
      updated_at: '',
    });
  }

  function openEditUser(p: Profile) {
    setIsNewUser(false);
    setEditUser({ ...p });
  }

  async function handleQuickAction(userId: string, field: string, value: string) {
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: userId, [field]: value }),
    });

    if (res.ok) {
      toast.success(`User updated`);
      fetchUsers();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Update failed');
    }
  }

  async function handleDelete() {
    if (!deleteUser) return;

    const res = await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: deleteUser.id }),
    });

    if (res.ok) {
      toast.success('User deleted');
      setDeleteUser(null);
      fetchUsers();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Delete failed');
    }
  }

  return (
    <div>
      {/* Search + Add */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
            />
          </div>
          <Button type="submit" variant="outline" className="border-brand-gold/20 text-brand-cream">
            Search
          </Button>
        </form>
        <Button onClick={openNewUser} className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl">
          <Plus className="w-4 h-4 mr-2" />
          Add User
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-brand-gold/[0.08]">
              <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">Name</th>
              <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">Email</th>
              <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">Membership</th>
              <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">Role</th>
              <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">Joined</th>
              <th className="text-right py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-brand-muted">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                </td>
              </tr>
            ) : profiles.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-brand-muted text-sm">
                  No users found
                </td>
              </tr>
            ) : (
              profiles.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-brand-gold/[0.04] hover:bg-brand-card-hover transition-colors"
                >
                  <td className="py-3 px-4 text-sm text-brand-cream">
                    {(`${p.first_name || ''} ${p.last_name || ''}`).trim() || 'No name'}
                  </td>
                  <td className="py-3 px-4 text-sm text-brand-muted">{p.email}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                        p.subscription_status === 'paid'
                          ? 'bg-brand-gold/10 text-brand-gold hover:bg-brand-gold/20'
                          : p.subscription_status === 'donor'
                          ? 'bg-brand-sage/10 text-brand-sage hover:bg-brand-sage/20'
                          : 'bg-brand-muted/10 text-brand-muted hover:bg-brand-muted/20'
                      }`}
                      title="Click to cycle: Free → Paid → Donor → Free"
                      onClick={() => {
                        const cycle = { free: 'paid', paid: 'donor', donor: 'free' } as const;
                        const next = cycle[p.subscription_status as keyof typeof cycle] || 'free';
                        handleQuickAction(p.id, 'subscription_status', next);
                      }}
                    >
                      {p.subscription_status === 'paid' ? (
                        <span className="flex items-center gap-1">
                          <Crown className="w-3 h-3" /> Premium
                        </span>
                      ) : p.subscription_status === 'donor' ? (
                        <span className="flex items-center gap-1">
                          <Crown className="w-3 h-3" /> Donor
                        </span>
                      ) : (
                        'Free'
                      )}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                        p.role === 'admin'
                          ? 'bg-brand-burgundy/10 text-brand-burgundy-light hover:bg-brand-burgundy/20'
                          : 'bg-brand-muted/10 text-brand-muted hover:bg-brand-muted/20'
                      }`}
                      title={`Click to ${p.role === 'admin' ? 'remove admin' : 'make admin'}`}
                      onClick={() =>
                        handleQuickAction(p.id, 'role', p.role === 'admin' ? 'user' : 'admin')
                      }
                    >
                      {p.role === 'admin' ? (
                        <span className="flex items-center gap-1">
                          <Shield className="w-3 h-3" /> Admin
                        </span>
                      ) : (
                        'User'
                      )}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-brand-muted">
                    {p.created_at ? formatDate(p.created_at) : '-'}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEditUser(p)}
                        className="p-1.5 rounded-lg hover:bg-brand-card text-brand-muted hover:text-brand-cream transition-colors"
                        title="Edit user"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteUser(p)}
                        className="p-1.5 rounded-lg hover:bg-brand-card text-brand-muted hover:text-brand-burgundy-light transition-colors"
                        title="Delete user"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-brand-gold/[0.08]">
          <p className="text-xs text-brand-muted">
            Page {page} of {totalPages} ({count} users)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="border-brand-gold/20 text-brand-cream"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="border-brand-gold/20 text-brand-cream"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Edit/Add Modal */}
      {editUser && (
        <UserEditModal
          user={editUser}
          isNew={isNewUser}
          onClose={() => setEditUser(null)}
          onSaved={() => {
            setEditUser(null);
            fetchUsers();
          }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteUser && (
        <DeleteConfirmModal
          user={deleteUser}
          onClose={() => setDeleteUser(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

function UserEditModal({
  user,
  isNew,
  onClose,
  onSaved,
}: {
  user: Profile;
  isNew: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    email: user.email || '',
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    role: user.role || 'user',
    subscription_status: user.subscription_status || 'free',
    password: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    if (isNew) {
      if (!form.password || form.password.length < 8) {
        toast.error('Password must be at least 8 characters');
        setSaving(false);
        return;
      }

      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          first_name: form.first_name,
          last_name: form.last_name,
          role: form.role,
          subscription_status: form.subscription_status,
        }),
      });

      if (res.ok) {
        toast.success('User created');
        onSaved();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to create user');
      }
    } else {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: user.id,
          email: form.email !== user.email ? form.email : undefined,
          first_name: form.first_name,
          last_name: form.last_name,
          role: form.role,
          subscription_status: form.subscription_status,
        }),
      });

      if (res.ok) {
        toast.success('User updated');
        onSaved();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to update user');
      }
    }

    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-brand-bg border border-brand-gold/[0.12] rounded-2xl shadow-2xl w-full max-w-[500px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-brand-gold/[0.08]">
          <h2 className="font-display text-xl font-semibold text-brand-cream">
            {isNew ? 'Add User' : 'Edit User'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-brand-card transition-colors text-brand-muted hover:text-brand-cream"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-first-name">First Name</Label>
              <Input
                id="edit-first-name"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                placeholder="First name"
                className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-last-name">Last Name</Label>
              <Input
                id="edit-last-name"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                placeholder="Last name"
                className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              placeholder="user@example.com"
              className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
            />
          </div>

          {isNew && (
            <div className="space-y-2">
              <Label htmlFor="edit-password">Password</Label>
              <Input
                id="edit-password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={8}
                placeholder="Minimum 8 characters"
                className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Role</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, role: 'user' })}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm border transition-colors ${
                    form.role === 'user'
                      ? 'border-brand-gold bg-brand-gold/10 text-brand-gold'
                      : 'border-brand-gold/[0.15] text-brand-muted hover:text-brand-cream'
                  }`}
                >
                  <UserMinus className="w-3.5 h-3.5" />
                  User
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, role: 'admin' })}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm border transition-colors ${
                    form.role === 'admin'
                      ? 'border-brand-burgundy-light bg-brand-burgundy/10 text-brand-burgundy-light'
                      : 'border-brand-gold/[0.15] text-brand-muted hover:text-brand-cream'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  Admin
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Membership</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, subscription_status: 'free' })}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm border transition-colors ${
                    form.subscription_status === 'free'
                      ? 'border-brand-gold bg-brand-gold/10 text-brand-gold'
                      : 'border-brand-gold/[0.15] text-brand-muted hover:text-brand-cream'
                  }`}
                >
                  Free
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, subscription_status: 'paid' })}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm border transition-colors ${
                    form.subscription_status === 'paid'
                      ? 'border-brand-gold bg-brand-gold/10 text-brand-gold'
                      : 'border-brand-gold/[0.15] text-brand-muted hover:text-brand-cream'
                  }`}
                >
                  <Crown className="w-3.5 h-3.5" />
                  Premium
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, subscription_status: 'donor' })}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm border transition-colors ${
                    form.subscription_status === 'donor'
                      ? 'border-brand-sage bg-brand-sage/10 text-brand-sage'
                      : 'border-brand-gold/[0.15] text-brand-muted hover:text-brand-cream'
                  }`}
                >
                  <Crown className="w-3.5 h-3.5" />
                  Donor
                </button>
              </div>
            </div>
          </div>

          {!isNew && user.stripe_subscription_id && (
            <div className="bg-brand-card rounded-xl p-3 border border-brand-gold/[0.08]">
              <p className="text-xs text-brand-muted mb-1">Stripe Subscription</p>
              <p className="text-sm text-brand-cream font-mono truncate">{user.stripe_subscription_id}</p>
              {user.subscription_interval && (
                <p className="text-xs text-brand-muted mt-1">
                  {user.subscription_interval === 'year' ? 'Yearly' : 'Monthly'} plan
                  {user.subscription_cancel_at_period_end && ' (cancels at period end)'}
                </p>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 border-brand-gold/20 text-brand-cream rounded-xl"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="flex-1 bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : isNew ? 'Create User' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteConfirmModal({
  user,
  onClose,
  onConfirm,
}: {
  user: Profile;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const displayName = (`${user.first_name || ''} ${user.last_name || ''}`).trim() || user.email;

  async function handleConfirm() {
    setConfirming(true);
    await onConfirm();
    setConfirming(false);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-brand-bg border border-brand-gold/[0.12] rounded-2xl shadow-2xl w-full max-w-[400px] p-6">
        <h2 className="font-display text-xl font-semibold text-brand-cream mb-2">Delete User</h2>
        <p className="text-sm text-brand-muted mb-6">
          Are you sure you want to permanently delete{' '}
          <strong className="text-brand-cream">{displayName}</strong>? This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 border-brand-gold/20 text-brand-cream rounded-xl"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={confirming}
            className="flex-1 bg-red-600 text-white hover:bg-red-700 rounded-xl"
          >
            {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
          </Button>
        </div>
      </div>
    </div>
  );
}
