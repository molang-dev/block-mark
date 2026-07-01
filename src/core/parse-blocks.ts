import { Block, BlockRule, BlockContext, BlockType, DirtyFlag } from './types'

// ─── helpers ─────────────────────────────────────────────────────────────────

function b(type: number, lines: string[], extra?: Partial<Block>): Block {
  return { type, lines, index: 0, lineStart: 0, lineEnd: 0, dirty: DirtyFlag.Changed, ...extra }
}

// Patterns that interrupt a paragraph (CommonMark §4.1)
const INTERRUPT_RE = [
  /^( {0,3})(#{1,6})(\s|$)/,                      // ATX heading
  /^( {0,3})(`{3,}|~{3,})/,                        // fenced code
  /^( {0,3})([-*_])[ \t]*(\2[ \t]*){2,}$/,         // thematic break
  /^( {0,3})>/,                                     // blockquote
  /^( {0,3})([-*+]|\d{1,9}[.)]) /,                 // list item (non-empty)
  /^( {0,3})<(pre|script|style|textarea)(\s|>|$)/i, // HTML block type 1
  /^( {0,3})<!--|^( {0,3})<\?|^( {0,3})<![A-Z]|^( {0,3})<!\[CDATA\[/, // HTML 2-5
]

export function interruptsParagraph(line: string): boolean {
  return INTERRUPT_RE.some(r => r.test(line))
}

const SETEXT_RE = /^( {0,3})(=+|-+)\s*$/

// ─── B-02  ATX Heading ────────────────────────────────────────────────────────

const atxHeading: BlockRule = {
  name: 'atx-heading',
  priority: 20,
  tryCollect(lines, at) {
    const raw = lines[at]
    if (raw === undefined) return null
    const m = raw.match(/^( {0,3})(#{1,6})(\s+|$)/)
    if (!m) return null
    const depth = m[2].length
    return b(BlockType.Heading, [raw], { depth })
  },
}

// ─── B-03  Setext Heading ────────────────────────────────────────────────────

const setextHeading: BlockRule = {
  name: 'setext-heading',
  priority: 25,
  tryCollect(lines, at) {
    const first = lines[at]
    if (!first || first === '' || interruptsParagraph(first)) return null
    const textLines: string[] = []
    let i = at
    while (i < lines.length) {
      const l = lines[i]
      if (l === '') break
      if (SETEXT_RE.test(l) && textLines.length > 0) {
        const depth = l.trimStart()[0] === '=' ? 1 : 2
        return b(BlockType.Heading, [...textLines, l], { depth })
      }
      if (textLines.length > 0 && interruptsParagraph(l)) break
      textLines.push(l)
      i++
    }
    return null
  },
}

// ─── B-04  Indented Code Block ───────────────────────────────────────────────

const indentedCode: BlockRule = {
  name: 'indented-code',
  priority: 30,
  tryCollect(lines, at) {
    if (!/^( {4}|\t)/.test(lines[at] ?? '')) return null
    const codeLines: string[] = []
    let trailingBlanks: string[] = []
    let i = at
    while (i < lines.length) {
      const l = lines[i]
      if (l === '') { trailingBlanks.push(l); i++; continue }
      if (/^( {4}|\t)/.test(l)) {
        codeLines.push(...trailingBlanks, l)
        trailingBlanks = []
        i++
      } else {
        break
      }
    }
    return codeLines.length > 0 ? b(BlockType.Code, codeLines, { meta: '' }) : null
  },
}

// ─── B-05  Fenced Code Block ─────────────────────────────────────────────────

const fencedCode: BlockRule = {
  name: 'fenced-code',
  priority: 35,
  tryCollect(lines, at) {
    const openLine = lines[at]
    const om = openLine?.match(/^( {0,3})(`{3,}|~{3,})(.*)$/)
    if (!om) return null
    const fenceChar = om[2][0]
    const fenceLen  = om[2].length
    const info      = om[3].trim()
    const collected = [openLine]
    let i = at + 1
    while (i < lines.length) {
      const l = lines[i]
      collected.push(l); i++
      const cm = l.match(/^( {0,3})(`{3,}|~{3,})\s*$/)
      if (cm && cm[2][0] === fenceChar && cm[2].length >= fenceLen) break
    }
    return b(BlockType.Code, collected, { meta: info || undefined })
  },
}

// ─── B-06  HTML Block ────────────────────────────────────────────────────────

const HTML6_TAGS = /^(address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)$/i

const htmlBlock: BlockRule = {
  name: 'html-block',
  priority: 40,
  tryCollect(lines, at) {
    const line = lines[at] ?? ''
    let i = at
    const collected: string[] = []

    if (/^( {0,3})<(pre|script|style|textarea)(\s|>|$)/i.test(line)) {
      while (i < lines.length) {
        collected.push(lines[i])
        if (/<\/(pre|script|style|textarea)>/i.test(lines[i])) { i++; break }
        i++
      }
      return b(BlockType.Html, collected)
    }
    if (/^( {0,3})<!--/.test(line)) {
      while (i < lines.length) {
        collected.push(lines[i]); i++
        if (/-->/.test(lines[i - 1])) break
      }
      return b(BlockType.Html, collected)
    }
    if (/^( {0,3})<\?/.test(line)) {
      while (i < lines.length) {
        collected.push(lines[i]); i++
        if (/\?>/.test(lines[i - 1])) break
      }
      return b(BlockType.Html, collected)
    }
    if (/^( {0,3})<![A-Z]/.test(line)) {
      while (i < lines.length) {
        collected.push(lines[i]); i++
        if (/>/.test(lines[i - 1])) break
      }
      return b(BlockType.Html, collected)
    }
    if (/^( {0,3})<!\[CDATA\[/.test(line)) {
      while (i < lines.length) {
        collected.push(lines[i]); i++
        if (/\]\]>/.test(lines[i - 1])) break
      }
      return b(BlockType.Html, collected)
    }
    const t6 = line.match(/^( {0,3})<\/?([a-zA-Z][a-zA-Z0-9-]*)/)
    if (t6 && HTML6_TAGS.test(t6[2])) {
      while (i < lines.length && lines[i] !== '') { collected.push(lines[i]); i++ }
      return collected.length > 0 ? b(BlockType.Html, collected) : null
    }
    return null
  },
}

// ─── B-07  Link Reference Definition ────────────────────────────────────────

const linkDef: BlockRule = {
  name: 'link-def',
  priority: 50,
  tryCollect(lines, at, ctx) {
    const line = lines[at] ?? ''
    // [label]: url
    const m = line.match(/^( {0,3})\[([^\]]+)\]:\s*(\S+)(.*)?$/)
    if (!m) return null
    const label = m[2].toLowerCase()
    let url = m[3]
    if (url.startsWith('<') && url.endsWith('>')) url = url.slice(1, -1)
    const rest = (m[4] ?? '').trim()

    const defLines = [line]
    let i = at + 1

    // Title on next line if nothing on current line after url
    if (!rest && i < lines.length) {
      const tm = lines[i]?.match(/^( {0,3})("([^"]*)"|'([^']*)'|\(([^)]*)\))\s*$/)
      if (tm) { defLines.push(lines[i]); i++ }
    }

    if (!ctx.defs.has(label)) {
      ctx.defs.set(label, { url, blockIndex: ctx.blockIndex })
      for (const ref of ctx.refs) {
        if (ref.node.defId === label) ref.node.url = url
      }
    }
    return b(BlockType.Def, defLines, { meta: label })
  },
}

// ─── B-08  Block Quote ───────────────────────────────────────────────────────

const blockQuote: BlockRule = {
  name: 'blockquote',
  priority: 60,
  tryCollect(lines, at) {
    if (!/^( {0,3})>/.test(lines[at] ?? '')) return null
    const collected: string[] = []
    let i = at
    while (i < lines.length) {
      const l = lines[i]
      if (/^( {0,3})>/.test(l)) {
        collected.push(l); i++
      } else if (collected.length > 0 && l !== '' && !interruptsParagraph(l)) {
        collected.push(l); i++ // lazy continuation
      } else {
        break
      }
    }
    return collected.length > 0 ? b(BlockType.Blockquote, collected) : null
  },
}

// ─── B-09  List ──────────────────────────────────────────────────────────────

const LIST_MARKER_RE = /^( {0,3})([-*+]|\d{1,9}[.)]) /
const LIST_INTERRUPT_RE = [
  /^( {0,3})(#{1,6})(\s|$)/,
  /^\s*(`{3,}|~{3,})/,
  /^( {0,3})([-*_])[ \t]*(\2[ \t]*){2,}$/,
  /^\s*>/,
]

const list: BlockRule = {
  name: 'list',
  priority: 70,
  tryCollect(lines, at) {
    if (!LIST_MARKER_RE.test(lines[at] ?? '')) return null
    const listLines: string[] = []
    let blankBuf: string[] = []
    let blankCount = 0
    let i = at
    while (i < lines.length) {
      const l = lines[i]
      if (l === '') {
        blankCount++
        if (blankCount >= 2) break
        blankBuf.push(l); i++; continue
      }
      blankCount = 0
      if (LIST_INTERRUPT_RE.some(r => r.test(l))) break
      const leading = (l.match(/^( *)/) ?? [])[1]?.length ?? 0
      if (leading === 0 && !LIST_MARKER_RE.test(l)) break
      listLines.push(...blankBuf); blankBuf = []
      listLines.push(l); i++
    }
    listLines.push(...blankBuf)
    return listLines.length > 0 ? b(BlockType.List, listLines) : null
  },
}

// ─── B-10  Thematic Break ────────────────────────────────────────────────────

const hr: BlockRule = {
  name: 'hr',
  priority: 80,
  tryCollect(lines, at) {
    const m = lines[at]?.match(/^( {0,3})([-*_])[ \t]*(\2[ \t]*){2,}$/)
    if (!m) return null
    return b(BlockType.Hr, [lines[at]])
  },
}

// ─── B-11  Paragraph (catch-all) ─────────────────────────────────────────────

const paragraph: BlockRule = {
  name: 'paragraph',
  priority: 90,
  tryCollect(lines, at) {
    const first = lines[at]
    if (first === undefined || first === '') return null  // blank lines not part of paragraphs
    const paraLines: string[] = [first]
    let i = at + 1
    while (i < lines.length) {
      const l = lines[i]
      if (l === '' || interruptsParagraph(l)) break
      paraLines.push(l); i++
    }
    return b(BlockType.Paragraph, paraLines)
  },
}

// ─── Core block rules (sorted by priority) ────────────────────────────────────

export const coreBlockRules: BlockRule[] = [
  atxHeading,
  setextHeading,
  indentedCode,
  fencedCode,
  htmlBlock,
  linkDef,
  blockQuote,
  list,
  hr,
  paragraph,
]

// ─── Core type names ─────────────────────────────────────────────────────────
// Kept in separate maps because BlockType and NodeType share the same numeric
// range (both start at 1), so a single merged map would have key collisions.

import { BlockType as BT, NodeType as NT } from './types'

export const coreBlockTypeNames: Record<number, string> = {
  [BT.Heading]:    'Heading',
  [BT.Paragraph]:  'Paragraph',
  [BT.List]:       'List',
  [BT.Code]:       'Code',
  [BT.Blockquote]: 'Blockquote',
  [BT.Hr]:         'Hr',
  [BT.Html]:       'Html',
  [BT.Def]:        'Def',
}

export const coreNodeTypeNames: Record<number, string> = {
  [NT.Text]:       'Text',
  [NT.Em]:         'Em',
  [NT.Strong]:     'Strong',
  [NT.Codespan]:   'Codespan',
  [NT.Link]:       'Link',
  [NT.LinkRef]:    'LinkRef',
  [NT.Image]:      'Image',
  [NT.Br]:         'Br',
  [NT.HardBr]:     'HardBr',
  [NT.Escape]:     'Escape',
  [NT.Tag]:        'Tag',
  [NT.Heading]:    'Heading',
  [NT.Paragraph]:  'Paragraph',
  [NT.Blockquote]: 'Blockquote',
  [NT.List]:       'List',
  [NT.ListItem]:   'ListItem',
  [NT.Code]:       'Code',
  [NT.Hr]:         'Hr',
  [NT.Html]:       'Html',
  [NT.Def]:        'Def',
}
