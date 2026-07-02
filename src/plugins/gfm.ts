import {
  BlockMakerPlugin, BlockRule, InlineRule, Block, Node, BlockContext,
  InlineContext, BlockType, DirtyFlag, BlockProcessorCtx, HtmlCtx,
} from '../core/types'

// ─── GFM-specific type numbers ───────────────────────────────────────────────

export enum GFMBlockType {
  Table       = 100,
  FootnoteDef = 101,
}

export enum GFMNodeType {
  Del          = 100,
  FootnoteRef  = 101,
  Checkbox     = 102,
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function nd(type: number, extra?: Partial<Node>): Node {
  return { type, ...extra }
}

function bl(type: number, lines: string[], extra?: Partial<Block>): Block {
  return { type, lines, index: 0, lineStart: 0, lineEnd: 0, dirty: DirtyFlag.Changed, ...extra }
}

// ─── G-B-01  Table ───────────────────────────────────────────────────────────

const TABLE_SEP_CELL = /^:?-+:?$/

function parseAlign(cell: string): 'left' | 'right' | 'center' | null {
  cell = cell.trim()
  if (cell.startsWith(':') && cell.endsWith(':')) return 'center'
  if (cell.endsWith(':')) return 'right'
  if (cell.startsWith(':')) return 'left'
  return null
}

function splitTableRow(line: string): string[] {
  return line.replace(/^\||\|$/g, '').split('|').map(c => c.trim())
}

function isSepRow(line: string): boolean {
  if (!/^\|/.test(line) && !/-/.test(line)) return false
  const cells = splitTableRow(line)
  return cells.length > 0 && cells.every(c => TABLE_SEP_CELL.test(c))
}

const tableRule: BlockRule = {
  name: 'gfm-table',
  priority: 65,
  tryCollect(lines, at) {
    const headerLine = lines[at]
    const sepLine    = lines[at + 1]
    if (!headerLine || !sepLine) return null
    if (!/\|/.test(headerLine)) return null
    if (!isSepRow(sepLine)) return null

    const collected = [headerLine, sepLine]
    let i = at + 2
    while (i < lines.length && lines[i] !== '' && /\|/.test(lines[i])) {
      collected.push(lines[i]); i++
    }
    const align = splitTableRow(sepLine).map(parseAlign)
    return bl(GFMBlockType.Table, collected, { meta: JSON.stringify(align) })
  },
}

// ─── G-B-02  Footnote Definition ─────────────────────────────────────────────

const footnoteDefRule: BlockRule = {
  name: 'gfm-footnote-def',
  priority: 48,  // before link-def (50) so [^id]: takes priority
  tryCollect(lines, at, ctx: BlockContext) {
    const m = lines[at]?.match(/^( {0,3})\[\^([^\]]+)\]:\s*(.*)$/)
    if (!m) return null
    const id = m[2].toLowerCase()
    const firstContent = m[3]
    const W = 4  // GFM footnote continuation indented by 4 spaces
    const collected = [lines[at]]
    let i = at + 1
    while (i < lines.length) {
      const l = lines[i]
      if (l === '') { collected.push(l); i++; continue }
      const indent = l.match(/^( *)/)?.[1].length ?? 0
      if (indent >= W) { collected.push(l); i++ }
      else break
    }
    while (collected.length > 0 && collected[collected.length - 1] === '') collected.pop()
    return bl(GFMBlockType.FootnoteDef, collected, { meta: id })
  },
}

// ─── G-I-01  Strikethrough ~~ ────────────────────────────────────────────────

const strikethrough: InlineRule = {
  name: 'gfm-strikethrough',
  priority: 10,
  trigger(ch) { return ch === '~' },
  tryParse(src, pos, ctx) {
    if (src.slice(pos, pos + 2) !== '~~') return null
    const end = src.indexOf('~~', pos + 2)
    if (end < 0) return null
    const inner = src.slice(pos + 2, end)
    if (!inner || inner.includes('\n\n')) return null
    const children = ctx.parse(inner)
    return { node: nd(GFMNodeType.Del, { children }), length: end + 2 - pos }
  },
}

// ─── G-I-04  Footnote Reference [^id] ───────────────────────────────────────

const footnoteRef: InlineRule = {
  name: 'gfm-footnote-ref',
  priority: 15,
  trigger(ch, next) { return ch === '[' && next === '^' },
  tryParse(src, pos) {
    const m = src.slice(pos).match(/^\[\^([^\]]+)\]/)
    if (!m) return null
    return {
      node: nd(GFMNodeType.FootnoteRef, { defId: m[1].toLowerCase(), text: m[1] }),
      length: m[0].length,
    }
  },
}

// ─── GFM Table NodeType ───────────────────────────────────────────────────────
// 103 = TableRow, 104 = TableCell

export const GFM_TABLE_ROW  = 103
export const GFM_TABLE_CELL = 104

// ─── Block processors ────────────────────────────────────────────────────────

