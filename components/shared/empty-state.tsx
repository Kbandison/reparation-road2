import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="w-12 h-12 text-brand-muted/50 mb-4" />
      <h3 className="font-display text-xl font-semibold text-brand-cream mb-2">{title}</h3>
      <p className="text-brand-muted text-sm max-w-md mb-6">{description}</p>
      {action}
    </div>
  );
}
