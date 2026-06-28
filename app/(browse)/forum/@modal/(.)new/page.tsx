import { ModalShell } from '@/components/forum/modal-shell';
import { PostComposer } from '@/components/forum/post-composer';

// Intercepts /forum/new when navigated to from within the forum, showing the
// composer as a modal over the feed.
export default function NewPostModal() {
  return (
    <ModalShell title="Create a post">
      <PostComposer inModal />
    </ModalShell>
  );
}
