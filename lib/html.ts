/** Escapes text for HTML element content and double-quoted attribute values. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Plain text as HTML: escaped, with its line breaks kept. */
export function textToHtml(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br/>');
}
