import { BlockMakerPlugin, BlockRule, Block, DirtyFlag } from '../core/types'

export enum FrontMatterBlockType {
  FrontMatter = 131001,
}

// ─── Minimal YAML parser (covers common front matter patterns) ────────────────

function parseScalar(val: string): unknown {
  if (val === 'true')  return true
  if (val === 'false') return false
  if (val === 'null' || val === '~') return null
  const n = Number(val)
  if (val !== '' && !isNaN(n)) return n
  if ((val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))) return val.slice(1, -1)
  return val
}

function parseInlineArray(src: string): unknown[] {
  const end = src.lastIndexOf(']')
  const inner = end > 0 ? src.slice(1, end) : src.slice(1)
  if (inner.trim() === '') return []
  return inner.split(',').map(s => parseScalar(s.trim()))
}

function parseYaml(lines: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '' || line.trimStart().startsWith('#')) { i++; continue }
    const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
    if (!m) { i++; continue }
    const key = m[1], val = m[2].trim()
    if (val === '') {
      // block sequence
      i++
      const items: unknown[] = []
      while (i < lines.length && /^\s+-\s/.test(lines[i])) {
        items.push(parseScalar(lines[i].replace(/^\s+-\s+?/, '').trim()))
        i++
      }
      out[key] = items
    } else if (val.startsWith('[')) {
      out[key] = parseInlineArray(val); i++
    } else {
      out[key] = parseScalar(val); i++
    }
  }
  return out
}

// ─── Block rule ───────────────────────────────────────────────────────────────

function bl(lines: string[], meta: string): Block {
  return { type: FrontMatterBlockType.FrontMatter, lines, meta, id: 0, order: 0, lineStart: 0, lineEnd: 0, dirty: DirtyFlag.Changed }
}

const frontMatterRule: BlockRule = {
  name: 'front-matter',
  priority: 5,
  tryCollect(lines, at, ctx) {
    if (at !== 0 || ctx.docLineStart !== 0) return null
    if (lines[at] !== '---') return null
    const collected: string[] = ['---']
    let i = at + 1
    while (i < lines.length) {
      const l = lines[i]; i++
      collected.push(l)
      if (l === '---' || l === '...') break
    }
    const last = collected[collected.length - 1]
    const body = collected.slice(1, last === '---' || last === '...' ? -1 : undefined)
    return bl(collected, JSON.stringify(parseYaml(body)))
  },
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export const blockMakerFrontMatter: BlockMakerPlugin = {
  name: 'front-matter',

  blockRules: [frontMatterRule],

  // No markdown AST — front matter is metadata only, not rendered
  blockProcessors: {
    [FrontMatterBlockType.FrontMatter]: () => [],
  },

  htmlBlock: {
    [FrontMatterBlockType.FrontMatter]: () => '',
  },

  blockTypeNames: {
    [FrontMatterBlockType.FrontMatter]: 'FrontMatter',
  },
}
