// Derived achievement badges — computed from activity, no extra table needed.

export interface Badge {
  key: string;
  label: string;
  description: string;
}

export interface BadgeStats {
  karma: number;
  threadCount: number;
  findCount: number;
  hasInterests: boolean;
}

export function deriveBadges(stats: BadgeStats): Badge[] {
  const badges: Badge[] = [];

  if (stats.threadCount === 0) {
    badges.push({ key: 'newcomer', label: 'Newcomer', description: 'Welcome to the community' });
  }
  if (stats.findCount >= 1) {
    badges.push({ key: 'first-find', label: 'First Find', description: 'Shared a discovery from the archive' });
  }
  if (stats.findCount >= 5) {
    badges.push({ key: 'archivist', label: 'Archivist', description: 'Shared five or more finds' });
  }
  if (stats.hasInterests) {
    badges.push({ key: 'researcher', label: 'Researcher', description: 'Listed research surnames or regions' });
  }
  if (stats.karma >= 5) {
    badges.push({ key: 'helpful', label: 'Helpful', description: 'Earned 5+ upvotes from the community' });
  }
  if (stats.karma >= 20) {
    badges.push({ key: 'pillar', label: 'Community Pillar', description: 'Earned 20+ upvotes' });
  }
  if (stats.threadCount >= 10) {
    badges.push({ key: 'contributor', label: 'Contributor', description: 'Started ten or more threads' });
  }

  return badges;
}
