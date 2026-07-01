import { Node, NodeType, BlockType, TypedBlock, LinkType, ParseContext } from './types'

function n(type: NodeType, text?: string, children?: Node[], depth?: number, lang?: string): Node {
  const node: Node = { type }
  if (text)             node.text     = text
  if (children?.length) node.children = children
  if (depth)            node.depth    = depth
  if (lang)             node.lang     = lang
  return node
}

export function parseBlock(block: TypedBlock, ctx?: ParseContext): Node[] {
  switch (block.type) {
    case BlockType.Def: {
      const m = block.lines[0]?.match(/^\s*\[([^\]]+)\]: (\S+)/)
      if (m) {
        const id = m[1].toLowerCase()
        const rest = block.lines.slice(1)
        const text = [m[2], ...rest].join('\n').trim()
        if (ctx) {
          ctx.defs.set(id, { url: text, blockIndex: ctx.blockIndex })
        }
        const nd = n(NodeType.Def, text)
        nd.defId = id
        return [nd]
      }
      return []
    }
    case BlockType.Heading: {
      const lines = block.lines.slice()
      lines[0] = lines[0].replace(/^\s*#{1,6}\s/, '')
      return [n(NodeType.Heading, '', parseInline(lines.join('\n'), ctx), block.depth ?? 1)]
    }
    case BlockType.Hr:
      return [n(NodeType.Hr, '')]
    case BlockType.Code: {
      const fence = block.lines[0] ?? ''
      const lang = fence.replace(/^\s*(`{3,}|~{3,})/, '').trim()
      let closingIdx = -1
      for (let i = block.lines.length - 1; i > 0; i--) {
        if (block.lines[i] === '') continue
        if (/^\s*(`{3,}|~{3,})/.test(block.lines[i])) closingIdx = i
        break
      }
      const inner = block.lines.slice(1, closingIdx > 0 ? closingIdx : undefined).join('\n')
      return [n(NodeType.Code, inner, undefined, undefined, lang || undefined)]
    }
    case BlockType.Html:
      return [n(NodeType.HTML, block.lines.join('\n'))]
    case BlockType.Blockquote: {
      return [parseBlockquote(block.lines.filter(l => l !== ''), ctx)]
    }
    case BlockType.List: {
      const lines = block.lines.filter(l => l !== '')
      const { items } = buildList(lines, 0, ctx)
      return [n(NodeType.List, '', items)]
    }
    case BlockType.Table: {
      const rows = block.lines
        .filter(l => l !== '' && !/^\s*\|[-:\s|]+\|\s*$/.test(l))
        .map(l => {
          const cells = l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|')
            .map(cell => n(NodeType.TableCell, '', parseInline(cell.trim(), ctx)))
          return n(NodeType.TableRow, '', cells)
        })
      return [n(NodeType.Table, '', rows)]
    }
    default:
      return [n(NodeType.Paragraph, '', parseInline(block.lines.join('\n'), ctx))]
  }
}

