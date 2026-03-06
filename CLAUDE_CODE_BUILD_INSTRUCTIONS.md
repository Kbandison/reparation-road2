# REPARATION ROAD — Complete Build Instructions for Claude Code

## IMPORTANT CONTEXT

You are building a **complete new frontend** for reparationroad.org — a digital archive and research platform dedicated to uncovering Black history. The site hosts 25+ historical collections (census records, military records, slave trade documents, church records, immigration records, etc.) with thousands of digitized pages, OCR transcriptions, and structured data.

The **Supabase database already exists** with all data migrated and consolidated. You are NOT creating the database — you are building the Next.js frontend that connects to it.

**Do NOT run the SQL migration file.** That has already been handled separately.

---

## TABLE OF CONTENTS

1. Project Setup & Configuration
2. Environment Variables
3. Supabase Client Setup
4. TypeScript Types
5. Auth System
6. Middleware
7. Root Layout & Global Styles
8. Marketing Pages (Home, About)
9. Auth Pages (Login, Signup, Forgot Password, Reset Password, Callback)
10. Platform Layout (Sidebar/Topbar for authenticated users)
11. Collection System (Browse, Detail, Search)
12. Forum System
13. Booking System
14. Membership & Stripe Integration
15. Member Dashboard
16. Admin Panel
17. Contact Form & Email (Resend)
18. SEO & Metadata
19. Deployment Configuration

---

## 1. PROJECT SETUP & CONFIGURATION

### Initialize the project

```bash
npx create-next-app@latest reparation-road --typescript --tailwind --eslint --app --src=false --import-alias "@/*"
cd reparation-road
```

### Install dependencies

```bash
# Core
npm install @supabase/supabase-js @supabase/ssr

# UI
npx shadcn@latest init
# When prompted: New York style, Zinc base color, CSS variables: yes

# Install these shadcn components:
npx shadcn@latest add button card input label textarea select badge dialog dropdown-menu sheet tabs separator avatar skeleton toast sonner table pagination command popover calendar checkbox radio-group scroll-area tooltip accordion alert-dialog

# Icons
npm install lucide-react

# Stripe
npm install stripe @stripe/stripe-js

# Email
npm install resend

# Utilities
npm install date-fns slugify
```

### Tailwind Configuration

Extend the default Tailwind config with the Reparation Road design tokens:

```javascript
// tailwind.config.js
module.exports = {
  // ... shadcn defaults
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#0F0D0B',
          card: '#1C1917',
          'card-hover': '#292524',
          cream: '#F5F0E8',
          'cream-muted': '#D6CFC4',
          gold: '#C8956C',
          'gold-light': '#E0B992',
          burgundy: '#8B3A3A',
          'burgundy-light': '#A85454',
          sage: '#7A8B6F',
          muted: '#A8A29E',
        }
      },
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'serif'],
        body: ['DM Sans', 'system-ui', 'sans-serif'],
      }
    }
  }
}
```

### Next.js Configuration

```typescript
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'nviahrhrupqvwyglaxlj.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  // Improve performance
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
```

---

## 2. ENVIRONMENT VARIABLES

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://nviahrhrupqvwyglaxlj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<stripe-publishable-key>
STRIPE_SECRET_KEY=<stripe-secret-key>
STRIPE_WEBHOOK_SECRET=<stripe-webhook-secret>
STRIPE_PREMIUM_MONTHLY_PRICE_ID=price_1SyG5uDkdSsjPr1SSLcAga0B
STRIPE_PREMIUM_YEARLY_PRICE_ID=price_1SyG7mDkdSsjPr1SsBQo3L6v

RESEND_API_KEY=<resend-api-key>

NEXT_PUBLIC_BASE_URL=https://reparationroad.org
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 3. SUPABASE CLIENT SETUP

Create three separate clients for different contexts:

### `lib/supabase/client.ts` — Browser client (used in Client Components)

```typescript
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

### `lib/supabase/server.ts` — Server client (used in Server Components, Route Handlers, Server Actions)

```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method is called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  );
}
```

### `lib/supabase/admin.ts` — Service role client (used server-side only for admin operations)

```typescript
import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
```

### `lib/supabase/middleware.ts` — Middleware helper

```typescript
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Protected routes — redirect to login if not authenticated
  const protectedPaths = ['/collection', '/forum', '/booking', '/dashboard', '/membership', '/admin', '/search'];
  const isProtected = protectedPaths.some(path => request.nextUrl.pathname.startsWith(path));

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages
  const authPaths = ['/login', '/signup'];
  const isAuthPage = authPaths.some(path => request.nextUrl.pathname === path);

  if (isAuthPage && user) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

---

## 4. TYPESCRIPT TYPES

Create `lib/types/index.ts` with types for ALL database tables the frontend interacts with:

```typescript
// Profiles
export interface Profile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  subscription_status: 'free' | 'paid';
  role: 'user' | 'admin';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_interval: 'month' | 'year' | null;
  subscription_period_start: string | null;
  subscription_period_end: string | null;
  subscription_cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

// Collections metadata
export interface Collection {
  id: string;
  slug: string;
  name: string;
  short_description: string | null;
  long_description: string | null;
  category: string;
  era: string | null;
  region: string | null;
  table_name: string;
  discriminator_column: string | null;
  discriminator_value: string | null;
  record_count: number;
  has_images: boolean;
  has_ocr: boolean;
  has_transcription: boolean;
  access_tier: 'free' | 'explorer' | 'scholar';
  thumbnail_url: string | null;
  display_columns: string[];
  search_columns: string[];
  sort_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

// Generic collection record (dynamic — columns vary per collection)
export interface CollectionRecord {
  id: string;
  slug?: string;
  image_path?: string;
  image_url?: string;
  ocr_text?: string;
  created_at?: string;
  [key: string]: any;  // Dynamic columns from display_columns
}

// Bookmarks
export interface Bookmark {
  id: string;
  user_id: string;
  collection_slug: string;
  record_id: string;
  record_title: string | null;
  notes: string | null;
  created_at: string;
}

// Forum
export interface ForumCategory {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  icon: string;
  sort_order: number;
  created_at: string;
}

export interface ForumThread {
  id: string;
  category_id: string;
  user_id: string;
  title: string;
  slug: string;
  content: string;
  is_pinned: boolean;
  is_locked: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
  // Joined fields
  profiles?: Pick<Profile, 'first_name' | 'last_name' | 'email'>;
  forum_posts?: { count: number }[];
}

export interface ForumPost {
  id: string;
  thread_id: string;
  user_id: string;
  content: string;
  is_edited: boolean;
  edited_at: string | null;
  created_at: string;
  // Joined fields
  profiles?: Pick<Profile, 'first_name' | 'last_name' | 'email'>;
  forum_reactions?: ForumReaction[];
}

export interface ForumReaction {
  id: string;
  post_id: string;
  user_id: string;
  reaction_type: 'like' | 'helpful' | 'insightful';
  created_at: string;
}

// Bookings
export interface Booking {
  id: string;
  name: string;
  email: string;
  message: string | null;
  session_type: string;
  date: string;
  time: string;
  created_at: string;
}

// Related Records
export interface RelatedRecord {
  id: string;
  source_record_id: string;
  source_table: string;
  source_name: string | null;
  source_collection: string;
  source_collection_slug: string;
  target_record_id: string;
  target_table: string;
  target_name: string | null;
  target_collection: string;
  target_collection_slug: string;
  relationship_type: string | null;
  relationship_note: string | null;
  display_priority: number;
  is_bidirectional: boolean;
  is_featured: boolean;
}
```

