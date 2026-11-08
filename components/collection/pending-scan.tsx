import { EyeOff } from 'lucide-react';

/**
 * Stands in for a scan whose collection is blurred but whose blurred copy
 * isn't ready yet. The original must never show, not even briefly.
 */
export function PendingScan({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 bg-brand-card text-center text-brand-muted ${className}`}
      role="img"
      aria-label="Image being prepared"
    >
      <EyeOff className={compact ? 'h-5 w-5 text-brand-gold/60' : 'h-7 w-7 text-brand-gold/60'} aria-hidden="true" />
      {!compact && (
        <>
          <p className="text-sm text-brand-cream-muted">Image being prepared</p>
          <p className="max-w-[16rem] text-xs leading-relaxed">This image is shown blurred. It will appear here shortly.</p>
        </>
      )}
    </div>
  );
}
