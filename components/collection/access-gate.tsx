import Link from 'next/link';
import { Lock, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Collection } from '@/lib/types';

interface AccessGateProps {
  collection: Collection;
  reason: 'login' | 'subscribe';
}

export function AccessGate({ collection, reason }: AccessGateProps) {
  return (
    <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-8 md:p-12 text-center max-w-xl mx-auto mt-8">
      <Lock className="w-10 h-10 text-brand-gold mx-auto mb-4" />
      <h2 className="font-display text-xl font-semibold text-brand-cream mb-2">
        Premium Collection
      </h2>
      <p className="text-sm text-brand-muted mb-6">
        {reason === 'login'
          ? `Sign in or create an account to access ${collection.name}. Premium membership required.`
          : `Upgrade to a premium membership to access ${collection.name} and all other paid collections.`}
      </p>
      {reason === 'login' ? (
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/login">
            <Button className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl w-full sm:w-auto">
              Sign In
            </Button>
          </Link>
          <Link href="/signup">
            <Button variant="outline" className="border-brand-gold/20 text-brand-cream rounded-xl w-full sm:w-auto">
              <UserPlus className="w-4 h-4 mr-2" />
              Create Account
            </Button>
          </Link>
        </div>
      ) : (
        <Link href="/membership">
          <Button className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl">
            View Membership Plans
          </Button>
        </Link>
      )}
    </div>
  );
}
