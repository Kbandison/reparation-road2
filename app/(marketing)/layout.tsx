import { Footer } from '@/components/layout/footer';
import { CopyProtection } from '@/components/shared/copy-protection';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <CopyProtection />
      <main>{children}</main>
      <Footer />
    </>
  );
}
