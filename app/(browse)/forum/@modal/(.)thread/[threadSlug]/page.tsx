import { ModalShell } from '@/components/forum/modal-shell';
import { ThreadView } from '@/components/forum/thread-view';

interface Props {
  params: Promise<{ threadSlug: string }>;
}

// Intercepts /forum/thread/[slug] when navigated to from within the forum,
// showing the post as a modal over the feed.
export default async function ThreadModal({ params }: Props) {
  const { threadSlug } = await params;
  return (
    <ModalShell title="Post">
      <ThreadView slug={threadSlug} inModal />
    </ModalShell>
  );
}
