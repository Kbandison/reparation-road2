import Link from 'next/link';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-[440px]">
        <Link href="/" className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-gold to-brand-burgundy flex items-center justify-center">
            <span className="font-display text-lg font-bold text-brand-cream">R</span>
          </div>
          <span className="font-display text-xl font-semibold text-brand-cream">
            Reparation Road
          </span>
        </Link>
        {children}
      </div>
    </div>
  );
}
