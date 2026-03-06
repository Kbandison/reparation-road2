import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-brand-gold" />
    </div>
  );
}
