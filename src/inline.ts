import { Node, NodeType, BlockType, TypedBlock } from './types'

function n(type: NodeType, value: string, children?: Node[], depth?: number, lang?: string): Node {
  const node: Node = { type, value }
  if (children?.length) node.children = children
  if (depth)            node.depth    = depth
  if (lang)             node.lang     = lang
  return node
}

export function parseBlock(block: TypedBlock): Node[] {
  switch (block.type) {
    case BlockType.Heading: {
      const lines = block.lines.slice()
      lines[0] = lines[0].replace(/^\s*#{1,6}\s/, '')
      return [n(NodeType.Heading, '', parseInline(lines.join('\n')), block.depth ?? 1)]
    }
    case BlockType.Hr:
      return [n(NodeType.Hr, '')]
    case BlockType.Code: {
      const fence = block.lines[0] ?? ''
      const lang = fence.replace(/^\s*(`{3,}|~{3,})/, '').trim()
      const last = block.lines[block.lines.length - 1]
      const isClosedFence = /^\s*(`{3,}|~{3,})/.test(last)
      const inner = block.lines.slice(1, isClosedFence ? -1 : undefined).join('\n')
      return [n(NodeType.Code, inner, undefined, undefined, lang || undefined)]
    }
    case BlockType.Html:
      return [n(NodeType.HTML, block.lines.join('\n'))]
    case BlockType.Blockquote: {
      const text = block.lines.map(l => l.replace(/^\s*>\s?/, '')).join('\n')
      return [n(NodeType.Blockquote, '', parseInline(text))]
    }
    case BlockType.List: {
      const items = block.lines
        .map(l => n(NodeType.ListItem, '', parseInline(l.replace(/^\s*(?:[-*+]|\d+\.)\s/, ''))))
      return [n(NodeType.List, '', items)]
    }
    case BlockType.Table: {
      const rows = block.lines
        .filter(l => !/^\s*\|[-:\s|]+\|\s*$/.test(l))
        .map(l => {
          const cells = l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|')
            .map(cell => n(NodeType.TableCell, '', parseInline(cell.trim())))
          return n(NodeType.TableRow, '', cells)
        })
      return [n(NodeType.Table, '', rows)]
    }
    default:
      return [n(NodeType.Paragraph, '', parseInline(block.lines.join('\n')))]
  }
}

export function parseInline(src: string): Node[] {
  return mergeText(new Scanner(src).scan())
}

class Scanner {
  private pos = 0
  constructor(private src: string) {}

  scan(): Node[] {
    const nodes: Node[] = []
    while (this.pos < this.src.length) nodes.push(this.next())
    return nodes
  }

  private ch(offset = 0): string { return this.src[this.pos + offset] ?? '' }

  private eat(count = 1): string {
    const s = this.src.slice(this.pos, this.pos + count)
    this.pos += count
    return s
  }

  private next(): Node {
    const c = this.ch()
    if (c === '`')                       return this.codespan()
    if (c === '\\')                      return this.escape()
    if (c === '<')                       return this.ltag()
    if (c === '!' && this.ch(1) === '[') return this.image()
    if (c === '[' && (this.ch(1) === 'x' || this.ch(1) === ' ') && this.ch(2) === ']') return this.checkbox()
    if (c === '[')                       return this.link()
    if (c === '*' || c === '_')          return this.emph()
    if (c === '~' && this.ch(1) === '~') return this.del()
    if (c === '&')                       return this.entity()
    if (c === '\n')                      { this.pos++; return n(NodeType.Br, '') }
    return this.text()
  }

  private checkbox(): Node {
    const checked = this.ch(1) === 'x'
    this.pos += 3
    return n(NodeType.Checkbox, checked ? 'x' : ' ')
  }

  private codespan(): Node {
    let ticks = 0
    while (this.ch(ticks) === '`') ticks++
    const fence = this.src.slice(this.pos, this.pos + ticks)
    this.pos += ticks
    const start = this.pos
    while (this.pos < this.src.length) {
      if (this.src.slice(this.pos, this.pos + ticks) === fence && this.ch(ticks) !== '`') {
        const raw = this.src.slice(start, this.pos)
        this.pos += ticks
        const val = raw.length > 2 && raw[0] === ' ' && raw[raw.length - 1] === ' '
          ? raw.slice(1, -1) : raw
        return n(NodeType.Codespan, val)
      }
      this.pos++
    }
    this.pos = start
    return n(NodeType.Text, fence)
  }

  private escape(): Node {
    this.pos++
    if (/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(this.ch())) {
      return n(NodeType.Escape, this.eat())
    }
    return n(NodeType.Text, '\\')
  }

  private ltag(): Node {
    const rest = this.src.slice(this.pos)
    let m: RegExpMatchArray | null
    m = rest.match(/^<([a-zA-Z][a-zA-Z0-9+\-.]{1,31}:\/\/[^\s<>]*)>/)
    if (m) { this.pos += m[0].length; return n(NodeType.Link, m[1]) }
    m = rest.match(/^<([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})>/)
    if (m) { this.pos += m[0].length; return n(NodeType.Link, m[1]) }
    m = rest.match(/^<\/?[a-zA-Z][a-zA-Z0-9\-]*(?:\s[^>]*)?\s*\/?>/)
    if (m) { this.pos += m[0].length; return n(NodeType.Tag, m[0]) }
    return n(NodeType.Text, this.eat())
  }

  private image(): Node {
    this.pos += 2
    const alt = this.bracket()
    if (alt === null) return n(NodeType.Text, '![')
    if (this.ch() !== '(') return n(NodeType.Text, `![${alt}]`)
    this.pos++
    const href = this.paren()
    return n(NodeType.Image, href, parseInline(alt))
  }

  private link(): Node {
    this.pos++
    const label = this.bracket()
    if (label === null) return n(NodeType.Text, '[')
    if (this.ch() !== '(') return n(NodeType.Text, `[${label}]`)
    this.pos++
    const href = this.paren()
    return n(NodeType.Link, href, parseInline(label))
  }

  private bracket(): string | null {
    let depth = 1, s = ''
    while (this.pos < this.src.length) {
      const c = this.eat()
      if (c === '[') depth++
      else if (c === ']') { if (--depth === 0) return s }
      s += c
    }
    return null
  }

  private paren(): string {
    let href = '', depth = 1
    while (this.ch() === ' ') this.pos++
    if (this.ch() === '<') {
      this.pos++
      while (this.pos < this.src.length && this.ch() !== '>') href += this.eat()
      if (this.ch() === '>') this.pos++
    } else {
      while (this.pos < this.src.length) {
        const c = this.ch()
        if (c === '(')                   depth++
        else if (c === ')')              { if (--depth === 0) break }
        else if (c === ' ' || c === '\t') break
        href += this.eat()
      }
    }
    while (this.ch() === ' ') this.pos++
    if (this.ch() === '"' || this.ch() === "'") {
      const q = this.eat()
      while (this.pos < this.src.length && this.ch() !== q) this.pos++
      if (this.ch() === q) this.pos++
    }
    while (this.ch() === ' ') this.pos++
    if (this.ch() === ')') this.pos++
    return href
  }

  private emph(): Node {
    const c = this.ch()
    let cnt = 0
    while (this.ch(cnt) === c) cnt++
    if (cnt >= 3) {
      const inner = this.delimited(c.repeat(3))
      if (inner) return n(NodeType.Strong, '', [n(NodeType.Em, '', inner)])
    }
    if (cnt >= 2) {
      const inner = this.delimited(c.repeat(2))
      if (inner) return n(NodeType.Strong, '', inner)
    }
    const inner = this.delimited(c)
    if (inner) return n(NodeType.Em, '', inner)
    return n(NodeType.Text, this.eat())
  }

  private delimited(delim: string): Node[] | null {
    const saved = this.pos
    if (this.src.slice(this.pos, this.pos + delim.length) !== delim) return null
    this.pos += delim.length
    const start = this.pos
    while (this.pos < this.src.length) {
      if (this.src.slice(this.pos, this.pos + delim.length) === delim &&
          this.ch(delim.length) !== delim[0]) {
        const inner = this.src.slice(start, this.pos)
        this.pos += delim.length
        return parseInline(inner)
      }
      this.pos++
    }
    this.pos = saved
    return null
  }

  private del(): Node {
    this.pos += 2
    const start = this.pos
    while (this.pos < this.src.length) {
      if (this.src.slice(this.pos, this.pos + 2) === '~~') {
        const inner = this.src.slice(start, this.pos)
        this.pos += 2
        return n(NodeType.Del, '', parseInline(inner))
      }
      this.pos++
    }
    this.pos = start - 2
    return n(NodeType.Text, this.eat() + this.eat())
  }

  private entity(): Node {
    const m = this.src.slice(this.pos)
      .match(/^&([a-zA-Z][a-zA-Z0-9]*|#[0-9]{1,7}|#x[0-9a-fA-F]{1,6});/)
    if (m) { this.pos += m[0].length; return n(NodeType.Escape, m[0]) }
    return n(NodeType.Text, this.eat())
  }

  private text(): Node {
    const specials = new Set(['`', '\\', '<', '!', '[', '*', '_', '~', '&', '\n'])
    let s = ''
    while (this.pos < this.src.length && !specials.has(this.ch())) s += this.eat()
    return n(NodeType.Text, s || this.eat())
  }
}

function mergeText(nodes: Node[]): Node[] {
  const out: Node[] = []
  for (const node of nodes) {
    const prev = out[out.length - 1]
    if (node.type === NodeType.Text && prev?.type === NodeType.Text) {
      prev.value += node.value
    } else {
      out.push(node)
    }
  }
  return out
}
