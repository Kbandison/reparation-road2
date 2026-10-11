/** Marks a name search result that matched as a variant: "Similar spelling" or "Nickname". */
export function NameVariantBadge({ label }: { label: string }) {
  return (
    <span className="shrink-0 rounded-full bg-brand-gold/10 px-1.5 py-px text-[10px] text-brand-gold">{label}</span>
  );
}