---

## 5. MIDDLEWARE

Create `middleware.ts` at the project root:

```typescript
import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

---

## 6. ROOT LAYOUT & GLOBAL STYLES

### `app/layout.tsx`

- Import Google Fonts: **Playfair Display** (display/headings) and **DM Sans** (body text)
- Use `next/font/google` for optimal loading
- Set dark theme as default (background: brand-bg `#0F0D0B`)
- Include the Sonner Toaster component for toast notifications
- Set metadata: title "Reparation Road — Restoring History Through Research and Advocacy", description matching the site's mission

### `app/globals.css`

- Tailwind directives
- CSS custom properties for the brand color palette mapping to shadcn's theming system
- Override shadcn's default theme variables with:
  - `--background: 12 15% 4%` (brand-bg)
  - `--foreground: 36 33% 94%` (brand-cream)
  - `--card: 20 13% 10%` (brand-card)
  - `--primary: 25 36% 60%` (brand-gold)
  - `--destructive` mapped to burgundy
  - `--muted` mapped to brand-muted
- Smooth scrolling on html
- Custom selection color (gold at 30% opacity)
- Custom scrollbar styles (thin, dark, gold thumb)
- Typography utility classes for display headings using Playfair Display

---

## 7. ROUTE GROUP: MARKETING — `app/(marketing)/`

### Layout: `app/(marketing)/layout.tsx`

Contains the **marketing navigation** and **footer** that wrap all public pages.

**Navigation component:**
- Fixed position, transparent background initially
- On scroll (past 40px): adds backdrop blur, semi-transparent dark background, subtle gold bottom border
- Logo: "R" monogram in a circle with gold-to-burgundy gradient + "Reparation Road" text in Playfair Display
- Desktop links: Our Story, Collection, Forum, Membership, Booking — styled in DM Sans, muted color, gold on hover
- "Sign In" button with gold background
- Mobile: hamburger menu icon that opens a full-screen drawer with staggered fade-in animations for each link
- Breakpoint: 768px for mobile/desktop switch

**Footer component:**
- Three column grid: Brand info (logo + tagline), Site Links (Explore, Community, Services columns), and optional social links
- Gold accent on column headers
- Muted link colors with cream on hover
- Bottom bar with copyright: "© 2026 Reparation Road. All rights reserved."
- Subtle top border in gold at 10% opacity

### Home Page: `app/(marketing)/page.tsx`

This is a **statically generated** page (no dynamic data at build time). Sections:

**Hero Section:**
- Full viewport height, centered content
- Eyebrow badge: "Preserving Truth · Empowering Community" with gold dot and pill-shaped border
- Headline in Playfair Display, ~72px max: "Restoring History / Through Research / & Advocacy" — "Through Research" in gold italic
- Subtitle paragraph in DM Sans, muted color, max-width 580px
- Two CTAs: "Book a Research Session" (gold solid button with calendar icon) and "Explore the Collection" (outlined button with arrow icon)
- Subtle radial gradient in background for depth
- Staggered entrance animations on load (opacity + translateY)

**Stats Bar:**
- Full-width with subtle gradient background and top/bottom gold borders at 10%
- 4 stats in a grid: "10K+ Documents Preserved", "500+ Families Reconnected", "50+ Workshops Delivered", "100% Committed to Truth"
- Numbers in Playfair Display gold, labels in DM Sans muted
- Scroll-triggered fade-in animation

**Services Section:**
- Section heading: "OUR SERVICES" eyebrow + "What We Do" in Playfair
- 4 cards in a responsive grid (1 col mobile, 2 col tablet, 4 col desktop):
  1. Family History Research — Search icon, gold accent
  2. Genetic Genealogy — DNA icon, burgundy accent
  3. E-Learning & Workshops — GraduationCap icon, sage accent
  4. 3D Preservation & Archiving — Box icon, gold-light accent
- Each card: dark background, subtle border, icon in tinted container, title in Playfair, description in DM Sans muted
- Hover: border color shifts to accent, card lifts (-4px translateY), shadow deepens
- Scroll-triggered staggered entrance

**Mission Section:**
- Two-column layout (image left, text right) on desktop, stacked on mobile
- Left: image placeholder (or actual image from Supabase storage) with rounded corners and sepia overlay
- Right: "OUR MISSION" eyebrow + "Preserving Truth. / Empowering Community." (second line gold italic) + two paragraphs of mission text + "Learn more about our story →" link with animated arrow gap on hover
- Scroll-triggered slide-in from left (image) and right (text)

**Membership Preview Section:**
- Section heading: "MEMBERSHIP" + "Join the Community"
- 3 pricing cards (Free, Premium Monthly $9, Premium Yearly $89):
  - Free: basic features, "Join Free" outlined button
  - Premium Monthly: "Most Popular" badge, gold border glow, full feature list, "Start Exploring" solid gold button
  - Premium Yearly: "Best Value" badge, shows savings vs monthly, solid gold button
  - Each card lists features with gold check icons
