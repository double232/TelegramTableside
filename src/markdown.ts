/**
 * Convert standard markdown to Telegram's HTML parse_mode subset.
 *
 * Why HTML over MarkdownV2: Telegram's MarkdownV2 requires escaping every
 * `. - ( ) | { } ! # + =` in non-formatting positions. One missed escape
 * returns HTTP 400 and the message is silently dropped. HTML's escape set
 * is just `< > &` -- much harder to get wrong.
 *
 * Supported source patterns:
 *   **bold**                  -> <b>bold</b>
 *   `inline code`             -> <code>inline code</code>
 *   ```fenced code```         -> <pre>fenced code</pre>
 *   [text](url)               -> <a href="url">text</a>
 *   ~~strike~~                -> <s>strike</s>
 *   ## Header / # Header      -> <b>Header</b>   (Telegram HTML has no <h*>)
 *
 * Code and pre regions are extracted into placeholders BEFORE further
 * substitution, so backticks/asterisks inside a fenced block stay literal.
 */
export function markdownToTelegramHtml(input: string): string {
  let s = input

  // Step 1: HTML-escape special chars first; the markdown tags we inject
  // are then trusted as literal HTML.
  s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // Step 2: Extract code blocks into opaque placeholders so later regexes
  // don't reach inside them.
  const placeholders: string[] = []
  const ph = (html: string): string => {
    const idx = placeholders.length
    placeholders.push(html)
    return `\x00TTPH${idx}\x00`
  }

  s = s.replace(/```([\s\S]*?)```/g, (_, code: string) => ph(`<pre>${code}</pre>`))
  s = s.replace(/`([^`\n]+)`/g, (_, code: string) => ph(`<code>${code}</code>`))

  // Step 3: Inline formatting.
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_, txt: string, url: string) => `<a href="${url}">${txt}</a>`)
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, (_, t: string) => `<b>${t}</b>`)
  s = s.replace(/~~([^~\n]+?)~~/g, (_, t: string) => `<s>${t}</s>`)
  s = s.replace(/^#{1,6}\s+(.+)$/gm, (_, t: string) => `<b>${t}</b>`)

  // Step 4: Restore code/pre placeholders.
  s = s.replace(/\x00TTPH(\d+)\x00/g, (_, idx: string) => placeholders[Number(idx)])

  return s
}
