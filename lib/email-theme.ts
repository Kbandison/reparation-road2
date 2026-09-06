/**
 * Shared palette and frame for every branded email.
 *
 * The site is dark; the emails are light. That is deliberate — an inbox is a
 * light surface by default, and a dark card dropped into it reads as an
 * advertisement rather than correspondence. The brand gold carries the identity
 * across instead of the background colour.
 *
 * Kept in one module because these templates live in three different files and
 * had already started to drift.
 */

export const EMAIL = {
  /** Outer canvas, behind the card. */
  pageBg: '#EFE9DE',
  /** The card itself. */
  cardBg: '#FBF7F0',
  border: '#E0D2BC',
  rule: '#E4D8C4',

  /**
   * Brand gold darkened for legibility. #C8956C is the on-screen gold, but at
   * roughly 2:1 against a cream card it is unreadable as text — this holds the
   * same hue at ~6:1.
   */
  heading: '#8A5A2B',
  link: '#8A5A2B',

  text: '#2B2622',
  strong: '#1C1917',
  muted: '#6B6259',
  faint: '#857C73',

  /** The on-screen gold works as a button fill with dark text on top. */
  buttonBg: '#C8956C',
  buttonText: '#1C1917',
} as const;

/**
 * Wrap body content in the branded card.
 *
 * Emits a full document rather than a fragment so the colour-scheme meta tags
 * are present: without them, Gmail and Outlook dark modes may invert a light
 * email and produce colour pairings nobody designed.
 */
export function emailShell(body: string, footer: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
  </head>
  <body style="margin: 0; padding: 0; background-color: ${EMAIL.pageBg};">
    <div style="background-color: ${EMAIL.pageBg}; padding: 32px 16px;">
      <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: ${EMAIL.cardBg}; border: 1px solid ${EMAIL.border}; padding: 32px; border-radius: 16px;">
          ${body}
          <div style="border-top: 1px solid ${EMAIL.rule}; margin-top: 32px; padding-top: 20px;">
            ${footer}
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

/** Primary call-to-action button. */
export function emailButton(href: string, label: string): string {
  return `<p style="margin: 28px 0;">
    <a href="${href}" style="background-color: ${EMAIL.buttonBg}; color: ${EMAIL.buttonText}; font-size: 15px; font-weight: bold; text-decoration: none; padding: 13px 26px; border-radius: 12px; display: inline-block;">
      ${label}
    </a>
  </p>`;
}

/** The sign-off used at the foot of every branded email. */
export function emailSignoff(siteUrl: string): string {
  return `<p style="color: ${EMAIL.muted}; font-size: 12px; margin: 0;">
    &mdash; The Reparation Road Team<br/>
    <a href="${siteUrl}" style="color: ${EMAIL.link}; text-decoration: none;">reparationroad.org</a>
  </p>`;
}
