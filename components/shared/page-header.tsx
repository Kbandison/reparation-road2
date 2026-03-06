interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
}

export function PageHeader({ eyebrow, title, description }: PageHeaderProps) {
  return (
    <div className="mb-8">
      {eyebrow && (
        <p className="font-body text-xs font-semibold tracking-widest uppercase text-brand-gold mb-3">
          {eyebrow}
        </p>
      )}
      <h1 className="font-display text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight text-brand-cream">
        {title}
      </h1>
      {description && (
        <p className="font-body text-base text-brand-muted leading-relaxed mt-3 max-w-2xl">
          {description}
        </p>
      )}
    </div>
  );
}
