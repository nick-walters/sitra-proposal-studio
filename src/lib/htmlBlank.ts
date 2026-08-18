/**
 * Client-side twin of the database's `card_html_is_blank()`: true when the
 * markup carries no visible characters at all.
 */
export function isHtmlBlank(html: string | null | undefined): boolean {
  return (html ?? '').replace(/<[^>]*>|&nbsp;|\s/g, '') === '';
}
