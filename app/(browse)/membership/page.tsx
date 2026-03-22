'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/contexts/user-context';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Check, Loader2, Crown, ChevronDown, UserPlus, Shield, Users, Archive, Bookmark } from 'lucide-react';
import { formatDate } from '@/lib/utils/format';
import { freeFeatures, premiumFeatures, membershipPricing } from '@/lib/constants';

const whyCreateAccount = [
  {
    icon: Archive,
    title: 'Access Exclusive Collections',
    description: 'Even with a free account, you get access to three foundational collections spanning the Revolutionary War era through the 1790 Census.',
  },
  {
    icon: Users,
    title: 'Join the Community',
    description: 'Participate in forum discussions, share research findings, and connect with others tracing their family history.',
  },
  {
    icon: Bookmark,
    title: 'Save Your Research',
    description: 'Bookmark records and collections to build your personal research library and pick up where you left off.',
  },
  {
    icon: Shield,
    title: 'Secure & Private',
    description: 'Your data and research are protected. We never sell your information or share it with third parties.',
  },
];

const faqs = [
  {
    question: 'What do I get with a free account?',
    answer: 'A free account gives you access to collection landing pages, descriptions, general historical information, the community forum, and three foundational collections: Inspection Roll of Negroes, African-American Revolutionary Soldiers, and Free Black Heads of Household (1790 Census).',
  },
  {
    question: 'What additional access does Premium provide?',
    answer: 'Premium members get full access to all historical data tables across every collection, advanced search and filtering tools, the ability to download and export records, bookmark and save favorites, priority customer support, early access to new collections, monthly research updates, and priority booking for consultations.',
  },
  {
    question: 'Can I switch between monthly and yearly billing?',
    answer: `Yes. You can switch between monthly (${membershipPricing.monthly.price}/mo) and yearly (${membershipPricing.yearly.price}/yr) billing at any time through your subscription management portal. When switching to yearly, you save ${membershipPricing.yearly.savings} compared to monthly billing.`,
  },
  {
    question: 'How do I cancel my subscription?',
    answer: 'You can cancel anytime through the "Manage Subscription" button on this page. Your access continues until the end of your current billing period — no partial refunds, but no surprise charges either.',
  },
  {
    question: 'Is my payment information secure?',
    answer: 'Absolutely. All payments are processed through Stripe, a PCI Level 1 certified payment processor. We never store your card details on our servers.',
  },
];