- This is a preview — the actual subscription flow lives at `/membership`

**CTA Section:**
- Rounded container with gradient background and gold border
- "Ready to Discover Your History?" heading
- "Book a personalized research session..." subtext
- Two buttons: "Book Your Session" (solid) + "Join the Community" (outlined)

### About Page: `app/(marketing)/about/page.tsx`

Static page telling the Reparation Road story. Sections:

- Hero with "Our Story" heading and mission statement
- "Who We Are" section with the organization's background
- "What We Do" expanded descriptions of each service
- Team or founder section (if content available, otherwise placeholder)
- Timeline of key milestones (optional — enhance later)
- CTA to book a research session

---

## 8. ROUTE GROUP: AUTH — `app/(auth)/`

### Layout: `app/(auth)/layout.tsx`

- Minimal layout — NO marketing nav or footer
- Centered card on dark background
- Logo at top linking back to home
- Max-width container (440px) for auth forms

### Login Page: `app/(auth)/login/page.tsx`

- Email + password form
- "Sign in with Google" OAuth button (optional, implement if straightforward)
- "Forgot password?" link → `/forgot-password`
- "Don't have an account? Sign up" link → `/signup`
- Form submission uses server action or client-side Supabase auth
- On success: redirect to `/dashboard` (or the `redirect` query param if present)
- Error handling: show toast for invalid credentials, email not confirmed, etc.
- Loading state on submit button

**Auth logic:**
```typescript
const { data, error } = await supabase.auth.signInWithPassword({
  email,
  password,
});
```

### Signup Page: `app/(auth)/signup/page.tsx`

- First name, last name, email, password, confirm password
- Form validation: email format, password min 8 chars, passwords match
- On submit: `supabase.auth.signUp()` with email + password
- After signup: create a profile row in `profiles` table using the user's ID
- Show "Check your email to confirm your account" message
- Link to login page

**Profile creation after signup (use a database trigger OR do it in the signup handler):**

The database should already have a trigger that creates a profile row when a new auth user is created. If not, create a server action that inserts into profiles after signup:

```typescript
// After successful signup, insert profile
const { error: profileError } = await supabaseAdmin
  .from('profiles')
  .insert({
    id: user.id,
    email: user.email,
    first_name: firstName,
    last_name: lastName,
  });
```

**IMPORTANT:** Check if a trigger `handle_new_user` or similar already exists on `auth.users`. If it does, you may not need to manually insert. If it doesn't exist, create a Supabase trigger:

```sql
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', '')
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

### Forgot Password: `app/(auth)/forgot-password/page.tsx`

- Email input only
- Submit calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: '{BASE_URL}/reset-password' })`
- Show success message: "Check your email for a password reset link"
- Link back to login

### Reset Password: `app/(auth)/reset-password/page.tsx`

- New password + confirm password
- This page is loaded via the magic link from Supabase (the URL contains tokens in the hash)
- On mount: call `supabase.auth.onAuthStateChange()` to detect the `PASSWORD_RECOVERY` event
- Submit: `supabase.auth.updateUser({ password: newPassword })`
- On success: redirect to `/login` with a toast "Password updated successfully"

