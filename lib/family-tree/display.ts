import type { TreeIndividual } from '@/lib/types';

type NameParts = Pick<TreeIndividual, 'given_name' | 'surname'>;

export function fullName(p: NameParts): string {
  return [p.given_name, p.surname].filter((s) => s && s.trim()).join(' ').trim();
}

export function initials(p: NameParts): string {
  const g = p.given_name?.trim()?.[0] ?? '';
  const s = p.surname?.trim()?.[0] ?? '';
  const out = `${g}${s}`.toUpperCase();
  return out || '?';
}

// "1840–1902", "b. 1840", "d. 1902", or "" when nothing is known.
export function lifespan(
  p: Pick<TreeIndividual, 'birth_date' | 'death_date'>
): string {
  const b = p.birth_date?.trim();
  const d = p.death_date?.trim();
  if (b && d) return `${b}–${d}`;
  if (b) return `b. ${b}`;
  if (d) return `d. ${d}`;
  return '';
}
