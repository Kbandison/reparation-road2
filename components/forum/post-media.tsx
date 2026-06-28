import Link from 'next/link';
import { FileText, Repeat2 } from 'lucide-react';
import type { ForumAttachedRecord, ForumSharedThread } from '@/lib/types';

interface PostMediaProps {
  images?: string[] | null;
  // When set, clicking any image navigates here (used in the feed to open the
  // post). When omitted, images open full-size in a new tab (used in the thread).
  href?: string;
}

// A single image tile. Links to the post (feed) or opens full-size (thread).
function MediaTile({
  href,
  url,
  imgClass,
  tileClass,
  overlay,
}: {
  href?: string;
  url: string;
  imgClass: string;
  tileClass?: string;
  overlay?: React.ReactNode;
}) {
  const inner = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className={imgClass} loading="lazy" />
      {overlay}
    </>
  );
  const cls = `block overflow-hidden ${overlay ? 'relative ' : ''}${tileClass ?? ''}`;
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <a href={url} target="_blank" rel="noopener noreferrer" className={cls}>
      {inner}
    </a>
  );
}

const WRAP = 'rounded-xl overflow-hidden border border-brand-gold/10 bg-brand-bg';

// Large, Facebook-style image block. One image is shown big; multiples collage
// into a grid. Images dominate the post so a "Share a Find" reads visually.
export function PostMedia({ images, href }: PostMediaProps) {
  const imgs = (images ?? []).filter(Boolean);
  if (imgs.length === 0) return null;

  if (imgs.length === 1) {
    return (
      <div className={WRAP}>
        <MediaTile href={href} url={imgs[0]} imgClass="w-full max-h-[560px] object-cover" />
      </div>
    );
  }

  if (imgs.length === 2) {
    return (
      <div className={`grid grid-cols-2 gap-1 ${WRAP}`}>
        {imgs.map((u, i) => (
          <MediaTile key={i} href={href} url={u} imgClass="w-full h-72 object-cover" />
        ))}
      </div>
    );
  }

  if (imgs.length === 3) {
    return (
      <div className={`grid grid-cols-2 gap-1 ${WRAP}`}>
        <MediaTile href={href} url={imgs[0]} imgClass="w-full h-80 object-cover" tileClass="col-span-2" />
        <MediaTile href={href} url={imgs[1]} imgClass="w-full h-44 object-cover" />
        <MediaTile href={href} url={imgs[2]} imgClass="w-full h-44 object-cover" />
      </div>
    );
  }

  // 4+: a 2x2 grid; the last tile shows a "+N" overlay when there are more.
  const shown = imgs.slice(0, 4);
  const extra = imgs.length - 4;
  return (
    <div className={`grid grid-cols-2 gap-1 ${WRAP}`}>
      {shown.map((u, i) => (
        <MediaTile
          key={i}
          href={href}
          url={u}
          imgClass="w-full h-52 object-cover"
          overlay={
            i === 3 && extra > 0 ? (
              <span className="absolute inset-0 bg-black/55 flex items-center justify-center text-brand-cream text-lg font-semibold">
                +{extra}
              </span>
            ) : undefined
          }
        />
      ))}
    </div>
  );
}

// The "Share a Find" archive record link, shown beneath a post's media.
export function AttachedRecordCard({ record }: { record?: ForumAttachedRecord | null }) {
  if (!record) return null;
  return (
    <Link
      href={`/collection/${record.collection_slug}?record=${encodeURIComponent(record.record_id)}`}
      className="flex items-center gap-3 rounded-xl border border-brand-gold/20 bg-brand-bg/50 px-3 py-2.5 hover:border-brand-gold/40 transition-colors"
    >
      <div className="w-9 h-9 rounded-lg bg-brand-gold/10 flex items-center justify-center shrink-0">
        <FileText className="w-4 h-4 text-brand-gold" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-brand-muted">Archive record</p>
        <p className="text-sm text-brand-cream truncate">{record.title}</p>
      </div>
    </Link>
  );
}

// A reposted thread, shown as an embedded quote (the internal "Share to your
// feed"). Links to the original post.
export function SharedThreadCard({ shared }: { shared?: ForumSharedThread | null }) {
  if (!shared) return null;
  return (
    <Link
      href={`/forum/thread/${shared.slug}`}
      className="block rounded-xl border border-brand-gold/15 bg-brand-bg/40 p-3 hover:border-brand-gold/35 transition-colors"
    >
      <p className="text-[11px] uppercase tracking-wide text-brand-muted inline-flex items-center gap-1 mb-1">
        <Repeat2 className="w-3 h-3 text-brand-gold" /> Shared post
      </p>
      <p className="text-sm font-medium text-brand-cream line-clamp-2">{shared.title}</p>
      {shared.author && <p className="text-xs text-brand-muted mt-0.5">by {shared.author}</p>}
    </Link>
  );
}
