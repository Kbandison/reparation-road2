import {
  LayoutDashboard,
  Library,
  Search,
  MessageSquare,
  CalendarDays,
  Crown,
  Settings,
  Users,
  ShoppingCart,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const platformNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Collection', href: '/collection', icon: Library },
  { label: 'Search', href: '/search', icon: Search },
  { label: 'Forum', href: '/forum', icon: MessageSquare },
  { label: 'Booking', href: '/booking', icon: CalendarDays },
  { label: 'Membership', href: '/membership', icon: Crown },
];

export const adminNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'Collections', href: '/admin/collections', icon: Library },
  { label: 'Forum', href: '/admin/forum', icon: MessageSquare },
  { label: 'Bookings', href: '/admin/bookings', icon: CalendarDays },
  { label: 'Users', href: '/admin/users', icon: Users },
  { label: 'Orders', href: '/admin/orders', icon: ShoppingCart },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
];

export const sessionTypes = [
  {
    id: 'intro',
    name: 'Introductory Consultation',
    duration: '30 min',
    price: 0,
    description: 'A free introductory session to discuss your research goals and how we can help.',
  },
  {
    id: 'family-history',
    name: 'Family History Research',
    duration: '60 min',
    price: 75,
    description: 'A focused session to explore your family history using our archives and resources.',
  },
  {
    id: 'deep-dive',
    name: 'Deep Dive Research',
    duration: '120 min',
    price: 150,
    description: 'An in-depth research session for complex genealogical inquiries and multi-source analysis.',
  },
  {
    id: 'genetic-genealogy',
    name: 'Genetic Genealogy Consultation',
    duration: '60 min',
    price: 100,
    description: 'Expert guidance on DNA testing results and connecting genetic data to historical records.',
  },
] as const;

export const availableTimeSlots = [
  '9:00 AM',
  '10:00 AM',
  '11:00 AM',
  '1:00 PM',
  '2:00 PM',
  '3:00 PM',
  '4:00 PM',
] as const;

export const collectionCategories = [
  'census',
  'church-records',
  'military',
  'slave-trade',
  'legal',
  'immigration',
  'property',
] as const;

export const collectionEras = [
  'colonial',
  'revolutionary',
  'antebellum',
  'civil-war',
  'reconstruction',
] as const;

export const collectionRegions = [
  'national',
  'international',
  'georgia',
  'virginia',
  'kentucky',
  'alabama',
  'southeast',
] as const;

export const freeFeatures = [
  'Browse collection landing pages',
  'View collection descriptions',
  'Access general historical information',
  'Access to Forum',
  'Access to Inspection Roll of Negroes collection',
  'Access to African-American Revolutionary Soldiers collection',
  'Access to Free Black Heads of Household (1790 Census) collection',
  'Create an account',
  'Basic customer support',
] as const;

export const premiumFeatures = [
  'Full access to all historical data tables',
  'Advanced search and filtering',
  'Download and export records',
  'Bookmark and save favorite records',
  'Priority customer support',
  'Early access to new collections',
  'Monthly research updates',
  'Priority booking for consultations',
] as const;

export const membershipPricing = {
  monthly: { price: '$7.99', interval: 'month', label: 'Premium Monthly' },
  yearly: { price: '$79.99', interval: 'year', label: 'Premium Yearly', savings: '16%' },
} as const;
