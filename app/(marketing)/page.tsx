import Image from 'next/image';
import Link from 'next/link';
import { CalendarDays, ArrowRight, Search, Dna, GraduationCap, Box, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { freeFeatures, premiumFeatures, membershipPricing } from '@/lib/constants';

const stats = [
  { number: '10K+', label: 'Documents Preserved' },
  { number: '500+', label: 'Families Reconnected' },
  { number: '50+', label: 'Workshops Delivered' },
  { number: '100%', label: 'Committed to Truth' },
];

const services = [
  {
    icon: Search,
    title: 'Family History Research',
    description: 'Discover your roots through our extensive collection of historical records, census data, and personal documents.',
    accent: 'text-brand-gold bg-brand-gold/10',
  },
  {
    icon: Dna,
    title: 'Genetic Genealogy',
    description: 'Connect DNA testing results with historical records to build a comprehensive picture of your ancestry.',
    accent: 'text-brand-burgundy-light bg-brand-burgundy/10',
  },
  {
    icon: GraduationCap,
    title: 'E-Learning & Workshops',
    description: 'Join educational sessions led by historians and genealogists to develop your research skills.',
    accent: 'text-brand-sage bg-brand-sage/10',
  },
  {
    icon: Box,
    title: '3D Preservation & Archiving',
    description: 'Cutting-edge digital preservation ensures historical artifacts and documents survive for future generations.',
    accent: 'text-brand-gold-light bg-brand-gold-light/10',
  },
];

const homeFreeFeatures = freeFeatures.slice(0, 4);
const homePremiumFeatures = premiumFeatures.slice(0, 6);

export default function HomePage() {
  return (
    <>
      {/* Hero Section */}
      <section className="min-h-screen flex items-center relative overflow-hidden">
        <Image
          src="/hero-landing.png"
          alt="Grandmother and granddaughter exploring history together"
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-brand-burgundy/40" />
        <div className="max-w-7xl mx-auto px-6 py-32 relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div className="backdrop-blur-md bg-white/10 border border-white/20 rounded-xl p-8 md:p-10">
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-white leading-[1.15] mb-6">
              Restoring History Through Research and Advocacy
            </h1>

            <p className="font-body text-base md:text-lg text-white/85 leading-relaxed mb-8">
              Reparation Road is a cultural and historical resource dedicated to uncovering
              Black history and empowering communities through research and education.
            </p>

            <Link href="/booking">
              <Button className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl px-6 h-12 text-sm font-medium">
                <CalendarDays className="w-4 h-4 mr-2" />
                Book Your Research Session
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="border-y border-brand-gold/10 bg-gradient-to-r from-brand-card/50 via-brand-bg to-brand-card/50">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="font-display text-3xl md:text-4xl font-semibold text-brand-gold mb-1">
                  {stat.number}
                </p>
                <p className="font-body text-sm text-brand-muted">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="font-body text-xs font-semibold tracking-widest uppercase text-brand-gold mb-3">
              Our Services
            </p>
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-brand-cream">
              What We Do
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {services.map((service) => (
              <div
                key={service.title}
                className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6 hover:border-brand-gold/25 hover:-translate-y-1 transition-all duration-200"
              >
                <div className={`w-12 h-12 rounded-xl ${service.accent} flex items-center justify-center mb-5`}>
                  <service.icon className="w-6 h-6" />
                </div>
                <h3 className="font-display text-lg font-semibold text-brand-cream mb-2">
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

      {/* Mission Section */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="aspect-[4/3] rounded-2xl bg-brand-card border border-brand-gold/[0.08] overflow-hidden relative">
              <Image
                src="/mission-archive.png"
                alt="Vintage desk with framed portraits, handwritten letters, and historical books"
                fill
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-brand-bg/50 to-transparent" />
            </div>

            <div>
              <p className="font-body text-xs font-semibold tracking-widest uppercase text-brand-gold mb-3">
                Our Mission
              </p>
              <h2 className="font-display text-3xl md:text-4xl font-semibold text-brand-cream leading-tight mb-6">
                Preserving Truth.
                <br />
                <span className="italic text-brand-gold">Empowering Community.</span>
              </h2>
              <p className="font-body text-base text-brand-muted leading-relaxed mb-4">
                Reparation Road is dedicated to the research, preservation, and dissemination of
                African American historical records. We believe that understanding the past is
                essential to building a just future.
              </p>
              <p className="font-body text-base text-brand-muted leading-relaxed mb-6">
                Through our digital archive of over 10,000 documents — including census records,
                military records, church registers, and slave trade documents — we provide
                families with the tools to uncover their history and connect with their heritage.
              </p>
              <Link
                href="/about"
                className="inline-flex items-center gap-2 text-brand-gold hover:gap-3.5 transition-[gap] duration-200 font-body text-sm font-medium"
              >
                Learn more about our story
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Membership Preview */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="font-body text-xs font-semibold tracking-widest uppercase text-brand-gold mb-3">
              Membership
            </p>
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-brand-cream">
              Join the Community
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {/* Free */}
            <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-8 flex flex-col">
              <h3 className="font-display text-xl font-semibold text-brand-cream mb-1">Free</h3>
              <p className="text-brand-muted text-sm mb-6">Get started exploring</p>
              <p className="font-display text-4xl font-semibold text-brand-cream mb-8">
                $0<span className="text-base text-brand-muted font-body">/forever</span>
              </p>
              <ul className="space-y-3 mb-8 flex-1">
                {homeFreeFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-brand-muted">
                    <Check className="w-4 h-4 text-brand-gold mt-0.5 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link href="/signup">
                <Button variant="outline" className="w-full border-brand-gold/30 text-brand-cream rounded-xl">
                  Join Free
                </Button>
              </Link>
            </div>

            {/* Premium Monthly */}
            <div className="bg-brand-card border-2 border-brand-gold/40 rounded-2xl p-8 flex flex-col relative shadow-[0_0_40px_rgba(200,149,108,0.08)]">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-brand-gold text-brand-bg text-xs font-semibold px-3 py-1 rounded-full">
                  Most Popular
                </span>
              </div>
              <h3 className="font-display text-xl font-semibold text-brand-cream mb-1">Premium</h3>
              <p className="text-brand-muted text-sm mb-6">Full research access</p>
              <p className="font-display text-4xl font-semibold text-brand-cream mb-8">
                {membershipPricing.monthly.price}<span className="text-base text-brand-muted font-body">/{membershipPricing.monthly.interval}</span>
              </p>
              <ul className="space-y-3 mb-8 flex-1">
                {homePremiumFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-brand-cream-muted">
                    <Check className="w-4 h-4 text-brand-gold mt-0.5 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link href="/membership">
                <Button className="w-full bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl">
                  Start Exploring
                </Button>
              </Link>
            </div>

            {/* Premium Yearly */}
            <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-8 flex flex-col relative">
              <div className="mb-2">
                <span className="bg-brand-sage/20 text-brand-sage text-xs font-semibold px-3 py-1 rounded-full">
                  Best Value
                </span>
              </div>
              <h3 className="font-display text-xl font-semibold text-brand-cream mb-1 mt-2">Premium</h3>
              <p className="text-brand-muted text-sm mb-6">Save {membershipPricing.yearly.savings} annually</p>
              <p className="font-display text-4xl font-semibold text-brand-cream mb-8">
                {membershipPricing.yearly.price}<span className="text-base text-brand-muted font-body">/{membershipPricing.yearly.interval}</span>
              </p>
              <ul className="space-y-3 mb-8 flex-1">
                {homePremiumFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-brand-muted">
                    <Check className="w-4 h-4 text-brand-gold mt-0.5 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link href="/membership">
                <Button className="w-full bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl">
                  Start Exploring
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-br from-brand-card to-brand-card-hover border border-brand-gold/20 rounded-2xl p-8 md:p-16 text-center">
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-brand-cream mb-4">
              Ready to Discover Your History?
            </h2>
            <p className="font-body text-base text-brand-muted leading-relaxed max-w-lg mx-auto mb-8">
              Book a personalized research session with our team of historians and genealogists,
              or join the community to start exploring on your own.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/booking">
                <Button className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl px-8 h-12">
                  Book Your Session
                </Button>
              </Link>
              <Link href="/signup">
                <Button variant="outline" className="border-brand-gold/30 text-brand-cream hover:bg-brand-gold/5 rounded-xl px-8 h-12">
                  Join the Community
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
