const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export function buildImageUrl(imagePath: string | null | undefined): string | null {
  if (!imagePath) return null;
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${imagePath}`;
}

export function getRecordTitle(record: Record<string, unknown>, displayColumns: string[]): string {
  const nameFields = ['name', 'soldier_name', 'head_of_family', 'principal_name', 'full_name', 'person_name', 'child', 'recipient_name', 'enslaver', 'enslaved_person', 'by_whom_enslaved', 'enslaver_family', 'to_whom_sold'];
  for (const field of nameFields) {
    if (record[field] && typeof record[field] === 'string') {
      return record[field] as string;
    }
  }
  for (const col of displayColumns) {
    if (record[col] && typeof record[col] === 'string') {
      return record[col] as string;
    }
  }
  return (record.slug as string) || (record.id as string) || 'Untitled';
}

export function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    census: 'bg-brand-gold/10 text-brand-gold',
    'church-records': 'bg-brand-sage/10 text-brand-sage',
    military: 'bg-brand-burgundy/10 text-brand-burgundy-light',
    'slave-trade': 'bg-red-500/10 text-red-400',
    legal: 'bg-blue-500/10 text-blue-400',
    immigration: 'bg-teal-500/10 text-teal-400',
    property: 'bg-amber-500/10 text-amber-400',
  };
  return colors[category] || 'bg-brand-muted/10 text-brand-muted';
}