### Auth Callback: `app/(auth)/auth/callback/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
```

---

## 9. ROUTE GROUP: PLATFORM — `app/(platform)/`

### Layout: `app/(platform)/layout.tsx`

This layout wraps ALL authenticated pages. It provides:

**Desktop (≥1024px):**
- Left sidebar (260px width) with:
  - Logo at top
  - Navigation links with Lucide icons: Dashboard, Collection, Search, Forum, Booking, Membership
  - User section at bottom: avatar/initials, name, email, dropdown with "Account Settings" and "Sign Out"
  - Active link highlighted with gold accent and subtle background

**Mobile (<1024px):**
- Top bar with logo (left) and hamburger menu (right)
- Sheet/drawer from left with same navigation links
- Bottom navigation bar with 5 key icons: Home, Collection, Search, Forum, Profile

**Both:**
- Main content area with proper padding
- Fetch the current user's profile on the server side and pass it down via context or props
- "Sign Out" handler calls `supabase.auth.signOut()` then redirects to `/`

### User Context

Create `contexts/user-context.tsx`:
- Provides the current user's profile (from server-side fetch) to all platform components
- Includes subscription status for gating premium features
- Exposes `isAdmin` boolean (check if user_id exists in admin_users OR profile.role === 'admin')

---

## 10. COLLECTION SYSTEM

This is the most important part of the site. It must be **fully dynamic** — driven entirely by the `collections` metadata table.

### `lib/collections/queries.ts`

Utility functions for querying collections:

**`getCollections(supabase, filters?)`**
- Fetches from `collections` table where `is_published = true`
- Optional filters: category, era, region
- Orders by `sort_order`
- Returns `Collection[]`

**`getCollectionBySlug(supabase, slug)`**
- Fetches single collection metadata by slug
- Returns `Collection | null`

**`getCollectionRecords(supabase, collection, options)`**
- Takes a `Collection` object and options: `{ page, pageSize, search, sortBy, sortOrder }`
- Constructs a Supabase query dynamically:
  - `from(collection.table_name)`
  - `select()` — ONLY selects: `id`, `slug` (if exists), the columns listed in `collection.display_columns`, plus `image_path` or `image_url` if `has_images` is true. **NEVER select `*`** for list views. **NEVER select `ocr_text`, `ocr_json`, `tsv`, or `embedding`** for list views.
  - If `collection.discriminator_column` and `collection.discriminator_value` exist, add `.eq(discriminator_column, discriminator_value)`
  - If `search` is provided, build an `.or()` filter across `collection.search_columns` using `ilike.%search%`
  - Pagination: `.range(from, to)` based on page and pageSize
  - Request count: `{ count: 'exact' }`
- Returns `{ data: CollectionRecord[], count: number }`

**`getRecordBySlug(supabase, collection, recordSlug)`**
- Fetches a single record from the collection's table by slug
- For this detail view, select ALL columns including `ocr_text` (it's one record, acceptable)
- If the table doesn't have a `slug` column, fall back to fetching by `id`
- Returns `CollectionRecord | null`

**`getRelatedRecords(supabase, recordId, tableName)`**
- Queries the `related_records` table for records where `source_record_id = recordId` or `target_record_id = recordId`
- Returns `RelatedRecord[]`

### Collections Grid: `app/(platform)/collection/page.tsx`

**Server Component** that fetches all published collections.

- Page heading: "THE ARCHIVE" eyebrow + "Explore the Collections" in Playfair
- **Filter bar** at top: filter by category (dropdown or pill buttons), era, region
  - Categories from the data: census, church-records, military, slave-trade, legal, immigration, property
  - Eras: colonial, revolutionary, antebellum, civil-war, reconstruction
  - Regions: national, international, georgia, virginia, kentucky, alabama, southeast
- **Search input** to filter collections by name (client-side filter is fine, there are only ~40 collections)
- **Grid of collection cards** (responsive: 1 col mobile, 2 col tablet, 3 col desktop)
- Each card shows:
  - Thumbnail image (or a category-based placeholder icon if no thumbnail)
  - Collection name in Playfair
  - Short description
  - Category badge (e.g., "Military", "Census") with category-specific color
  - Era badge
  - Record count (e.g., "1,247 records")
  - Region tag
  - → Click navigates to `/collection/{slug}`

### Collection Browser: `app/(platform)/collection/[collectionSlug]/page.tsx`

**Server Component** with client-side search/pagination interactions.

- Fetch the collection metadata by slug
- If not found, show 404
- Page heading: collection name + short description
- Category, era, region badges
- Record count display

**Search bar:**
- Text input with search icon
- Debounced (300ms) — triggers re-fetch with search param
- Searches across the columns defined in `collection.search_columns`

**Records display — use a responsive table on desktop, cards on mobile:**
- Table headers come from `collection.display_columns` — use the column names, formatted nicely (snake_case → Title Case)
- Each row shows the column values for that record
- If `has_images`: show a small thumbnail in the first column (64x64, use Next.js Image component with blur placeholder)
- Clicking a row navigates to `/collection/{collectionSlug}/{recordSlug}`
- If the record has no slug, use the record's `id` as the URL parameter

**Pagination:**
- 25 records per page
- Show "Page X of Y" with previous/next buttons
- Use URL search params for page state (`?page=2&search=johnson`) so it's bookmarkable

**Loading state:**
- Skeleton cards/rows while data is loading

### Record Detail: `app/(platform)/collection/[collectionSlug]/[recordSlug]/page.tsx`

**Server Component** that fetches a single record.

- Breadcrumb: Collections → {Collection Name} → {Record identifier}
- **Record title** at top: use the most identifying field (e.g., `name`, `soldier_name`, `head_of_family`, `principal_name`, or `slug` as fallback). The choice depends on the collection — check which display_columns exist and pick the first "name-like" one.

**Image viewer (if `has_images`):**
- Full-width image display using Next.js Image with `priority` loading
- The image source is the record's `image_path` or `image_url` field
- Images are stored in Supabase Storage. The full URL pattern is: `{SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}`
- The `image_path` in the data may already be a full URL, or it may be a relative path. Handle both cases.
- Click to open a lightbox/modal with zoom capability (implement with a Dialog component + CSS transform scale)
- If the record has multiple pages (check via `book_no` + adjacent `page_no` values), show prev/next navigation to browse pages

**Data fields:**
- Display ALL non-null fields from the record in a clean two-column key-value layout
- Format field names from snake_case to Title Case (e.g., `place_of_nativity` → "Place of Nativity")
- Skip internal fields: `id`, `created_at`, `updated_at`, `slug`, `image_path`, `image_url`, `ocr_json`, `tsv`

**OCR Text (if exists and `has_ocr`):**
- Show in a styled container with a "Transcription" heading
- If user is on free plan, show a blurred preview with an overlay: "Upgrade to Premium to view full transcriptions"
- If user is on paid plan, show full OCR text in a readable serif font
- Check `profile.subscription_status === 'paid'` from user context

**Bookmark button:**
- Toggle button (heart or bookmark icon) in the top-right area
- On click: insert or delete from `bookmarks` table
- Show filled icon if already bookmarked (check on page load)
- Use optimistic UI (update icon immediately, revert if the request fails)
- When bookmarking, store: `collection_slug`, `record_id` (the record's slug or id), and `record_title` (the display name)

**Related records panel (if any exist):**
- Query `related_records` table for this record
- Show as a sidebar section or bottom section
- Each related record links to its detail page in the appropriate collection
- Show relationship_type and relationship_note if available

### Global Search: `app/(platform)/search/page.tsx`

- Search input at top (auto-focused)
- On submit: call a server action or API route that searches across multiple collections
- The search API should:
  1. Fetch all published collections from the `collections` table
  2. For each collection that has search_columns, run a query with `.or()` across those columns using `ilike`
  3. Limit to 5 results per collection
  4. Return results grouped by collection
- Display results grouped by collection name, each result linking to its detail page
- Show "No results found" empty state if nothing matches
- **Performance note:** For MVP, searching sequentially across collections is fine. For optimization later, create a Supabase function that searches in parallel.

---

## 11. FORUM SYSTEM

Uses the existing `forum_categories`, `forum_threads`, `forum_posts`, `forum_reactions` tables. No schema changes needed.

### Forum Home: `app/(platform)/forum/page.tsx`

- Heading: "Community Forum"
- List of forum categories fetched from `forum_categories` ordered by `sort_order`
- Each category card shows: icon (from the `icon` field — map to Lucide icon names), name, description, thread count (subquery or join), latest thread title + date
- Click navigates to `/forum/{categorySlug}`

### Category View: `app/(platform)/forum/[categorySlug]/page.tsx`

- Fetch category by slug
- "New Thread" button (opens `/forum/new?category={categorySlug}`)
- List of threads in this category, ordered by `is_pinned desc, updated_at desc`
- Each thread shows: title, author (first_name + last_name from profiles join), post count, view count, time ago (using `date-fns formatDistanceToNow`)
- Pinned threads at top with a pin badge
- Locked threads show a lock icon
- Pagination: 20 threads per page

### Thread View: `app/(platform)/forum/thread/[threadSlug]/page.tsx`

**This is the URL structure** — use the thread's `slug` field, which is unique within a category. However, since slugs are only unique per category, you'll need to look up by both the thread slug AND verify the thread exists. The simplest approach: fetch by slug from `forum_threads` (the slug column has a unique constraint on `category_id + slug`, so just fetch by slug and it should work since thread slugs are typically globally unique in practice).

- Thread title + metadata (author, created date, view count)
- Original post content (the thread's `content` field — this is the first "post")
- Reply list from `forum_posts` ordered by `created_at asc`
- Each post shows: author avatar/initials, name, content, timestamp, edit indicator
- **Reactions** under each post: like, helpful, insightful buttons with counts
  - Fetch reactions for all posts in one query: `from('forum_reactions').in('post_id', postIds)`
  - Group by post_id and reaction_type for counts
  - Highlight if current user has reacted
  - Toggle reaction on click (insert/delete from `forum_reactions`)

**Reply editor** at bottom:
- Textarea for reply content
- Submit button
- On submit: insert into `forum_posts` with `thread_id` and `user_id`
- After submit: the post appears immediately (optimistic UI or refetch)
- Only show if thread is not locked

**Increment view count** on page load:
- Call a server action that does `supabase.rpc('increment_view_count', { thread_id })` or a direct update
- Create an RPC function if one doesn't exist:
```sql
create or replace function increment_view_count(thread_id uuid)
returns void as $$
  update forum_threads set view_count = view_count + 1 where id = thread_id;
