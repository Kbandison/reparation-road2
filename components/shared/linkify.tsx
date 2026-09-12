import { Fragment } from 'react';

/**
 * Turn URLs inside imported text into links.
 *
 * GEDCOM files carry them in free-text fields — event notes, source
 * repositories, citation text — where they arrive as plain characters. Before
 * this they rendered as unclickable text, which on a FamilySearch ark link is
 * the difference between a citation and a string nobody will retype.
 *
 * Built by splitting the string and rendering anchors as React elements, not by
 * injecting HTML. The text is imported from files the site does not control, so
 * it must never be interpreted as markup.
 */

// Bare www. is included because that is how repositories are usually written
// ("www.newspapers.com"), and trailing punctuation is excluded so a link at the
// end of a sentence does not swallow the full stop.
const URL_RE = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;

/**
 * Strip punctuation that belongs to the sentence, not the URL.
 *
 * A bracket is kept only when the URL opened one itself — Wikipedia-style
 * links really do end in ")", but "(see www.example.com)." does not.
 */
function trimTrailing(raw: string): { url: string; trailing: string } {
  const PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  let url = raw;
  let trailing = '';

  while (url.length > 1) {
    const last = url[url.length - 1];
    if (!'.,;:!?\'"' .includes(last) && !(last in PAIRS)) break;

    if (last in PAIRS) {
      const opens = url.split(PAIRS[last]).length - 1;
      const closes = url.split(last).length - 1;
      if (opens >= closes) break;
    }

    trailing = last + trailing;
    url = url.slice(0, -1);
  }

  return { url, trailing };
}

export function Linkify({ text, className }: { text: string; className?: string }) {
  const parts = text.split(URL_RE);

  return (
    <>
      {parts.map((part, i) => {
        // Odd indices are the captured URLs.
        if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;

        const { url, trailing } = trimTrailing(part);
        const href = url.startsWith('http') ? url : `https://${url}`;

        return (
          <Fragment key={i}>
            <a
              href={href}
              target="_blank"
              // noreferrer and nofollow because these point wherever a
              // stranger's GEDCOM file happened to point.
              rel="noopener noreferrer nofollow"
              className={className ?? 'text-brand-gold hover:underline break-words'}
            >
              {url}
            </a>
            {trailing}
          </Fragment>
        );
      })}
    </>
  );
}
