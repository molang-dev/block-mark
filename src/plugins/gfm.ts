import {
  BlockMakerPlugin, BlockRule, InlineRule, Block, Node, BlockContext,
  InlineContext, BlockType, DirtyFlag, BlockProcessorCtx, HtmlCtx,
} from '../core/types'
import { EMOJI_MAP } from './emoji-map'

// ─── GFM-specific type numbers (module 11) ───────────────────────────────────

export enum GFMBlockType {
  Table       = 111001,
  FootnoteDef = 111002,
  MathBlock   = 111003,
}

export enum GFMNodeType {
  Del         = 112001,
  FootnoteRef = 112002,
  Checkbox    = 112003,
  TableRow    = 112004,
  TableCell   = 112005,
  FootnoteDef = 112006,
  Table       = 112007,
  MathInline  = 112008,
  MathBlock   = 112009,
  Emoji       = 112010,
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
  return line.trimStart().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
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

// ─── G-B-03  Display Math $$ ─────────────────────────────────────────────────

const mathBlockRule: BlockRule = {
  name: 'gfm-math-block',
  priority: 34,
  tryCollect(lines, at) {
    if (!/^( {0,3})\$\$$/.test(lines[at] ?? '')) return null
    const collected = [lines[at]]
    let i = at + 1
    while (i < lines.length) {
      const l = lines[i]
      collected.push(l); i++
      if (/^( {0,3})\$\$$/.test(l)) break
    }
    return collected.length >= 2 ? bl(GFMBlockType.MathBlock, collected) : null
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

// ─── G-I-05  Inline Math $ ───────────────────────────────────────────────────

const mathInline: InlineRule = {
  name: 'gfm-math-inline',
  priority: 20,
  trigger(ch, next) { return ch === '$' && next !== '$' && next !== ' ' },
  tryParse(src, pos) {
    if (src[pos] !== '$' || src[pos + 1] === '$') return null
    const rest = src.slice(pos + 1)
    const end = rest.indexOf('$')
    if (end < 0) return null
    const inner = rest.slice(0, end)
    if (!inner.trim() || inner[0] === ' ' || inner[inner.length - 1] === ' ' || inner.includes('\n')) return null
    return { node: nd(GFMNodeType.MathInline, { text: inner }), length: end + 2 }
  },
}

// ─── G-I-06  Emoji :name: ────────────────────────────────────────────────────

const emoji: InlineRule = {
  name: 'gfm-emoji',
  priority: 25,
  trigger(ch) { return ch === ':' },
  tryParse(src, pos) {
    const m = src.slice(pos).match(/^:([a-z0-9_+\-]+):/)
    if (!m) return null
    const ch = EMOJI_MAP[m[1]]
    if (!ch) return null
    return { node: nd(GFMNodeType.Emoji, { text: ch }), length: m[0].length }
  },
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

// ─── Block processors ────────────────────────────────────────────────────────

function buildMathBlockNode(block: Block): Node[] {
  const formula = block.lines.slice(1, -1).join('\n')
  return [nd(GFMNodeType.MathBlock, { text: formula })]
}

function buildTableNode(block: Block, ctx: BlockProcessorCtx): Node[] {
  const lines  = block.lines
  const align: Array<'left' | 'right' | 'center' | null> = block.meta
    ? JSON.parse(block.meta)
    : []

  const buildRow = (line: string): Node => {
    const cellNodes: Node[] = splitTableRow(line).map((cell, i) => ({
      type: GFMNodeType.TableCell,
      children: ctx.parseInline(cell),
      meta: (align[i] ?? undefined) as string | undefined,
    }))
    return { type: GFMNodeType.TableRow, children: cellNodes }
  }

  return [{
    type: GFMNodeType.Table,
    children: [buildRow(lines[0]), ...lines.slice(2).map(l => buildRow(l))],
  }]
}

function buildFootnoteDefNode(block: Block, ctx: BlockProcessorCtx): Node[] {
  const id = block.meta ?? ''
  const lines = block.lines
  const firstLine = lines[0].replace(/^( {0,3})\[\^[^\]]+\]:\s*/, '')
  const contentLines = [firstLine, ...lines.slice(1)]
  const children = ctx.parseInline(contentLines.join('\n'))
  return [{ type: GFMNodeType.FootnoteDef, defId: id, children }]
}

// ─── HTML node renderers ──────────────────────────────────────────────────────

function renderDel(node: Node, ctx: HtmlCtx): string {
  return `<del>${ctx.renderNodes(node.children ?? [])}</del>`
}

function renderFootnoteRef(node: Node, ctx: HtmlCtx): string {
  const id = ctx.escape(node.defId ?? node.text ?? '')
  return `<sup class="footnote-ref"><a href="#bmd-fn-${id}">[${id}]</a></sup>`
}

function renderCheckbox(node: Node): string {
  const checked = node.text === 'x' || node.text === 'X'
  return `<input type="checkbox"${checked ? ' checked' : ''} disabled> `
}

function renderTableNode(node: Node, ctx: HtmlCtx): string {
  const [headerRow, ...bodyRows] = node.children ?? []
  const cell = (nd: Node, tag: 'th' | 'td'): string => {
    const style = nd.meta ? ` style="text-align:${nd.meta}"` : ''
    return `<${tag}${style}>${ctx.renderNodes(nd.children ?? [])}</${tag}>`
  }
  const header = headerRow
    ? `<thead><tr>${(headerRow.children ?? []).map(c => cell(c, 'th')).join('')}</tr></thead>`
    : ''
  const body = bodyRows.length
    ? `<tbody>${bodyRows.map(r => `<tr>${(r.children ?? []).map(c => cell(c, 'td')).join('')}</tr>`).join('')}</tbody>`
    : ''
  return `<table>${header}${body}</table>`
}

function renderFootnoteDefNode(node: Node, ctx: HtmlCtx): string {
  return ctx.renderNodes(node.children ?? [])
}

// ─── Plugin export ────────────────────────────────────────────────────────────

export const blockMakerGFM: BlockMakerPlugin = {
  name: 'gfm',

  blockRules: [tableRule, footnoteDefRule, mathBlockRule],

  inlineRules: [taskCheckbox, strikethrough, footnoteRef, mathInline, emoji],

  blockProcessors: {
    [GFMBlockType.Table]:       (block, ctx) => buildTableNode(block, ctx),
    [GFMBlockType.FootnoteDef]: (block, ctx) => buildFootnoteDefNode(block, ctx),
    [GFMBlockType.MathBlock]:   (block)      => buildMathBlockNode(block),
  },

  htmlBlock: {
    [GFMBlockType.Table]:       (block, ctx) => ctx.renderNodes(block.markdown ?? []),
    [GFMBlockType.FootnoteDef]: (block, ctx) => ctx.renderNodes(block.markdown ?? []),
    [GFMBlockType.MathBlock]:   (block, ctx) => ctx.renderNodes(block.markdown ?? []),
  },

  htmlNode: {
    [GFMNodeType.Del]:         (node, ctx) => renderDel(node, ctx),
    [GFMNodeType.FootnoteRef]: (node, ctx) => renderFootnoteRef(node, ctx),
    [GFMNodeType.Checkbox]:    (node)       => renderCheckbox(node),
    [GFMNodeType.Table]:       (node, ctx)  => renderTableNode(node, ctx),
    [GFMNodeType.TableRow]:    (node, ctx)  => `<tr>${ctx.renderNodes(node.children ?? [])}</tr>`,
    [GFMNodeType.TableCell]:   (node, ctx)  => { const s = node.meta ? ` style="text-align:${node.meta}"` : ''; return `<td${s}>${ctx.renderNodes(node.children ?? [])}</td>` },
    [GFMNodeType.FootnoteDef]: (node, ctx)  => renderFootnoteDefNode(node, ctx),
    [GFMNodeType.Emoji]:       (node)       => node.text ?? '',
  },

  blockTypeNames: {
    [GFMBlockType.Table]:       'Table',
    [GFMBlockType.FootnoteDef]: 'FootnoteDef',
    [GFMBlockType.MathBlock]:   'MathBlock',
  },
  nodeTypeNames: {
    [GFMNodeType.Del]:         'Del',
    [GFMNodeType.FootnoteRef]: 'FootnoteRef',
    [GFMNodeType.Checkbox]:    'Checkbox',
    [GFMNodeType.TableRow]:    'TableRow',
    [GFMNodeType.TableCell]:   'TableCell',
    [GFMNodeType.FootnoteDef]: 'FootnoteDef',
    [GFMNodeType.Table]:       'Table',
    [GFMNodeType.MathInline]:  'MathInline',
    [GFMNodeType.MathBlock]:   'MathBlock',
    [GFMNodeType.Emoji]:       'Emoji',
  },
}
