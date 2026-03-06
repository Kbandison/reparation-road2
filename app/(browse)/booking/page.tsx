'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/contexts/user-context';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { availableTimeSlots } from '@/lib/constants';
import { toast } from 'sonner';
import { Loader2, CheckCircle, BookOpen, Users, Check } from 'lucide-react';

const sessionOptions = [
  {
    id: 'standard-research',
    name: 'Standard Research Package',
    description: 'Get step-by-step guidance on how to use the Reparation Road Library and resources for independent research. This session does not include personal ancestry research.',
    features: [
      'Personalized walkthrough of the site',
      'Tips for using research tools',
      'Best practices for self-guided searches',
    ],
    icon: BookOpen,
  },
  {
    id: 'genealogy-consultation',
    name: 'Genealogy Consultation',
    description: 'Book a 1-on-1 session to trace your family roots. Receive hands-on help, expert insight, and recommendations for ancestry and historical research.',
    features: [
      '1-on-1 consultation with Adam Jacoby Paul',
      'Assistance tracing family history',
      'Advice on public/private record access',
    ],
    icon: Users,
  },
];

export default function BookingPage() {
  const { profile } = useUser();
  const router = useRouter();
  const [selectedSession, setSelectedSession] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [bookedSlots, setBookedSlots] = useState<{ date: string; time: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const selectedSessionData = sessionOptions.find((s) => s.id === selectedSession);

  useEffect(() => {
    if (profile) {
      setName(`${profile.first_name || ''} ${profile.last_name || ''}`.trim());
      setEmail(profile.email);
    }
  }, [profile]);

  useEffect(() => {
    const supabase = createClient();
    const today = new Date().toISOString().split('T')[0];
    supabase
      .from('bookings')
      .select('date, time')
      .gte('date', today)
      .then(({ data }) => setBookedSlots(data || []));
  }, []);

  const dateStr = selectedDate?.toISOString().split('T')[0] || '';
  const takenTimes = bookedSlots
    .filter((s) => s.date === dateStr)
    .map((s) => s.time);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSession || !selectedDate || !selectedTime) return;

    setLoading(true);
    const supabase = createClient();

    const { error } = await supabase.from('bookings').insert({
      name,
      email,
      message: message || null,
      session_type: selectedSessionData?.name || selectedSession,
      date: dateStr,
      time: selectedTime,
    });

    if (error) {
      toast.error('Failed to book session');
      setLoading(false);
      return;
    }

    await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'booking',
        name,
        email,
        sessionType: selectedSessionData?.name,
        date: dateStr,
        time: selectedTime,
      }),
    });

    setSuccess(true);
    setLoading(false);
  }

  if (success) {
    return (
      <>
        <PageHeader eyebrow="Booking" title="Session Booked!" />
        <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-8 text-center max-w-lg mx-auto">
          <CheckCircle className="w-12 h-12 text-brand-sage mx-auto mb-4" />
          <h2 className="font-display text-xl font-semibold text-brand-cream mb-2">
            You&apos;re All Set
          </h2>
          <p className="text-sm text-brand-muted mb-2">
            <strong className="text-brand-cream">{selectedSessionData?.name}</strong>
          </p>
          <p className="text-sm text-brand-muted mb-6">
            {dateStr} at {selectedTime}
          </p>
          <p className="text-xs text-brand-muted mb-6">
            A confirmation email has been sent to {email}.
          </p>
          <Button
            onClick={() => router.push('/')}
            className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
          >
            Back to Home
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Booking"
        title="Book a Session"
        description="All sessions are free. Choose a package and pick a time that works for you."
      />

      <div className="max-w-4xl mx-auto space-y-10">
        {/* Session selection */}
        <div>
          <h2 className="font-display text-lg font-semibold text-brand-cream mb-4">Choose Your Session</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {sessionOptions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => setSelectedSession(session.id)}
                className={`text-left p-6 rounded-2xl border transition-all ${
                  selectedSession === session.id
                    ? 'border-brand-gold bg-brand-gold/5 shadow-[0_0_30px_rgba(200,149,108,0.06)]'
                    : 'border-brand-gold/[0.08] bg-brand-card hover:border-brand-gold/25'
                }`}
              >
                <session.icon className={`w-8 h-8 mb-4 ${
                  selectedSession === session.id ? 'text-brand-gold' : 'text-brand-muted'
                }`} />
                <h3 className="font-display text-base font-semibold text-brand-cream mb-2">
                  {session.name}
                </h3>
                <p className="text-sm text-brand-muted leading-relaxed mb-4">
                  {session.description}
                </p>
                <ul className="space-y-2">
                  {session.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-brand-muted">
                      <Check className="w-4 h-4 text-brand-gold mt-0.5 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
        </div>

        {/* Date & Time */}
        {selectedSession && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h2 className="font-display text-lg font-semibold text-brand-cream mb-4">Select Date</h2>
              <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-4 inline-block">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={(date) => date < new Date()}
                  className="text-brand-cream"
                />
              </div>
            </div>

            {selectedDate && (
              <div>
                <h2 className="font-display text-lg font-semibold text-brand-cream mb-4">Select Time</h2>
                <div className="grid grid-cols-2 gap-2">
                  {availableTimeSlots.map((time) => {
                    const isTaken = takenTimes.includes(time);
                    return (
                      <button
                        key={time}
                        type="button"
                        disabled={isTaken}
                        onClick={() => setSelectedTime(time)}
                        className={`px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                          selectedTime === time
                            ? 'bg-brand-gold text-brand-bg'
                            : isTaken
                            ? 'bg-brand-card-hover text-brand-muted/50 cursor-not-allowed line-through'
                            : 'bg-brand-card border border-brand-gold/[0.08] text-brand-cream hover:border-brand-gold/25'
                        }`}
                      >
                        {time}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Contact form */}
        {selectedSession && selectedDate && selectedTime && (
          <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto">
            <h2 className="font-display text-lg font-semibold text-brand-cream">Your Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Message / Notes (optional)</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="Any specific topics or questions for your session..."
                className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold resize-none"
              />
            </div>

            {/* Summary */}
            <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-5">
              <h3 className="font-display text-sm font-semibold text-brand-cream mb-3">Booking Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-brand-muted">Session</span>
                  <span className="text-brand-cream">{selectedSessionData?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-brand-muted">Date</span>
                  <span className="text-brand-cream">{dateStr}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-brand-muted">Time</span>
                  <span className="text-brand-cream">{selectedTime}</span>
                </div>
                <div className="border-t border-brand-gold/[0.08] pt-2 flex justify-between">
                  <span className="text-brand-muted font-medium">Price</span>
                  <span className="text-brand-sage font-semibold">Free</span>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl h-12"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Booking'}
            </Button>
          </form>
        )}
      </div>
    </>
  );
}
