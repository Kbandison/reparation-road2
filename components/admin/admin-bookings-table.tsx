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
} from 'lucide-react';
import { sessionTypes, availableTimeSlots } from '@/lib/constants';
import type { Booking } from '@/lib/types';

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function AdminBookingsTable() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleteBooking, setDeleteBooking] = useState<Booking | null>(null);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set('search', search);

    const res = await fetch(`/api/admin/bookings?${params}`);
    const data = await res.json();

    if (res.ok) {
      setBookings(data.bookings);
      setCount(data.count);
      setPageSize(data.pageSize);
    } else {
      toast.error(data.error || 'Failed to load bookings');
    }
    setLoading(false);
  }, [page, search]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const totalPages = Math.ceil(count / pageSize);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    fetchBookings();
  }

  function openNew() {
    setIsNew(true);
    setEditBooking({
      id: '',
      name: '',
      email: '',
      message: null,
      session_type: sessionTypes[0].id,
      date: '',
      time: availableTimeSlots[0],
      created_at: '',
    });
  }

  function openEdit(b: Booking) {
    setIsNew(false);
    setEditBooking({ ...b });
  }

  async function handleDelete() {
    if (!deleteBooking) return;
    const res = await fetch(`/api/admin/bookings?id=${deleteBooking.id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Booking deleted');
      setDeleteBooking(null);
      fetchBookings();
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
        <Button onClick={openNew} className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl">
          <Plus className="w-4 h-4 mr-2" />
          Add Booking
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-brand-gold/[0.08]">
              <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">Name</th>
              <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">Email</th>
              <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">Session</th>
              <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">Date</th>
              <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">Time</th>
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
            ) : bookings.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-brand-muted text-sm">
                  No bookings found
                </td>
              </tr>
            ) : (
              bookings.map((b) => (
                <tr
                  key={b.id}
                  className="border-b border-brand-gold/[0.04] hover:bg-brand-card-hover transition-colors cursor-pointer"
                  onClick={() => openEdit(b)}
                >
                  <td className="py-3 px-4 text-sm text-brand-cream">{b.name}</td>
                  <td className="py-3 px-4 text-sm text-brand-muted">{b.email}</td>
                  <td className="py-3 px-4 text-sm text-brand-cream capitalize">{b.session_type}</td>
                  <td className="py-3 px-4 text-sm text-brand-muted">{b.date ? formatDate(b.date) : '-'}</td>
                  <td className="py-3 px-4 text-sm text-brand-muted">{b.time}</td>
                  <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(b)}
                        className="p-1.5 rounded-lg hover:bg-brand-card text-brand-muted hover:text-brand-cream transition-colors"
                        title="Edit booking"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteBooking(b)}
                        className="p-1.5 rounded-lg hover:bg-brand-card text-brand-muted hover:text-brand-burgundy-light transition-colors"
                        title="Delete booking"
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
            Page {page} of {totalPages} ({count} bookings)
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
      {editBooking && (
        <BookingEditModal
          booking={editBooking}
          isNew={isNew}
          onClose={() => setEditBooking(null)}
          onSaved={() => {
            setEditBooking(null);
            fetchBookings();
          }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteBooking && (
        <DeleteConfirmModal
          booking={deleteBooking}
          onClose={() => setDeleteBooking(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

function BookingEditModal({
  booking,
  isNew,
  onClose,
  onSaved,
}: {
  booking: Booking;
  isNew: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: booking.name || '',
    email: booking.email || '',
    message: booking.message || '',
    session_type: booking.session_type || sessionTypes[0].id,
    date: booking.date || '',
    time: booking.time || availableTimeSlots[0],
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

    const method = isNew ? 'POST' : 'PATCH';
    const body = isNew
      ? form
      : { id: booking.id, ...form };

    const res = await fetch('/api/admin/bookings', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      toast.success(isNew ? 'Booking created' : 'Booking updated');
      onSaved();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Failed to save booking');
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-brand-bg border border-brand-gold/[0.12] rounded-2xl shadow-2xl w-full max-w-[500px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-brand-gold/[0.08]">
          <h2 className="font-display text-xl font-semibold text-brand-cream">
            {isNew ? 'Add Booking' : 'Edit Booking'}
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
              <Label htmlFor="booking-name">Name</Label>
              <Input
                id="booking-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="Client name"
                className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-email">Email</Label>
              <Input
                id="booking-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                placeholder="client@example.com"
                className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="booking-session">Session Type</Label>
            <select
              id="booking-session"
              value={form.session_type}
              onChange={(e) => setForm({ ...form, session_type: e.target.value })}
              className="w-full h-10 px-3 rounded-xl bg-brand-card border border-brand-gold/[0.15] text-sm text-brand-cream focus:border-brand-gold focus:outline-none"
            >
              {sessionTypes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.duration})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="booking-date">Date</Label>
              <Input
                id="booking-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
                className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-time">Time</Label>
              <select
                id="booking-time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-brand-card border border-brand-gold/[0.15] text-sm text-brand-cream focus:border-brand-gold focus:outline-none"
              >
                {availableTimeSlots.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="booking-message">Message</Label>
            <textarea
              id="booking-message"
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              rows={3}
              placeholder="Optional notes or message..."
              className="w-full px-3 py-2 rounded-xl bg-brand-card border border-brand-gold/[0.15] text-sm text-brand-cream focus:border-brand-gold focus:outline-none resize-none"
            />
          </div>

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
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : isNew ? 'Create Booking' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteConfirmModal({
  booking,
  onClose,
  onConfirm,
}: {
  booking: Booking;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  async function handleConfirm() {
    setConfirming(true);
    await onConfirm();
    setConfirming(false);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-brand-bg border border-brand-gold/[0.12] rounded-2xl shadow-2xl w-full max-w-[400px] p-6">
        <h2 className="font-display text-xl font-semibold text-brand-cream mb-2">Delete Booking</h2>
        <p className="text-sm text-brand-muted mb-6">
          Are you sure you want to delete the booking for{' '}
          <strong className="text-brand-cream">{booking.name}</strong> on {booking.date ? formatDate(booking.date) : 'unknown date'}?
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
