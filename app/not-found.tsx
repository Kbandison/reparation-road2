import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center px-4 text-center">
      <h1 className="font-display text-6xl md:text-8xl font-semibold text-brand-gold mb-4">404</h1>
      <p className="font-display text-2xl text-brand-cream mb-2">Page Not Found</p>
      <p className="text-brand-muted text-sm mb-8 max-w-md">
        The page you&apos;re looking for doesn&apos;t exist or may have been moved.
      </p>
      <Link href="/">
        <Button className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl">
          Return Home
        </Button>
      </Link>
    </div>
  );
}
