import { Clock, Bell } from 'lucide-react';

interface ComingSoonProps {
  collectionName: string;
}

export function ComingSoon({ collectionName }: ComingSoonProps) {
  return (
    <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-10 text-center max-w-lg mx-auto">
      <div className="w-14 h-14 rounded-2xl bg-brand-gold/10 flex items-center justify-center mx-auto mb-5">
        <Clock className="w-7 h-7 text-brand-gold" />
      </div>
      <h2 className="font-display text-xl font-semibold text-brand-cream mb-3">
        Coming Soon
      </h2>
      <p className="text-sm text-brand-muted leading-relaxed mb-6">
        We are currently digitizing and preparing the <strong className="text-brand-cream">{collectionName}</strong> collection.
        Records will be available here once processing is complete.
      </p>
      <div className="flex items-center justify-center gap-2 text-xs text-brand-muted">
        <Bell className="w-3.5 h-3.5" />
        <span>Check back soon for updates</span>
      </div>
    </div>
  );
}
