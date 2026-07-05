import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, Search, Dna, GraduationCap, Box } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SocialLinks } from '@/components/shared/social-links';

export const metadata: Metadata = {
  title: 'Our Story',
  description: 'Learn about Reparation Road — our mission, our work, and our commitment to preserving Black history.',
};

const services = [
  {
    icon: Search,
    title: 'Family History Research',
    description: 'We trace your lineage through historical records, connecting you with ancestors whose stories deserve to be told. Our researchers specialize in navigating the unique challenges of African American genealogy.',
  },
  {
    icon: Dna,
    title: 'Genetic Genealogy',
    description: 'By combining DNA testing with archival research, we help bridge the gaps that slavery and displacement created in family histories, connecting genetic data to documented records.',
  },
  {
    icon: GraduationCap,
    title: 'E-Learning & Workshops',
    description: 'Our educational programs teach genealogical research methods, historical context, and digital preservation techniques to community members and researchers alike.',
  },
  {
    icon: Box,
    title: '3D Preservation & Archiving',
    description: 'Using cutting-edge digital scanning and preservation technology, we ensure that fragile historical documents, photographs, and artifacts survive for future generations.',
  },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="pt-32 pb-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="font-body text-xs font-semibold tracking-widest uppercase text-brand-gold mb-4">
            About Us
          </p>
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight text-brand-cream leading-tight mb-6">
            Our Story
          </h1>
          <p className="font-body text-lg text-brand-muted leading-relaxed max-w-2xl mx-auto">
            Reparation Road was born from a simple belief: every family deserves to know their
            history, and every community deserves access to the truth about its past.
          </p>
        </div>
      </section>

      {/* Who We Are */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="font-body text-xs font-semibold tracking-widest uppercase text-brand-gold mb-3">
                Who We Are
              </p>
              <h2 className="font-display text-3xl md:text-4xl font-semibold text-brand-cream mb-6">
                Researchers, Historians, & Community Builders
              </h2>
              <p className="font-body text-base text-brand-muted leading-relaxed mb-4">
                Reparation Road is a cultural and historical research organization dedicated to
                the preservation and dissemination of African American history. We combine
                traditional genealogical research with modern technology to make historical
                records accessible to everyone.
              </p>
              <p className="font-body text-base text-brand-muted leading-relaxed mb-4">
                Our digital archive hosts over 10,000 documents spanning centuries — from
                colonial-era census records and military rosters to church registers, slave
                trade documents, immigration records, and personal property records. Each
                document has been carefully digitized, transcribed, and indexed.
              </p>
              <p className="font-body text-base text-brand-muted leading-relaxed">
                We believe that restoring access to these records is not just an academic
                exercise — it is an act of justice. When families can trace their lineage,
                when communities can document their heritage, they reclaim a narrative that
                was deliberately erased.
              </p>
            </div>

            <div className="aspect-[4/3] rounded-2xl bg-brand-card border border-brand-gold/[0.08] overflow-hidden relative">
              <Image
                src="/founder-portrait.jpg"
                alt="Founder of Reparation Road"
                fill
                className="object-cover object-top"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-brand-bg/60 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4">
                <p className="font-display text-sm font-semibold text-brand-cream">Founder & Lead Researcher</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What We Do */}
      <section className="py-24 px-6 bg-brand-card/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="font-body text-xs font-semibold tracking-widest uppercase text-brand-gold mb-3">
              What We Do
            </p>
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-brand-cream">
              Our Services
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {services.map((service) => (
              <div
                key={service.title}
                className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-8 hover:border-brand-gold/25 transition-colors"
              >
                <service.icon className="w-8 h-8 text-brand-gold mb-4" />
                <h3 className="font-display text-xl font-semibold text-brand-cream mb-3">
                  {service.title}
                </h3>
                <p className="font-body text-sm text-brand-muted leading-relaxed">
                  {service.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-brand-cream mb-4">
            Start Your Research Journey
          </h2>
          <p className="font-body text-base text-brand-muted leading-relaxed max-w-lg mx-auto mb-8">
            Whether you&apos;re just beginning to explore your heritage or you&apos;re a seasoned researcher,
            we&apos;re here to help.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/booking">
              <Button className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl px-8 h-12">
                Book a Research Session
              </Button>
            </Link>
            <Link href="/collection">
              <Button variant="outline" className="border-brand-gold/30 text-brand-cream hover:bg-brand-gold/5 rounded-xl px-8 h-12 group">
                Browse the Archive
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </div>

          {/* Follow us */}
          <div className="mt-12">
            <p className="font-body text-xs font-semibold tracking-widest uppercase text-brand-gold mb-4">
              Follow our work
            </p>
            <SocialLinks className="justify-center" iconClassName="w-5 h-5" />
          </div>
        </div>
      </section>
    </>
  );
}
