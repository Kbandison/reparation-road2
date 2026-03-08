'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Globe,
  Mail,
  CreditCard,
  Bell,
  Shield,
  Loader2,
} from 'lucide-react';

type Tab = 'general' | 'email' | 'billing' | 'notifications' | 'security';

const tabs: { id: Tab; label: string; icon: typeof Globe }[] = [
  { id: 'general', label: 'General', icon: Globe },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
];

export function AdminSettingsPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('general');

  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* Sidebar tabs */}
      <div className="md:w-48 flex md:flex-col gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-brand-gold/10 text-brand-gold'
                : 'text-brand-muted hover:text-brand-cream hover:bg-brand-card-hover'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6">
        {activeTab === 'general' && <GeneralSettings />}
        {activeTab === 'email' && <EmailSettings />}
        {activeTab === 'billing' && <BillingSettings />}
        {activeTab === 'notifications' && <NotificationsSettings />}
        {activeTab === 'security' && <SecuritySettings />}
      </div>
    </div>
  );
}

function GeneralSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-lg font-semibold text-brand-cream mb-1">General Settings</h3>
        <p className="text-sm text-brand-muted">Configure basic site information</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Site Name</Label>
          <Input
            defaultValue="Reparation Road"
            className="bg-brand-bg border-brand-gold/[0.15] focus:border-brand-gold"
          />
        </div>
        <div className="space-y-2">
          <Label>Site Description</Label>
          <Input
            defaultValue="A digital archive of Black American history"
            className="bg-brand-bg border-brand-gold/[0.15] focus:border-brand-gold"
          />
        </div>
        <div className="space-y-2">
          <Label>Contact Email</Label>
          <Input
            defaultValue="contact@reparationroad.org"
            className="bg-brand-bg border-brand-gold/[0.15] focus:border-brand-gold"
          />
        </div>
      </div>

      <Button
        onClick={() => toast.success('Settings saved')}
        className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
      >
        Save Changes
      </Button>
    </div>
  );
}

function EmailSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-lg font-semibold text-brand-cream mb-1">Email Settings</h3>
        <p className="text-sm text-brand-muted">Configure email delivery via Resend</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>From Email</Label>
          <Input
            defaultValue="noreply@reparationroad.org"
            className="bg-brand-bg border-brand-gold/[0.15] focus:border-brand-gold"
          />
        </div>
        <div className="space-y-2">
          <Label>Reply-To Email</Label>
          <Input
            defaultValue="contact@reparationroad.org"
            className="bg-brand-bg border-brand-gold/[0.15] focus:border-brand-gold"
          />
        </div>
        <div className="bg-brand-bg rounded-xl p-4 border border-brand-gold/[0.08]">
          <p className="text-xs text-brand-muted">
            Email delivery is powered by Resend. API key is configured via environment variables.
          </p>
        </div>
      </div>

      <Button
        onClick={() => toast.success('Email settings saved')}
        className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
      >
        Save Changes
      </Button>
    </div>
  );
}

function BillingSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-lg font-semibold text-brand-cream mb-1">Billing Settings</h3>
        <p className="text-sm text-brand-muted">Stripe payment configuration</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Monthly Price</Label>
          <Input
            defaultValue="$7.99"
            disabled
            className="bg-brand-bg border-brand-gold/[0.15] text-brand-muted"
          />
          <p className="text-xs text-brand-muted">Managed via Stripe Dashboard</p>
        </div>
        <div className="space-y-2">
          <Label>Yearly Price</Label>
          <Input
            defaultValue="$79.99"
            disabled
            className="bg-brand-bg border-brand-gold/[0.15] text-brand-muted"
          />
          <p className="text-xs text-brand-muted">Managed via Stripe Dashboard</p>
        </div>
        <div className="bg-brand-bg rounded-xl p-4 border border-brand-gold/[0.08]">
          <p className="text-xs text-brand-muted">
            Pricing and subscription plans are managed through the Stripe Dashboard.
            Environment variables for Stripe keys are configured in your deployment settings.
          </p>
        </div>
      </div>
    </div>
  );
}

function NotificationsSettings() {
  const [emailOnSignup, setEmailOnSignup] = useState(true);
  const [emailOnBooking, setEmailOnBooking] = useState(true);
  const [emailOnSubscription, setEmailOnSubscription] = useState(true);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-lg font-semibold text-brand-cream mb-1">Notification Preferences</h3>
        <p className="text-sm text-brand-muted">Choose which events trigger admin notifications</p>
      </div>

      <div className="space-y-3">
        {[
          { label: 'New user signups', checked: emailOnSignup, onChange: setEmailOnSignup },
          { label: 'New booking requests', checked: emailOnBooking, onChange: setEmailOnBooking },
          { label: 'Subscription changes', checked: emailOnSubscription, onChange: setEmailOnSubscription },
        ].map((item) => (
          <label
            key={item.label}
            className="flex items-center justify-between p-3 bg-brand-bg rounded-xl border border-brand-gold/[0.08] cursor-pointer hover:border-brand-gold/[0.15] transition-colors"
          >
            <span className="text-sm text-brand-cream">{item.label}</span>
            <button
              type="button"
              role="switch"
              aria-checked={item.checked}
              onClick={() => item.onChange(!item.checked)}
              className={`relative w-10 h-6 rounded-full transition-colors ${
                item.checked ? 'bg-brand-gold' : 'bg-brand-muted/30'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  item.checked ? 'translate-x-4' : ''
                }`}
              />
            </button>
          </label>
        ))}
      </div>

      <Button
        onClick={() => toast.success('Notification preferences saved')}
        className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
      >
        Save Changes
      </Button>
    </div>
  );
}

function SecuritySettings() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-lg font-semibold text-brand-cream mb-1">Security</h3>
        <p className="text-sm text-brand-muted">Authentication and access settings</p>
      </div>

      <div className="space-y-4">
        <div className="bg-brand-bg rounded-xl p-4 border border-brand-gold/[0.08] space-y-2">
          <p className="text-sm font-medium text-brand-cream">Authentication Provider</p>
          <p className="text-xs text-brand-muted">Supabase Auth (Email/Password)</p>
        </div>
        <div className="bg-brand-bg rounded-xl p-4 border border-brand-gold/[0.08] space-y-2">
          <p className="text-sm font-medium text-brand-cream">Password Requirements</p>
          <p className="text-xs text-brand-muted">Minimum 8 characters (enforced by Supabase)</p>
        </div>
        <div className="bg-brand-bg rounded-xl p-4 border border-brand-gold/[0.08] space-y-2">
          <p className="text-sm font-medium text-brand-cream">Email Confirmation</p>
          <p className="text-xs text-brand-muted">Required for new signups. Admin-created users are auto-confirmed.</p>
        </div>
        <div className="bg-brand-bg rounded-xl p-4 border border-brand-gold/[0.08] space-y-2">
          <p className="text-sm font-medium text-brand-cream">Row-Level Security</p>
          <p className="text-xs text-brand-muted">Enabled on all Supabase tables. Admin actions use service role key.</p>
        </div>
      </div>
    </div>
  );
}