$$ language sql security definer;
```

### New Thread: `app/(platform)/forum/new/page.tsx`

- Category selector (dropdown, pre-selected if `?category=` param exists)
- Title input
- Content textarea (rich text editor optional — plain textarea for MVP)
- Submit: insert into `forum_threads`, generate slug from title using `slugify`
- Redirect to the new thread page on success

---

## 12. BOOKING SYSTEM

### Booking Page: `app/(platform)/booking/page.tsx`

- Heading: "Book a Research Session"
- **Session type cards:**
  - Define 3-4 session types as constants (these aren't in the DB, define them in code):
    1. "Introductory Consultation" — 30 min, Free
    2. "Family History Research" — 60 min, $75
    3. "Deep Dive Research" — 120 min, $150
    4. "Genetic Genealogy Consultation" — 60 min, $100
  - Adjust pricing/names as appropriate for the business
  - Premium members get a 15% discount badge shown on each card

- **Date picker:**
  - Calendar component (shadcn Calendar)
  - Disable past dates
  - Disable dates that already have bookings at all available times (fetch from `bookings` table: `select date, time from bookings where date >= today`)

- **Time slot picker:**
  - Show available time slots for the selected date
  - Define available slots as constants: 9:00 AM, 10:00 AM, 11:00 AM, 1:00 PM, 2:00 PM, 3:00 PM, 4:00 PM
  - Grey out / disable slots that are already booked on the selected date
  - Highlight selected slot in gold

- **Booking form:**
  - Name (pre-filled from profile)
  - Email (pre-filled from profile)
  - Message/notes (textarea)
  - Selected session type, date, and time shown in a summary card

- **Submit:**
  - Insert into `bookings` table
  - Send confirmation email via Resend (see Section 17)
  - Show success message with booking details
  - For paid sessions: integrate Stripe checkout (create a checkout session, redirect to Stripe, handle the webhook to confirm the booking)
  - For free consultations: just insert directly

---

## 13. MEMBERSHIP & STRIPE

### Membership Page: `app/(platform)/membership/page.tsx`

- Show current plan status at top (fetch from profile.subscription_status)
- If free: show upgrade options
- If paid: show current plan details (interval, next billing date from `subscription_period_end`, cancel status)

**Plan cards (2 options):**
- Premium Monthly: $9/month
- Premium Yearly: $89/year (save ~18%)

**Features list for premium:**
- Full collection access including OCR transcriptions
- Unlimited bookmarks
- All recorded workshops
- 15% booking discount
- Email research support
- Priority forum badge

**"Upgrade" button action:**
1. Call `POST /api/stripe/checkout` with the selected price ID
2. Server creates a Stripe Checkout Session:
   - If the user already has a `stripe_customer_id` in their profile, use it
   - If not, create a new Stripe customer first
   - Set `mode: 'subscription'`
   - Set `success_url` and `cancel_url`
   - Pass `client_reference_id: user.id` for webhook matching
3. Redirect user to Stripe Checkout URL
4. On success, Stripe redirects back to `/membership?success=true`

**"Manage Subscription" button (for paid users):**
- Call `POST /api/stripe/portal` which creates a Stripe Billing Portal session
- Redirect to the portal URL
- Users can cancel, change plan, update payment method there

### `app/api/stripe/checkout/route.ts`

```typescript
// POST: Create a Stripe Checkout Session
// Body: { priceId: string }
// - Fetch user profile to get/create stripe_customer_id
// - Create checkout session with Stripe
// - Return { url: session.url }
```

### `app/api/stripe/webhook/route.ts`

```typescript
// POST: Handle Stripe webhook events
// Verify webhook signature using STRIPE_WEBHOOK_SECRET
// Handle these events:

// checkout.session.completed:
//   - Get user ID from client_reference_id or customer
//   - Update profiles: subscription_status = 'paid', stripe_customer_id, stripe_subscription_id

// customer.subscription.updated:
//   - Update profiles: subscription_interval, subscription_period_start, subscription_period_end, subscription_cancel_at_period_end

// customer.subscription.deleted:
//   - Update profiles: subscription_status = 'free', clear subscription fields

