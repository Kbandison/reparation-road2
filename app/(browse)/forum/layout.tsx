// Adds a parallel `@modal` slot over the forum routes so that opening a post or
// the composer from the feed renders in a Facebook-style modal (via the
// intercepting routes in `@modal/`), while a direct visit or refresh renders
// the full standalone page.
export default function ForumLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
