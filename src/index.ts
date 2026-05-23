/**
 * TelegramTableside -- pretty markdown rendering for Telegram bots,
 * including inline markdown pipe tables as PNG attachments.
 *
 * Telegram's HTML parse_mode supports <b>/<i>/<code>/<pre>/<a>/<s>/<u>/
 * <blockquote> but NOT <table>. And only `sendPhoto` renders true inline
 * content (no tap-to-open) -- documents, voice notes, PDFs all require a
 * tap. So tables get rendered to PNG and sent via sendPhoto, surrounding
 * text stays HTML and goes through sendMessage.
 *
 *   import { prettifyForTelegram } from 'telegramtableside'
 *
 *   const segments = await prettifyForTelegram(modelOutput)
 *   for (const seg of segments) {
 *     if (seg.kind === 'html') {
 *       await bot.api.sendMessage(chat_id, seg.html, { parse_mode: 'HTML' })
 *     } else {
 *       await bot.api.sendPhoto(chat_id, new InputFile(seg.png, seg.name))
 *     }
 *   }
 *
 * The chat ends up showing text -> inline table image -> text in order,
 * with each segment rendering immediately (no taps required).
 */
import { markdownToTelegramHtml } from './markdown'
import { splitOnTables, tableToPng } from './table'

export { markdownToTelegramHtml } from './markdown'
export {
  splitOnTables,
  tableToSvg,
  tableSvgToPng,
  tableToPng,
  defaultStyle,
  type TableData,
  type TableStyleOpts,
  type SourceSegment,
} from './table'

export type RenderedSegment =
  | { kind: 'html'; html: string }
  | { kind: 'png'; png: Buffer; name: string }

/**
 * Walk source markdown and produce a send-ready segment stream. Iterate
 * and dispatch each segment to Telegram in order.
 */
export function prettifyForTelegram(input: string): RenderedSegment[] {
  const segments = splitOnTables(input)
  const out: RenderedSegment[] = []
  let tableIdx = 0
  for (const seg of segments) {
    if (seg.kind === 'text') {
      const html = markdownToTelegramHtml(seg.content.trim())
      if (html) out.push({ kind: 'html', html })
    } else {
      tableIdx++
      const png = tableToPng(seg.data)
      out.push({ kind: 'png', png, name: `table-${tableIdx}.png` })
    }
  }
  return out
}
