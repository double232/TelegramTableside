/**
 * Detect markdown pipe tables and render each one to a tightly-cropped PNG.
 *
 * Why PNG (not PDF): Telegram only renders true inline rich content for
 * `sendPhoto`. `sendDocument` (the PDF path) shows a thumbnail tile that
 * the user has to tap to open -- that fails the inline-rendering goal.
 *
 * The chat flow ends up showing: text -> [inline PNG of table] -> text,
 * with the PNG visible without any tap. Tap-to-zoom is available for
 * detail inspection.
 *
 * Pipe-table pattern recognized:
 *   | Col 1 | Col 2 | Col 3 |
 *   |-------|-------|-------|
 *   | a     | b     | c     |
 *   | d     | e     | f     |
 *
 * Alignment markers (`:---`, `---:`, `:---:`) in the separator row are
 * parsed but column alignment is not yet rendered -- all cells left-align.
 */
import { Resvg } from '@resvg/resvg-js'

export interface TableData {
  rows: string[][]  // index 0 = header row
}

export type SourceSegment =
  | { kind: 'text'; content: string }
  | { kind: 'table'; data: TableData }

const TABLE_REGEX = /^\|.+\|\s*\n\|[\s\-:|]+\|\s*\n(?:^\|.+\|\s*\n?)+/gm

/**
 * Split source markdown into an ordered stream of text and table segments.
 * Callers send each segment to Telegram in turn -- text via sendMessage,
 * tables via sendPhoto -- to get the inline text -> image -> text flow.
 */
export function splitOnTables(input: string): SourceSegment[] {
  const out: SourceSegment[] = []
  let lastEnd = 0
  let m: RegExpExecArray | null
  TABLE_REGEX.lastIndex = 0
  while ((m = TABLE_REGEX.exec(input)) !== null) {
    if (m.index > lastEnd) {
      const text = input.slice(lastEnd, m.index)
      if (text.trim()) out.push({ kind: 'text', content: text })
    }
    const lines = m[0].trim().split('\n')
    if (lines.length >= 3) {
      const rows = lines
        .filter((_, i) => i !== 1)  // skip the |---|---| separator
        .map(line => line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()))
      out.push({ kind: 'table', data: { rows } })
    }
    lastEnd = m.index + m[0].length
  }
  if (lastEnd < input.length) {
    const tail = input.slice(lastEnd)
    if (tail.trim()) out.push({ kind: 'text', content: tail })
  }
  return out
}

/**
 * Build a tightly-cropped SVG for a table -- no outer margins, so
 * Telegram's auto-scaling shows the table edge-to-edge in the chat
 * bubble.
 */
export function tableToSvg(table: TableData, opts: Partial<TableStyleOpts> = {}): string {
  const o = { ...defaultStyle, ...opts }

  const numCols = Math.max(...table.rows.map(r => r.length))
  const colWidths: number[] = []
  for (let c = 0; c < numCols; c++) {
    const maxLen = Math.max(1, ...table.rows.map(r => (r[c] ?? '').length))
    colWidths.push(maxLen * o.charWidth + 2 * o.cellPadX)
  }

  const totalWidth = colWidths.reduce((a, b) => a + b, 0)
  const rowHeight = o.fontSize * 1.55
  const totalHeight = table.rows.length * rowHeight

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">`
  svg += `<rect width="100%" height="100%" fill="${o.bg}"/>`

  // Row backgrounds (header tint + alternating data rows for readability).
  let y = 0
  table.rows.forEach((_, ri) => {
    const isHeader = ri === 0
    const fill = isHeader ? o.headerBg : (ri % 2 === 0 ? o.rowBg : o.altRowBg)
    svg += `<rect x="0" y="${y}" width="${totalWidth}" height="${rowHeight}" fill="${fill}"/>`
    y += rowHeight
  })

  // Cell text. Baseline drops by cellPadY from the row's bottom edge.
  y = 0
  table.rows.forEach((row, ri) => {
    const isHeader = ri === 0
    let x = 0
    for (let ci = 0; ci < numCols; ci++) {
      const cell = row[ci] ?? ''
      const tx = x + o.cellPadX
      const ty = y + rowHeight - o.cellPadY
      const weight = isHeader ? 'bold' : 'normal'
      svg += `<text x="${tx}" y="${ty}" font-family="monospace" font-size="${o.fontSize}" font-weight="${weight}" fill="${o.fg}">${escapeXml(cell)}</text>`
      x += colWidths[ci]
    }
    y += rowHeight
  })

  // Borders.
  svg += `<rect x="0.5" y="0.5" width="${totalWidth - 1}" height="${totalHeight - 1}" fill="none" stroke="${o.borderColor}" stroke-width="1"/>`
  let x = 0
  for (let c = 0; c < numCols - 1; c++) {
    x += colWidths[c]
    svg += `<line x1="${x}" y1="0" x2="${x}" y2="${totalHeight}" stroke="${o.borderColor}" stroke-width="1"/>`
  }
  svg += `<line x1="0" y1="${rowHeight}" x2="${totalWidth}" y2="${rowHeight}" stroke="${o.borderColor}" stroke-width="1.5"/>`

  svg += `</svg>`
  return svg
}

/**
 * Render an SVG to a PNG Buffer at the given pixel-density scale.
 * @param scale 2 gives a retina-class image on most phone displays.
 */
export function tableSvgToPng(svg: string, scale = 2): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'zoom', value: scale },
    font: { loadSystemFonts: true, defaultFontFamily: 'monospace' },
  })
  return Buffer.from(resvg.render().asPng())
}

/** Convenience: TableData straight to PNG Buffer in one call. */
export function tableToPng(table: TableData, opts: Partial<TableStyleOpts> = {}, scale = 2): Buffer {
  return tableSvgToPng(tableToSvg(table, opts), scale)
}

export interface TableStyleOpts {
  fontSize: number
  charWidth: number       // monospace approximation, ~0.6 * fontSize
  cellPadX: number
  cellPadY: number
  bg: string
  headerBg: string
  rowBg: string
  altRowBg: string
  fg: string
  borderColor: string
}

export const defaultStyle: TableStyleOpts = {
  fontSize: 18,
  charWidth: 11,
  cellPadX: 12,
  cellPadY: 8,
  bg: '#ffffff',
  headerBg: '#f0f0f0',
  rowBg: '#ffffff',
  altRowBg: '#fafafa',
  fg: '#222222',
  borderColor: '#888888',
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