export default function MembershipPage() {
  const { profile, isPremium } = useUser();
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const isDonor = profile?.subscription_status === 'donor';

  async function handleSubscribe(priceId: string) {
    if (!profile) {
      router.push('/login?redirect=/membership');
      return;
    }
    setLoading(priceId);
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId }),
    });

    const { url, error } = await res.json();
    if (error) {
      setLoading(null);
      return;
    }
    window.location.href = url;
  }

  async function handleManage() {
    setLoading('portal');
    const res = await fetch('/api/stripe/portal', { method: 'POST' });
    const { url } = await res.json();
    window.location.href = url;
  }

  return (
    <>
      <PageHeader
        eyebrow="Membership"
        title={profile ? 'Your Plan' : 'Choose a Plan'}
        description={profile ? 'Manage your subscription and access premium features.' : 'Unlock the full archive with a premium membership.'}
      />

      {/* Donor status */}
      {isDonor && profile && (
        <div className="bg-brand-card border border-brand-gold/20 rounded-2xl p-6 mb-10 max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <Crown className="w-6 h-6 text-brand-gold" />
            <h2 className="font-display text-xl font-semibold text-brand-cream">Donor Member</h2>
          </div>
          <p className="text-sm text-brand-muted mb-2">
            Thank you for your generous support. You have full premium access to the entire Reparation Road archive.
          </p>
          <div className="text-sm">
            <span className="text-brand-muted">Status</span>
            <p className="text-brand-sage">Active — Donor</p>
          </div>
        </div>
      )}

      {/* Premium member status */}
      {isPremium && !isDonor && profile && (
        <div className="bg-brand-card border border-brand-gold/20 rounded-2xl p-6 mb-10 max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <Crown className="w-6 h-6 text-brand-gold" />
            <h2 className="font-display text-xl font-semibold text-brand-cream">Premium Member</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm mb-4">
            <div>
              <span className="text-brand-muted">Plan</span>
              <p className="text-brand-cream capitalize">{profile.subscription_interval || 'Monthly'}</p>
            </div>
            {profile.subscription_period_end && (
              <div>
                <span className="text-brand-muted">
                  {profile.subscription_cancel_at_period_end ? 'Expires' : 'Next billing'}
                </span>
                <p className="text-brand-cream">{formatDate(profile.subscription_period_end)}</p>
              </div>
            )}
            <div>
              <span className="text-brand-muted">Status</span>
              <p className={profile.subscription_cancel_at_period_end ? 'text-brand-burgundy-light' : 'text-brand-sage'}>
                {profile.subscription_cancel_at_period_end ? 'Cancelling' : 'Active'}
              </p>
            </div>
          </div>
          <Button
            onClick={handleManage}
            disabled={loading === 'portal'}
            variant="outline"
            className="border-brand-gold/30 text-brand-cream rounded-xl"
          >
            {loading === 'portal' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Manage Subscription'}
          </Button>
        </div>
      )}

      {/* Plan cards — hidden for donors */}
      {!isDonor && <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto">
        {/* Free */}
        <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-8 flex flex-col">
          <h3 className="font-display text-xl font-semibold text-brand-cream mb-1">Free</h3>
          <p className="text-brand-muted text-sm mb-6">Get started exploring</p>
          <p className="font-display text-4xl font-semibold text-brand-cream mb-8">
            $0<span className="text-base text-brand-muted font-body">/forever</span>
          </p>
          <ul className="space-y-3 mb-8 flex-1">
            {freeFeatures.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-brand-muted">
                <Check className="w-4 h-4 text-brand-gold mt-0.5 flex-shrink-0" />
                {f}
              </li>
            ))}
          </ul>
          {profile && !isPremium ? (
            <Button variant="outline" disabled className="w-full border-brand-gold/30 text-brand-cream rounded-xl">
              Current Plan
            </Button>
          ) : !profile ? (
            <Button
              onClick={() => router.push('/signup')}
              variant="outline"
              className="w-full border-brand-gold/30 text-brand-cream hover:bg-brand-gold/5 rounded-xl"
            >
              Create Free Account
            </Button>
          ) : null}
        </div>

        {/* Premium Monthly */}
        <div className="bg-brand-card border-2 border-brand-gold/40 rounded-2xl p-8 flex flex-col relative shadow-[0_0_40px_rgba(200,149,108,0.08)]">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <span className="bg-brand-gold text-brand-bg text-xs font-semibold px-3 py-1 rounded-full">
              Most Popular
            </span>
          </div>
          <h3 className="font-display text-xl font-semibold text-brand-cream mb-1">{membershipPricing.monthly.label}</h3>
          <p className="text-brand-muted text-sm mb-6">Full archive access</p>
          <p className="font-display text-4xl font-semibold text-brand-cream mb-8">
            {membershipPricing.monthly.price}<span className="text-base text-brand-muted font-body">/{membershipPricing.monthly.interval}</span>
          </p>
          <ul className="space-y-3 mb-8 flex-1">
            {premiumFeatures.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-brand-cream">
                <Check className="w-4 h-4 text-brand-gold mt-0.5 flex-shrink-0" />
                {f}
              </li>
            ))}
          </ul>
          {isPremium && profile?.subscription_interval === 'month' ? (
            <Button variant="outline" disabled className="w-full border-brand-gold/30 text-brand-cream rounded-xl">
              Current Plan
            </Button>
          ) : (
            <Button
              onClick={() => handleSubscribe(process.env.NEXT_PUBLIC_STRIPE_PREMIUM_MONTHLY_PRICE_ID || 'price_1SyG5uDkdSsjPr1SSLcAga0B')}
              disabled={loading === 'monthly'}
              className="w-full bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
            >
              {loading === 'monthly' ? <Loader2 className="w-4 h-4 animate-spin" /> : !profile ? 'Sign In to Subscribe' : 'Subscribe Monthly'}
            </Button>
          )}
        </div>
      </div>

      }

      {/* Yearly option */}
      {!isDonor && <div className="max-w-3xl mx-auto mt-5">
        <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-display text-lg font-semibold text-brand-cream">{membershipPricing.yearly.label}</h3>
              <span className="bg-brand-sage/20 text-brand-sage text-xs font-semibold px-2 py-0.5 rounded-full">
                Save {membershipPricing.yearly.savings}
              </span>
            </div>
            <p className="text-sm text-brand-muted">
              {membershipPricing.yearly.price}/{membershipPricing.yearly.interval} — just $6.67/month
            </p>
          </div>
          {isPremium && profile?.subscription_interval === 'year' ? (
            <Button variant="outline" disabled className="border-brand-gold/30 text-brand-cream rounded-xl">
              Current Plan
            </Button>
          ) : (
            <Button
              onClick={() => handleSubscribe(process.env.NEXT_PUBLIC_STRIPE_PREMIUM_YEARLY_PRICE_ID || 'price_1SyG7mDkdSsjPr1SsBQo3L6v')}
              disabled={loading === 'yearly'}
              className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
            >
              {loading === 'yearly' ? <Loader2 className="w-4 h-4 animate-spin" /> : !profile ? 'Sign In to Subscribe' : 'Subscribe Yearly'}
            </Button>
          )}
        </div>
      </div>

      }

      {/* Why Create an Account */}
      <div className="max-w-3xl mx-auto mt-20">
        <div className="text-center mb-10">
          <p className="font-body text-xs font-semibold tracking-widest uppercase text-brand-gold mb-3">
            Get Started
          </p>
          <h2 className="font-display text-2xl md:text-3xl font-semibold text-brand-cream">
            Why Create an Account?
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {whyCreateAccount.map((item) => (
            <div
              key={item.title}
              className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6 hover:border-brand-gold/25 transition-colors"
            >
              <item.icon className="w-8 h-8 text-brand-gold mb-4" />
              <h3 className="font-display text-base font-semibold text-brand-cream mb-2">
                {item.title}
              </h3>
              <p className="font-body text-sm text-brand-muted leading-relaxed">
                {item.description}
              </p>
            </div>
          ))}
        </div>

        {!profile && (
          <div className="text-center mt-8">
            <Button
              onClick={() => router.push('/signup')}
              className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl px-8 h-12"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Create Your Free Account
            </Button>
          </div>
        )}
      </div>

      {/* FAQ */}
      <div className="max-w-3xl mx-auto mt-20 mb-8">
        <div className="text-center mb-10">
          <p className="font-body text-xs font-semibold tracking-widest uppercase text-brand-gold mb-3">
            FAQ
          </p>
          <h2 className="font-display text-2xl md:text-3xl font-semibold text-brand-cream">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl overflow-hidden"
            >
              <button
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                className="w-full flex items-center justify-between p-5 text-left"
              >
                <span className="font-body text-sm font-medium text-brand-cream pr-4">
                  {faq.question}
                </span>
                <ChevronDown
                  className={`w-5 h-5 text-brand-muted flex-shrink-0 transition-transform duration-200 ${
                    openFaq === index ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {openFaq === index && (
                <div className="px-5 pb-5 -mt-1">
                  <p className="font-body text-sm text-brand-muted leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
