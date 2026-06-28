// Who may see and use the family-tree feature. It's intentionally limited while
// the feature is in private testing: any admin account, plus a small allowlist
// of individual emails. Safe to import from both server and client code.
const ALLOWED_EMAILS = ['kbandison@gmail.com'];

export function canUseFamilyTree(
  profile: { role?: string | null; email?: string | null } | null | undefined,
): boolean {
  if (!profile) return false;
  if (profile.role === 'admin') return true;
  return !!profile.email && ALLOWED_EMAILS.includes(profile.email.toLowerCase());
}