function parseBlockquote(lines: string[], ctx?: ParseContext): Node {
  const stripped = lines.map(l => l.replace(/^\s*>\s?/, ''))
  const children: Node[] = []
  let i = 0

  while (i < stripped.length) {
    const line = stripped[i]

    if (/^\s*>/.test(line)) {
      const start = i
      while (i < stripped.length && /^\s*>/.test(stripped[i])) i++
      children.push(parseBlockquote(stripped.slice(start, i), ctx))
      continue
    }

    if (/^\s*(`{3,}|~{3,})/.test(line)) {
      const fenceLines: string[] = [stripped[i++]]
      while (i < stripped.length) {
        const l = stripped[i++]
        fenceLines.push(l)
        if (/^\s*(`{3,}|~{3,})/.test(l)) break
      }
      const fence = fenceLines[0]
      const lang = fence.replace(/^\s*(`{3,}|~{3,})/, '').trim()
      let closingIdx = -1
      for (let j = fenceLines.length - 1; j > 0; j--) {
        if (fenceLines[j] === '') continue
        if (/^\s*(`{3,}|~{3,})/.test(fenceLines[j])) { closingIdx = j; break }
        break
      }
      const inner = fenceLines.slice(1, closingIdx > 0 ? closingIdx : undefined).join('\n')
      children.push(n(NodeType.Code, inner, undefined, undefined, lang || undefined))
      continue
    }

    if (/^\s*(?:[-*+]|\d+\.)\s/.test(line)) {
      const baseIndent = line.match(/^(\s*)/)?.[1].length ?? 0
      const listLines: string[] = []
      while (i < stripped.length) {
        const l = stripped[i]
        if (l === '') break
        const thisIndent = l.match(/^(\s*)/)?.[1].length ?? 0
        if (thisIndent > baseIndent || /^\s*(?:[-*+]|\d+\.)\s/.test(l)) {
          listLines.push(l); i++; continue
        }
        break
      }
      const { items } = buildList(listLines, 0, ctx)
      children.push(n(NodeType.List, '', items))
      continue
    }

    const start = i
    while (i < stripped.length &&
           !/^\s*>/.test(stripped[i]) &&
           !/^\s*(`{3,}|~{3,})/.test(stripped[i]) &&
           !/^\s*(?:[-*+]|\d+\.)\s/.test(stripped[i])) i++
    if (i > start) children.push(...parseInline(stripped.slice(start, i).join('\n'), ctx))
  }

  return n(NodeType.Blockquote, '', children)
}

function buildList(lines: string[], start: number, ctx?: ParseContext, minIndent = 0): { items: Node[]; end: number } {
  const maxTopLevel = minIndent + 4
  const items: Node[] = []
  let i = start

  while (i < lines.length) {
    const m = lines[i].match(/^(\s*)(?:[-*+]|\d+\.)\s(.*)/)
    if (!m) { i++; continue }
    const indent = m[1].length
    if (indent < minIndent) break
    if (indent >= maxTopLevel) { i++; continue }

    const inlineNodes = parseInline(m[2] ?? '', ctx)
    i++

    let subList: Node | null = null
    if (i < lines.length) {
      const nm = lines[i].match(/^(\s*)(?:[-*+]|\d+\.)\s/)
      if (nm && nm[1].length >= maxTopLevel) {
        const res = buildList(lines, i, ctx, maxTopLevel)
        subList = n(NodeType.List, '', res.items)
        i = res.end
      }
    }

    items.push(n(NodeType.ListItem, '', subList ? [...inlineNodes, subList] : inlineNodes))
  }

  return { items, end: i }
}

export function parseInline(src: string, ctx?: ParseContext): Node[] {
  return mergeText(new Scanner(src, ctx).scan())
}

class Scanner {
  private pos = 0
  constructor(private src: string, private ctx?: ParseContext) {}

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
    const rest = this.src.slice(this.pos)
    if (/^(?:https?|ftp):\/\//.test(rest) || /^www\.[a-zA-Z]/.test(rest)) return this.autolink()
    if (/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.test(rest))  return this.autolink()
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
    if (m) { this.pos += m[0].length; const nd = n(NodeType.Link, m[1]); nd.linkType = LinkType.URL;   return nd }
    m = rest.match(/^<([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})>/)
    if (m) { this.pos += m[0].length; const nd = n(NodeType.Link, m[1]); nd.linkType = LinkType.Email; return nd }
    m = rest.match(/^<\/?[a-zA-Z][a-zA-Z0-9\-]*(?:\s[^>]*)?\s*\/?>/)
    if (m) { this.pos += m[0].length; return n(NodeType.Tag, m[0]) }
    return n(NodeType.Text, this.eat())
  }

  private autolink(): Node {
    const rest = this.src.slice(this.pos)
    let m: RegExpMatchArray | null
    if ((m = rest.match(/^(?:https?|ftp):\/\/[^\s<>]*/))) {
      const url = m[0].replace(/[.,:;!?)'"]*$/, '')
      this.pos += url.length
      const nd = n(NodeType.Link, url); nd.linkType = LinkType.URL; return nd
    }
    if ((m = rest.match(/^www\.[^\s<>]*/))) {
      const url = m[0].replace(/[.,:;!?)'"]*$/, '')
      this.pos += url.length
      const nd = n(NodeType.Link, url); nd.linkType = LinkType.URL; return nd
    }
    if ((m = rest.match(/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/))) {
      this.pos += m[0].length
      const nd = n(NodeType.Link, m[0]); nd.linkType = LinkType.Email; return nd
    }
    return this.text()
  }

  private image(): Node {
    this.pos += 2
    const alt = this.bracket()
    if (alt === null) return n(NodeType.Text, '![')
    if (this.ch() !== '(') return n(NodeType.Text, `![${alt}]`)
    this.pos++
    const href = this.paren()
    return n(NodeType.Image, href, parseInline(alt, this.ctx))
  }

  private link(): Node {
    this.pos++
    const label = this.bracket()
    if (label === null) return n(NodeType.Text, '[')

    if (this.ch() === '(') {
      this.pos++
      const href = this.paren()
      const nd = n(NodeType.Link, href, parseInline(label, this.ctx)); nd.linkType = LinkType.URL; return nd
    }

    if (this.ch() === '[') {
      this.pos++
      const id = this.bracket()
      if (id === null) return n(NodeType.Text, `[${label}][`)
      return this._makeRef(label, (id || label).toLowerCase())
    }

    return this._makeRef(label, label.toLowerCase())
  }

  private _makeRef(displayText: string, id: string): Node {
    const isSup = id.startsWith('^')
    const nd = n(NodeType.Link, isSup ? '[' + id.slice(1) + ']' : displayText)
    nd.linkType = isSup ? LinkType.Sup : LinkType.Ref
    nd.defId = id
    if (this.ctx) {
      if (!isSup) {
        const def = this.ctx.defs.get(id)
        if (def) nd.href = def.url
      }
      this.ctx.refs.push({ node: nd, blockIndex: this.ctx.blockIndex })
    }
    return nd
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
        return parseInline(inner, this.ctx)
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
        return n(NodeType.Del, '', parseInline(inner, this.ctx))
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
      prev.text = (prev.text ?? '') + (node.text ?? '')
    } else {
      out.push(node)
    }
  }
  return out
}
