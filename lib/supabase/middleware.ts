import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });

          // Clear old chunked auth cookies from the response to prevent header bloat
          const authCookieNames = new Set(cookiesToSet.map(({ name }) => name));
          request.cookies.getAll().forEach(({ name }) => {
            // Remove old chunked cookies (e.g., sb-xxx-auth-token.0, .1, .2, etc.)
            // that are NOT being set in this response
            if (
              !authCookieNames.has(name) &&
              name.includes('-auth-token') &&
              /\.\d+$/.test(name)
            ) {
              supabaseResponse.cookies.set(name, '', { maxAge: 0 });
            }
          });

          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const protectedPaths = ['/dashboard', '/admin'];
  const isProtected = protectedPaths.some(path => request.nextUrl.pathname.startsWith(path));

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  const authPaths = ['/login', '/signup'];
  const isAuthPage = authPaths.some(path => request.nextUrl.pathname === path);

  if (isAuthPage && user) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