// invoice.payment_failed:
//   - Optional: send email notification, log the event
```

**IMPORTANT:** The webhook route must read the raw body (not parsed JSON) to verify the Stripe signature:
```typescript
const body = await request.text();
const sig = request.headers.get('stripe-signature')!;
const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
```

Use the **admin Supabase client** (service role) in the webhook handler since there's no user session.

---

## 14. MEMBER DASHBOARD

### Dashboard: `app/(platform)/dashboard/page.tsx`

- Greeting: "Welcome back, {first_name}"
- **Quick stats row:** Total bookmarks, Upcoming bookings, Forum posts count

**Bookmarks section:**
- Fetch from `bookmarks` where `user_id = currentUser.id`, ordered by `created_at desc`, limit 10
- Show as a list: record_title, collection_slug (formatted), date saved
- Each links to the record detail page
- "View all bookmarks" link → `/dashboard/bookmarks` (paginated list)
- "Remove" button on each with confirmation

**Upcoming bookings:**
- Fetch from `bookings` where `email = profile.email` and `date >= today`, ordered by date asc
- Show: session type, date, time
- "Book another session" CTA

**Recent forum activity:**
- Fetch recent threads or posts by the current user
- Show title, last activity date

**Account settings section** (or separate page `/dashboard/settings`):
- Edit first name, last name
- Change password (calls `supabase.auth.updateUser({ password })`)
- View subscription status
- Delete account (optional — careful implementation needed)

---

## 15. ADMIN PANEL

### Admin Layout: `app/(admin)/layout.tsx`

- **Server-side role check**: Fetch current user, then check `admin_users` table OR `profiles.role === 'admin'`
- If not admin: redirect to `/dashboard`
- Admin-specific sidebar with: Dashboard, Collections, Forum, Bookings, Users, Orders
- Different color accent to distinguish from user platform (optional)

### Admin Dashboard: `app/(admin)/admin/page.tsx`

- Stats cards: Total users, Total bookings (this month), Total forum threads, Total collection records
- Recent activity feed: new signups, new bookings, new forum posts
- Quick links to common admin tasks

### Admin Collections: `app/(admin)/admin/collections/page.tsx`

- Table of all collections from `collections` table
- Columns: Name, Category, Table Name, Record Count, Published, Access Tier
- Edit button → opens a dialog/modal to edit collection metadata (name, description, category, access_tier, is_published, display_columns, search_columns)
- "Update record counts" button that re-runs the count queries

### Admin Forum: `app/(admin)/admin/forum/page.tsx`

- List of recent threads with moderation actions: Pin/Unpin, Lock/Unlock, Delete
- List of flagged or recent posts with Delete action
- Bulk moderation tools not needed for MVP

### Admin Bookings: `app/(admin)/admin/bookings/page.tsx`

- Table of all bookings, newest first
- Columns: Name, Email, Session Type, Date, Time, Created At
- Filter by date range
- Export to CSV option (optional)

### Admin Users: `app/(admin)/admin/users/page.tsx`

- Table of all profiles
- Columns: Name, Email, Subscription Status, Role, Created At
- Actions: Change role (user/admin), View details
- Search by name or email

### Admin Orders: `app/(admin)/admin/orders/page.tsx`

- Table of all orders with status
- For future use when e-commerce is active
- Show order details, items, payment status

---

## 16. CONTACT FORM & EMAIL

### Contact Form

On the marketing home page, include a contact form section:
- Name, Email, Message fields
- Submit calls `POST /api/contact`

### `app/api/contact/route.ts`

```typescript
// Validate inputs
// Insert into contact_submissions table (if it exists) OR just send email
// Send email via Resend:

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

await resend.emails.send({
  from: 'Reparation Road <noreply@reparationroad.org>',
  to: ['admin@reparationroad.org'],  // or the site owner's email
  subject: `New Contact Form: ${name}`,
  html: `<p><strong>From:</strong> ${name} (${email})</p><p>${message}</p>`,
});
```

### Booking Confirmation Email

When a booking is created, also send a confirmation:

```typescript
await resend.emails.send({
  from: 'Reparation Road <noreply@reparationroad.org>',
  to: [bookingEmail],
  subject: 'Your Research Session is Booked!',
  html: `
    <h2>Booking Confirmed</h2>
    <p>Hi ${bookingName},</p>
    <p>Your ${sessionType} session has been booked for ${date} at ${time}.</p>
    <p>We look forward to helping you discover your history.</p>
    <p>— The Reparation Road Team</p>
  `,
});
```

**NOTE:** Resend requires a verified domain. The `from` address must use a domain verified in the Resend dashboard. If `reparationroad.org` isn't verified yet, use `onboarding@resend.dev` for testing.

---

## 17. SEO & METADATA

### Root Metadata: `app/layout.tsx`

```typescript
export const metadata: Metadata = {
  metadataBase: new URL('https://reparationroad.org'),
  title: {
    default: 'Reparation Road — Restoring History Through Research and Advocacy',
    template: '%s | Reparation Road',
  },
  description: 'A cultural and historical resource dedicated to uncovering Black history and empowering communities through research, education, and digital preservation.',
  keywords: ['Black history', 'genealogy', 'family research', 'historical records', 'slavery records', 'African American history', 'digital archive'],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://reparationroad.org',
    siteName: 'Reparation Road',
    title: 'Reparation Road — Restoring History Through Research and Advocacy',
    description: 'Uncovering Black history and empowering communities through research and education.',
    // images: [{ url: '/og-image.jpg', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Reparation Road',
    description: 'Restoring history through research and advocacy.',
  },
  robots: { index: true, follow: true },
};
```

### Per-Page Metadata

Each major page should export its own `metadata` or `generateMetadata`:

- Collection pages: `generateMetadata` that includes the collection name and description
- Record detail pages: include the record's identifying info in the title
- Forum thread pages: include thread title

### Sitemap: `app/sitemap.ts`

```typescript
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static pages
  const staticPages = ['', '/about'].map(path => ({
    url: `https://reparationroad.org${path}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: path === '' ? 1 : 0.8,
  }));

  // Collection pages
  const supabase = createAdminClient();
  const { data: collections } = await supabase
    .from('collections')
    .select('slug')
    .eq('is_published', true);

  const collectionPages = (collections || []).map(c => ({
    url: `https://reparationroad.org/collection/${c.slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  return [...staticPages, ...collectionPages];
}
```

### `robots.ts`

```typescript
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin/', '/dashboard/', '/api/'] },
    sitemap: 'https://reparationroad.org/sitemap.xml',
  };
}
```

---

## 18. DEPLOYMENT CONFIGURATION

### Vercel Configuration

- Connect the GitHub repo to Vercel
- Set all environment variables in Vercel dashboard
- Set the Stripe webhook endpoint to `https://reparationroad.org/api/stripe/webhook`
- Framework preset: Next.js (auto-detected)

