import { cn } from '@/lib/utils';

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}

// Deterministic warm tint per user so avatars are distinguishable without
// images. Stays within the brand palette.
const TINTS = [
  'bg-brand-gold/20 text-brand-gold',
  'bg-brand-sage/20 text-brand-sage',
  'bg-brand-burgundy/25 text-brand-burgundy-light',
];

function tintFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

export function Avatar({ name, src, size = 24, className }: AvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const style = { width: size, height: size };

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        style={style}
        className={cn('rounded-full object-cover flex-shrink-0', className)}
      />
    );
  }

  return (
    <span
      style={{ ...style, fontSize: Math.round(size * 0.45) }}
      className={cn(
        'rounded-full flex items-center justify-center font-semibold flex-shrink-0',
        tintFor(name),
        className,
      )}
    >
      {initial}
    </span>
  );
}
