'use client';

import { useEffect } from 'react';
import { trackActivity, type ActivityItem } from '@/lib/hooks/use-activity';

type Props = Omit<ActivityItem, 'timestamp'>;

export function ActivityTracker(props: Props) {
  useEffect(() => {
    trackActivity(props);
  }, [props.type, props.slug]);

  return null;
}