function buildTableNodeFixed(block: Block, ctx: BlockProcessorCtx): Node[] {
  const lines  = block.lines
  const align: Array<'left' | 'right' | 'center' | null> = block.meta
    ? JSON.parse(block.meta)
    : []

  const buildRow = (line: string, _isHeader: boolean): Node => {
    const cells = splitTableRow(line)
    const cellNodes: Node[] = cells.map((cell, i) => ({
      type: GFM_TABLE_CELL,
      children: ctx.parseInline(cell),
      meta: (align[i] ?? undefined) as string | undefined,
    }))
    return { type: GFM_TABLE_ROW, children: cellNodes }
  }

  const headerRow = buildRow(lines[0], true)
  const bodyRows  = lines.slice(2).map(l => buildRow(l, false))

  return [{
    type: GFMBlockType.Table,
    align,
    children: [headerRow, ...bodyRows],
  }]
}

function buildFootnoteDefNode(block: Block, ctx: BlockProcessorCtx): Node[] {
  const id = block.meta ?? ''
  const lines = block.lines
  // First line content after [^id]:
  const firstLine = lines[0].replace(/^( {0,3})\[\^[^\]]+\]:\s*/, '')
  const contentLines = [firstLine, ...lines.slice(1)]
  const children = ctx.parseInline(contentLines.join('\n'))
  return [{ type: GFMBlockType.FootnoteDef, defId: id, children }]
}

// ─── HTML renderers ───────────────────────────────────────────────────────────

function renderTable(block: Block, ctx: HtmlCtx): string {
  const align: Array<'left' | 'right' | 'center' | null> = block.meta
    ? JSON.parse(block.meta)
    : []
  const lines = block.lines

  const cellTag = (cell: string, tag: 'th' | 'td', colIdx: number): string => {
    const a = align[colIdx]
    const style = a ? ` style="text-align:${a}"` : ''
    return `<${tag}${style}>${ctx.renderLines([cell])}</${tag}>`
  }

  const headerCells = splitTableRow(lines[0] ?? '').map((c, i) => cellTag(c, 'th', i)).join('')
  const tBody = lines.slice(2).map(line => {
    const tdCells = splitTableRow(line).map((c, i) => cellTag(c, 'td', i)).join('')
    return `<tr>${tdCells}</tr>`
  }).join('')

  return `<table><thead><tr>${headerCells}</tr></thead><tbody>${tBody}</tbody></table>`
}

function renderFootnoteDef(block: Block, ctx: HtmlCtx): string {
  const id = ctx.escape(block.meta ?? '')
  const content = ctx.renderLines(block.lines.slice(1).filter(Boolean))
  return `<div class="footnote-def" id="fn-${id}"><sup>${id}</sup> ${content}</div>`
}

// ─── Inline node HTML ─────────────────────────────────────────────────────────

function renderDel(node: Node, ctx: HtmlCtx): string {
  return `<del>${ctx.renderNodes(node.children ?? [])}</del>`
}

function renderFootnoteRef(node: Node, ctx: HtmlCtx): string {
  const id = ctx.escape(node.defId ?? node.text ?? '')
  return `<sup class="footnote-ref"><a href="#fn-${id}">[${id}]</a></sup>`
}

function renderCheckbox(node: Node): string {
  const checked = node.text === 'x' || node.text === 'X'
  return `<input type="checkbox"${checked ? ' checked' : ''} disabled> `
}

// ─── Task list checkbox inline rule ─────────────────────────────────────────

const taskCheckbox: InlineRule = {
  name: 'gfm-task-checkbox',
  priority: 5,
  trigger(ch, next) { return ch === '[' && (next === 'x' || next === 'X' || next === ' ') },
  tryParse(src, pos) {
    const m = src.slice(pos).match(/^\[([xX ])\] /)
    if (!m) return null
    return {
      node: { type: GFMNodeType.Checkbox, text: m[1] },
      length: m[0].length,
    }
  },
}

// ─── Plugin export ────────────────────────────────────────────────────────────

export const blockMakerGFM: BlockMakerPlugin = {
  name: 'gfm',

  blockRules: [tableRule, footnoteDefRule],

  inlineRules: [taskCheckbox, strikethrough, footnoteRef],

  blockProcessors: {
    [GFMBlockType.Table]:       (block, ctx) => buildTableNodeFixed(block, ctx),
    [GFMBlockType.FootnoteDef]: (block, ctx) => buildFootnoteDefNode(block, ctx),
  },

  htmlBlock: {
    [GFMBlockType.Table]:       (block, ctx) => renderTable(block, ctx),
    [GFMBlockType.FootnoteDef]: (block, ctx) => renderFootnoteDef(block, ctx),
  },

  htmlNode: {
    [GFMNodeType.Del]:         (node, ctx) => renderDel(node, ctx),
    [GFMNodeType.FootnoteRef]: (node, ctx) => renderFootnoteRef(node, ctx),
    [GFMNodeType.Checkbox]:    (node)       => renderCheckbox(node),
  },

  blockTypeNames: {
    [GFMBlockType.Table]:       'Table',
    [GFMBlockType.FootnoteDef]: 'FootnoteDef',
  },
  nodeTypeNames: {
    [GFMNodeType.Del]:         'Del',
    [GFMNodeType.FootnoteRef]: 'FootnoteRef',
    [GFMNodeType.Checkbox]:    'Checkbox',
    [GFM_TABLE_ROW]:           'TableRow',
    [GFM_TABLE_CELL]:          'TableCell',
  },
}