### Image Optimization

All collection images served from Supabase Storage will go through Next.js Image Optimization automatically since we configured `remotePatterns` in `next.config.ts`. This converts images to WebP/AVIF on the fly.

### Domain

- Set custom domain `reparationroad.org` in Vercel
- Update DNS records as instructed by Vercel
- Verify SSL certificate

---

## 19. DESIGN REFERENCE — CRITICAL STYLING DETAILS

This section ensures visual consistency across ALL pages. Reference this when building any component.

### Color Usage

- **Page backgrounds:** `bg-brand-bg` (#0F0D0B) — never pure black
- **Card backgrounds:** `bg-brand-card` (#1C1917) with `border border-brand-gold/[0.08]`
- **Card hover:** border color shifts to `border-brand-gold/[0.25]`, subtle translateY(-2px), deeper shadow
- **Primary text:** `text-brand-cream` (#F5F0E8) — never pure white
- **Secondary text:** `text-brand-muted` (#A8A29E)
- **Accent/links:** `text-brand-gold` (#C8956C)
- **Buttons primary:** `bg-brand-gold text-brand-bg` — hover: `bg-brand-gold-light`, lift effect
- **Buttons secondary:** `border border-brand-gold/30 text-brand-cream bg-transparent` — hover: border brightens, subtle bg fill
- **Badges:** semi-transparent backgrounds with matching text (e.g., `bg-brand-gold/10 text-brand-gold`)
- **Form inputs:** `bg-brand-card border-brand-gold/[0.15]` — focus: `border-brand-gold ring-1 ring-brand-gold/20`
- **Dividers/borders:** `border-brand-gold/[0.08]` or `border-brand-gold/[0.1]`

### Typography

- **Page titles:** `font-display text-4xl md:text-5xl font-semibold tracking-tight text-brand-cream`
- **Section headings:** `font-display text-3xl font-semibold text-brand-cream`
- **Eyebrow labels:** `font-body text-xs font-semibold tracking-widest uppercase text-brand-gold`
- **Card titles:** `font-display text-xl font-semibold text-brand-cream`
- **Body text:** `font-body text-base text-brand-muted leading-relaxed`
- **Small/meta text:** `font-body text-sm text-brand-muted`
- **NEVER use Inter, Roboto, Arial, or system fonts** — always Playfair Display for headings and DM Sans for body

### Spacing & Layout

- **Section padding:** `py-24 px-6` on mobile, `py-28 px-8` on desktop
- **Max content width:** `max-w-7xl mx-auto` (1280px)
- **Card padding:** `p-6` minimum, `p-8` for larger cards
- **Grid gaps:** `gap-5` for card grids, `gap-8` for larger sections
- **Card border radius:** `rounded-2xl` (16px)
- **Button border radius:** `rounded-xl` (12px)

### Animations & Interactions

- **Scroll-triggered fade-ins:** Use Intersection Observer to add `opacity-0 translate-y-4` → `opacity-100 translate-y-0` with `transition-all duration-700`
- **Staggered delays:** When multiple items appear together, stagger by 80ms each
- **Hover lift:** `hover:-translate-y-1 transition-transform duration-200`
- **Link arrows:** gap increases on hover (`hover:gap-3.5 transition-[gap] duration-200`)
- **Focus rings:** `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold/50`
- **Loading skeletons:** Use shadcn Skeleton component with brand-card background

### Mobile-First Principles

- **ALL layouts start mobile, scale up** — use `md:` and `lg:` prefixes for desktop enhancements
- **Touch targets:** minimum 44x44px for all interactive elements
- **Navigation:** bottom tab bar on mobile, sidebar on desktop
- **Tables → Cards:** collection data shows as a table on desktop (≥1024px) but as stacked cards on mobile
- **Font sizes scale:** use `text-2xl md:text-4xl lg:text-5xl` pattern for headings
- **Images:** always use `sizes` prop on Next.js Image for responsive sizing

---

## 20. FILE STRUCTURE SUMMARY

```
reparation-road/
├── app/
│   ├── (marketing)/
│   │   ├── layout.tsx              # Marketing nav + footer
│   │   ├── page.tsx                # Home page
│   │   └── about/
│   │       └── page.tsx            # About page
│   │
│   ├── (auth)/
│   │   ├── layout.tsx              # Centered card layout
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   ├── reset-password/page.tsx
│   │   └── auth/
│   │       └── callback/route.ts
│   │
│   ├── (platform)/
│   │   ├── layout.tsx              # Sidebar + topbar layout
│   │   ├── collection/
│   │   │   ├── page.tsx            # Collections grid
│   │   │   └── [collectionSlug]/
│   │   │       ├── page.tsx        # Collection browser
│   │   │       └── [recordSlug]/
│   │   │           └── page.tsx    # Record detail
│   │   ├── search/
│   │   │   └── page.tsx            # Global search
│   │   ├── forum/
│   │   │   ├── page.tsx            # Forum categories
│   │   │   ├── [categorySlug]/
│   │   │   │   └── page.tsx        # Thread list
│   │   │   ├── thread/
│   │   │   │   └── [threadSlug]/
│   │   │   │       └── page.tsx    # Thread detail
│   │   │   └── new/
│   │   │       └── page.tsx        # New thread
│   │   ├── booking/
│   │   │   └── page.tsx
│   │   ├── membership/
│   │   │   └── page.tsx
│   │   └── dashboard/
│   │       ├── page.tsx            # Dashboard home
│   │       ├── bookmarks/
│   │       │   └── page.tsx        # All bookmarks
│   │       └── settings/
│   │           └── page.tsx        # Account settings
│   │
│   ├── (admin)/
│   │   └── admin/
│   │       ├── layout.tsx          # Admin layout + role check
│   │       ├── page.tsx            # Admin dashboard
│   │       ├── collections/page.tsx
│   │       ├── forum/page.tsx
│   │       ├── bookings/page.tsx
│   │       ├── users/page.tsx
│   │       └── orders/page.tsx
│   │
│   ├── api/
│   │   ├── stripe/
│   │   │   ├── checkout/route.ts
│   │   │   ├── webhook/route.ts
│   │   │   └── portal/route.ts
│   │   ├── contact/route.ts
│   │   └── search/route.ts
│   │
│   ├── layout.tsx                  # Root layout
│   ├── globals.css
│   ├── not-found.tsx               # Custom 404
│   ├── error.tsx                   # Custom error page
│   ├── loading.tsx                 # Root loading
│   ├── sitemap.ts
│   └── robots.ts
│
├── components/
│   ├── ui/                         # shadcn components (auto-generated)
│   ├── layout/
│   │   ├── marketing-nav.tsx
│   │   ├── platform-sidebar.tsx
│   │   ├── mobile-bottom-nav.tsx
│   │   ├── admin-sidebar.tsx
│   │   └── footer.tsx
│   ├── collection/
│   │   ├── collection-card.tsx
│   │   ├── collection-grid.tsx
│   │   ├── collection-filters.tsx
│   │   ├── record-table.tsx
│   │   ├── record-card.tsx
│   │   ├── record-detail-fields.tsx
│   │   ├── image-viewer.tsx
│   │   ├── ocr-display.tsx
│   │   ├── bookmark-button.tsx
│   │   └── related-records.tsx
│   ├── forum/
│   │   ├── category-card.tsx
│   │   ├── thread-list-item.tsx
│   │   ├── post-card.tsx
│   │   ├── post-editor.tsx
│   │   └── reaction-bar.tsx
│   ├── booking/
│   │   ├── session-type-card.tsx
│   │   ├── time-slot-picker.tsx
│   │   └── booking-form.tsx
│   ├── membership/
│   │   ├── plan-card.tsx
│   │   └── current-plan-banner.tsx
│   ├── dashboard/
│   │   ├── stats-cards.tsx
│   │   ├── bookmark-list.tsx
│   │   └── upcoming-bookings.tsx
│   └── shared/
│       ├── page-header.tsx         # Reusable eyebrow + title + description
│       ├── empty-state.tsx
│       ├── loading-skeleton.tsx
│       ├── search-input.tsx
│       ├── pagination-controls.tsx
│       └── badge-pill.tsx
│
├── contexts/
│   └── user-context.tsx
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   ├── admin.ts
│   │   └── middleware.ts
│   ├── collections/
│   │   ├── queries.ts
│   │   └── helpers.ts              # Column name formatting, image URL building
│   ├── stripe/
│   │   └── client.ts               # Stripe instance
│   ├── types/
│   │   └── index.ts
│   ├── utils/
│   │   ├── cn.ts                   # clsx + tailwind-merge
│   │   └── format.ts               # Date formatting, number formatting
│   └── constants.ts                # Session types, navigation items, etc.
│
├── middleware.ts
├── next.config.ts
├── tailwind.config.js
├── tsconfig.json
├── package.json
└── .env.local
```

---

## 21. BUILD ORDER

Claude Code should build in this exact order, testing each piece before moving on:

1. **Project scaffold** — init, install deps, configure Tailwind + shadcn + fonts
2. **Supabase clients** — all 4 files in `lib/supabase/`
3. **Types** — `lib/types/index.ts`
4. **Middleware** — `middleware.ts`
5. **Root layout + globals.css** — dark theme, fonts, CSS variables
6. **Auth pages** — login, signup, forgot-password, reset-password, callback
7. **Marketing layout** — nav + footer components
8. **Home page** — all sections (hero, stats, services, mission, membership preview, CTA)
9. **About page**
10. **Platform layout** — sidebar, mobile nav, user context
11. **Dashboard** — basic page with greeting and stats
12. **Collection grid** — fetch from collections table, display cards with filters
13. **Collection browser** — dynamic record table with search + pagination
14. **Record detail** — fields, image viewer, OCR, bookmarks, related records
15. **Global search** — cross-collection search page
16. **Forum** — categories, threads, thread detail with posts + reactions, new thread
17. **Booking** — session types, date picker, time slots, form, email confirmation
18. **Membership + Stripe** — checkout, webhook, portal, plan display
19. **Admin panel** — all admin pages
20. **SEO** — metadata, sitemap, robots
21. **Polish** — 404 page, error page, loading states, mobile QA

---

## 22. KEY RULES FOR CLAUDE CODE

1. **NEVER use `select('*')` on collection tables for list views.** Always specify exact columns needed. The only exception is fetching a single record for the detail page.

2. **ALWAYS use Next.js `<Image>` component** for any image from Supabase Storage. Set appropriate `width`, `height`, and `sizes` props.

3. **ALWAYS use Server Components by default.** Only add `'use client'` when you need interactivity (forms, search inputs, toggles, animations). Keep data fetching on the server.

4. **ALWAYS handle loading and error states.** Every page that fetches data should have a loading skeleton and an error fallback.

5. **ALWAYS use the Supabase server client** in Server Components and Route Handlers. Use the browser client ONLY in Client Components.

6. **ALWAYS use the admin client (service role)** in webhook handlers and admin operations that bypass RLS.

7. **The collection system must be 100% dynamic.** Adding a new collection should require ZERO code changes — only a new row in the `collections` table.

8. **Mobile-first.** Build mobile layout first, then enhance for desktop. Test at 375px width minimum.

9. **Follow the design tokens exactly.** Use the brand colors, fonts, and spacing defined in this document. No Inter, no Roboto, no purple gradients, no generic AI aesthetics.

10. **Keep components modular.** Each component in `/components/` should do one thing well and be reusable.

11. **Paginate EVERYTHING that could have more than 25 rows.** Collections, forum threads, bookmarks, admin tables — all paginated.

12. **Use URL search params for state** (page number, search query, filters). This makes pages bookmarkable and shareable.

13. **Optimize images from Supabase Storage.** Many image_path values may be relative paths. Build a helper function that constructs the full URL: `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`. Some records may already have full URLs — handle both cases.

14. **Handle the `enslaver_family` column carefully.** The va-personal-chesterfield source had nullable enslaver_family — the migration uses `coalesce(enslaver_family, 'Unknown')`. The consolidated table has `enslaver_family text` (nullable). Display "Unknown" in the UI if null.

15. **The forum_threads slug is unique per category** (composite unique on `category_id + slug`). When linking to threads, the URL is `/forum/thread/{threadSlug}`. If slugs could collide across categories, use the thread `id` in the URL instead.
