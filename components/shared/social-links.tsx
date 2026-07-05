import { Instagram, Facebook } from 'lucide-react';

// The X (formerly Twitter) mark isn't in lucide, so we ship it inline.
function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

type IconType = React.ComponentType<{ className?: string }>;

// href: null renders a non-clickable, dimmed icon (Facebook isn't live yet).
const SOCIALS: { label: string; href: string | null; Icon: IconType }[] = [
  { label: 'Instagram', href: 'https://www.instagram.com/reparation_road/', Icon: Instagram },
  { label: 'X', href: 'https://x.com/ReparationRoad', Icon: XIcon },
  { label: 'Facebook', href: null, Icon: Facebook },
];

interface Props {
  className?: string;
  iconClassName?: string;
}

export function SocialLinks({ className = '', iconClassName = 'w-[18px] h-[18px]' }: Props) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {SOCIALS.map(({ label, href, Icon }) =>
        href ? (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-brand-gold/15 text-brand-muted hover:text-brand-gold hover:border-brand-gold/40 transition-colors"
          >
            <Icon className={iconClassName} />
          </a>
        ) : (
          <span
            key={label}
            title={`${label} — coming soon`}
            aria-label={`${label}, coming soon`}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-brand-gold/10 text-brand-muted/40 cursor-default"
          >
            <Icon className={iconClassName} />
          </span>
        ),
      )}
    </div>
  );
}
