import { Node, NodeType, LinkType, InlineContext, InlineRule } from './types'

// ─── helpers ─────────────────────────────────────────────────────────────────

function n(type: number, text?: string, children?: Node[]): Node {
  const nd: Node = { type }
  if (text !== undefined) nd.text = text
  if (children?.length) nd.children = children
  return nd
}

// ─── Delimiter-stack emphasis implementation ─────────────────────────────────
// Simplified CommonMark emphasis: greedy matching with left/right flanking check.

function isUnicodeWhitespace(c: string): boolean {
  return /[\s   -   　]/.test(c)
}
function isUnicodePunctuation(c: string): boolean {
  return /[!-/:-@[-`{-~¡-¿‐-‧‰-⁞⁠-⿿、-〿！-｠￠-￦]/.test(c)
}

function leftFlanking(src: string, pos: number, len: number): boolean {
  const after  = src[pos + len] ?? ''
  if (!after || isUnicodeWhitespace(after)) return false
  const before = pos > 0 ? src[pos - 1] : ''
  if (isUnicodePunctuation(after)) {
    return !before || isUnicodeWhitespace(before) || isUnicodePunctuation(before)
  }
  return true
}

function rightFlanking(src: string, pos: number, len: number): boolean {
  const before = pos > 0 ? src[pos - 1] : ''
  if (!before || isUnicodeWhitespace(before)) return false
  const after  = src[pos + len] ?? ''
  if (isUnicodePunctuation(before)) {
    return !after || isUnicodeWhitespace(after) || isUnicodePunctuation(after)
  }
  return true
}

// ─── Scanner ─────────────────────────────────────────────────────────────────

export class InlineScanner {
  private pos = 0
  private extraRules: InlineRule[]
  constructor(private src: string, private ctx: InlineContext, extraRules: InlineRule[] = []) {
    this.extraRules = extraRules
  }

  scan(): Node[] {
    const nodes = this._scanTokens()
    return mergeText(nodes)
  }

  private _scanTokens(): Node[] {
    const nodes: Node[] = []
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos]
      const next = this.src[this.pos + 1] ?? ''

      // Try plugin inline rules first (sorted by priority outside)
      let ruleTriggered = false
      let matched = false
      for (const rule of this.extraRules) {
        if (!rule.trigger(ch, next)) continue
        ruleTriggered = true
        const r = rule.tryParse(this.src, this.pos, this.ctx)
        if (r) { nodes.push(r.node); this.pos += r.length; matched = true; break }
      }
      if (matched) continue
      // A rule triggered but failed (e.g. unclosed ~~): emit one char as text
      if (ruleTriggered) { nodes.push(n(NodeType.Text, this._eat())); continue }

      const node = this._next()
      nodes.push(node)
    }
    return nodes
  }

  private _next(): Node {
    const c = this.src[this.pos]
    if (c === '`')  return this._codespan()
    if (c === '\\') return this._escape()
    if (c === '<')  return this._ltag()
    if (c === '&')  return this._entity()
    if (c === '!' && this.src[this.pos + 1] === '[') return this._image()
    if (c === '[')  return this._link()
    if (c === '*' || c === '_') return this._emph()
    if (c === '\n') return this._linebreak()

    const rest = this.src.slice(this.pos)
    if (/^(?:https?|ftp):\/\//.test(rest) || /^www\.[a-zA-Z]/.test(rest)) return this._autolink()
    if (/^[a-zA-Z0-9][a-zA-Z0-9._%+\-]*@[a-zA-Z0-9]/.test(rest)) return this._autoemail()

    return this._text()
  }

  // ── I-09/10 Hard/soft line break ─────────────────────────────────────────

  private _linebreak(): Node {
    // Check preceding text for 2+ trailing spaces or backslash
    this.pos++
    return n(NodeType.Br, '')
  }

  // ── I-03 Code span ───────────────────────────────────────────────────────

  private _codespan(): Node {
    const savedPos = this.pos
    let ticks = 0
    while (this.src[this.pos + ticks] === '`') ticks++
    const fence = this.src.slice(this.pos, this.pos + ticks)
    this.pos += ticks
    const start = this.pos
    while (this.pos < this.src.length) {
      if (this.src.slice(this.pos, this.pos + ticks) === fence &&
          this.src[this.pos + ticks] !== '`') {
        let raw = this.src.slice(start, this.pos).replace(/\n/g, ' ')
        this.pos += ticks
        if (raw.length > 2 && raw[0] === ' ' && raw[raw.length - 1] === ' ' &&
            raw.trim() !== '') raw = raw.slice(1, -1)
        return n(NodeType.Codespan, raw)
      }
      this.pos++
    }
    // Unclosed: restore to position before opening backticks and emit one char
    this.pos = savedPos
    return n(NodeType.Text, this._eat())
  }

  // ── I-01 Backslash escape ─────────────────────────────────────────────────

  private _escape(): Node {
    this.pos++ // skip \
    const c = this.src[this.pos]
    if (c === '\n') { this.pos++; return n(NodeType.HardBr, '') }
    if (c && /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(c)) {
      this.pos++
      return n(NodeType.Escape, c)
    }
    return n(NodeType.Text, '\\')
  }

  // ── I-02 Character reference ──────────────────────────────────────────────

  private _entity(): Node {
    const m = this.src.slice(this.pos).match(/^&([a-zA-Z][a-zA-Z0-9]*|#[0-9]{1,7}|#x[0-9a-fA-F]{1,6});/)
    if (m) { this.pos += m[0].length; return n(NodeType.Escape, m[0]) }
    return n(NodeType.Text, this._eat())
  }

  // ── I-07/08 Autolinks and raw HTML ───────────────────────────────────────

  private _ltag(): Node {
    const rest = this.src.slice(this.pos)
    let m: RegExpMatchArray | null

    // URL autolink
    m = rest.match(/^<([a-zA-Z][a-zA-Z0-9+\-.]{1,31}:\/\/[^\s<>]*)>/)
    if (m) {
      this.pos += m[0].length
      return { type: NodeType.Link, url: m[1], text: m[1], linkType: LinkType.Url }
    }
    // Email autolink
    m = rest.match(/^<([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})>/)
    if (m) {
      this.pos += m[0].length
      return { type: NodeType.Link, url: m[1], text: m[1], linkType: LinkType.Email }
    }
    // Raw HTML tag
    m = rest.match(/^<\/?[a-zA-Z][a-zA-Z0-9\-]*(?:\s[^>]*)?\s*\/?>|^<!--[\s\S]*?-->|^<\?[\s\S]*?\?>|^<![A-Z][^>]*>|^<!\[CDATA\[[\s\S]*?\]\]>/)
    if (m) { this.pos += m[0].length; return n(NodeType.Tag, m[0]) }

    return n(NodeType.Text, this._eat())
  }

  // ── GFM bare autolink (http/https/www) ───────────────────────────────────

  private _autolink(): Node {
    const rest = this.src.slice(this.pos)
    const m = rest.match(/^(?:https?|ftp):\/\/[^\s<>]*|^www\.[^\s<>]*/)
    if (m) {
      const url = m[0].replace(/[.,:;!?)'"]*$/, '')
      this.pos += url.length
      return { type: NodeType.Link, url, text: url, linkType: LinkType.Url }
    }
    return this._text()
  }

  private _autoemail(): Node {
    const EMAIL = /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+\-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9\-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9\-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,6}/
    const m = this.src.slice(this.pos).match(EMAIL)
    if (m) {
      this.pos += m[0].length
      return { type: NodeType.Link, url: m[0], text: m[0], linkType: LinkType.Email }
    }
    return this._text()
  }

  // ── I-06 Image ───────────────────────────────────────────────────────────

  private _image(): Node {
    this.pos += 2 // skip ![
    const alt = this._bracket()
    if (alt === null) return n(NodeType.Text, '![')
    if (this.src[this.pos] !== '(') return n(NodeType.Text, `![${alt}]`)
    this.pos++
    const href = this._paren()
    const nd = n(NodeType.Image, href, this.ctx.parse(alt))
    return nd
  }

  // ── I-05 Link ────────────────────────────────────────────────────────────

  private _link(): Node {
    this.pos++ // skip [
    const label = this._bracket()
    if (label === null) return n(NodeType.Text, '[')

    // Inline link [text](url)
    if (this.src[this.pos] === '(') {
      this.pos++
      const href = this._paren()
      const nd = n(NodeType.Link, undefined, this.ctx.parse(label))
      nd.url = href
      return nd
    }

    // Reference link [text][id] or [text][] or [text]
    if (this.src[this.pos] === '[') {
      this.pos++
      const id = this._bracket()
      if (id === null) return n(NodeType.Text, `[${label}][`)
      return this._linkRef(label, (id || label).toLowerCase())
    }

    return this._linkRef(label, label.toLowerCase())
  }

  private _linkRef(display: string, id: string): Node {
    const nd = n(NodeType.LinkRef, undefined, this.ctx.parse(display))
    nd.defId = id
    const def = this.ctx.defs.get(id)
    if (def) nd.url = def.url
    this.ctx.refs.push({ node: nd, blockIndex: this.ctx.blockIndex })
    return nd
  }

  private _bracket(): string | null {
    let depth = 1, s = ''
    while (this.pos < this.src.length) {
      const c = this._eat()
      if (c === '[') depth++
      else if (c === ']') { if (--depth === 0) return s }
      s += c
    }
    return null
  }

  private _paren(): string {
    let href = '', depth = 1
    while (this.src[this.pos] === ' ') this.pos++
    if (this.src[this.pos] === '<') {
      this.pos++
      while (this.pos < this.src.length && this.src[this.pos] !== '>') href += this._eat()
      if (this.src[this.pos] === '>') this.pos++
    } else {
      while (this.pos < this.src.length) {
        const c = this.src[this.pos]
        if (c === '(')               depth++
        else if (c === ')')          { if (--depth === 0) break }
        else if (c === ' ' || c === '\t') break
        href += this._eat()
      }
    }
    // skip title
    while (this.src[this.pos] === ' ') this.pos++
    const q = this.src[this.pos]
    if (q === '"' || q === "'" || q === '(') {
      const close = q === '(' ? ')' : q
      this.pos++
      while (this.pos < this.src.length && this.src[this.pos] !== close) this.pos++
      if (this.src[this.pos] === close) this.pos++
    }
    while (this.src[this.pos] === ' ') this.pos++
    if (this.src[this.pos] === ')') this.pos++
    return href
  }

  // ── I-04 Emphasis / Strong ───────────────────────────────────────────────

  private _emph(): Node {
    const c = this.src[this.pos]
    let cnt = 0
    while (this.src[this.pos + cnt] === c) cnt++
    const lf = leftFlanking(this.src, this.pos, cnt)
    const rf = rightFlanking(this.src, this.pos, cnt)

    if (!lf) {
      this.pos += cnt
      return n(NodeType.Text, c.repeat(cnt))
    }

    // Try strong (2) then em (1)
    if (cnt >= 3) {
      const inner = this._delimited(c.repeat(3))
      if (inner) return n(NodeType.Strong, '', [n(NodeType.Em, '', inner)])
    }
    if (cnt >= 2) {
      const inner = this._delimited(c.repeat(2))
      if (inner) return n(NodeType.Strong, '', inner)
    }
    const inner = this._delimited(c)
    if (inner) return n(NodeType.Em, '', inner)

    this.pos++
    return n(NodeType.Text, c)
  }

  private _delimited(delim: string): Node[] | null {
    const saved = this.pos
    if (this.src.slice(this.pos, this.pos + delim.length) !== delim) return null
    this.pos += delim.length
    const start = this.pos
    while (this.pos < this.src.length) {
      if (this.src.slice(this.pos, this.pos + delim.length) === delim &&
          this.src[this.pos + delim.length] !== delim[0] &&
          rightFlanking(this.src, this.pos, delim.length)) {
        const inner = this.src.slice(start, this.pos)
        this.pos += delim.length
        return this.ctx.parse(inner)
      }
      this.pos++
    }
    this.pos = saved
    return null
  }

  // ── Text ─────────────────────────────────────────────────────────────────

  private _text(): Node {
    const specials = new Set(['`', '\\', '<', '!', '[', '*', '_', '&', '\n'])
    let s = ''
    while (this.pos < this.src.length) {
      const c = this.src[this.pos]
      if (specials.has(c)) break
      if (this.extraRules.some(r => r.trigger(c, this.src[this.pos + 1] ?? ''))) break
      // Bare autolink triggers
      const rest = this.src.slice(this.pos)
      if (/^(?:https?|ftp):\/\//.test(rest) || /^www\.[a-zA-Z]/.test(rest)) break
      if (/^[a-zA-Z0-9][a-zA-Z0-9._%+\-]*@[a-zA-Z0-9]/.test(rest)) break
      // Hard line break: 2+ trailing spaces before \n
      if (c === ' ' && this.src[this.pos + 1] === ' ') {
        const afterSpaces = this.src.slice(this.pos).match(/^( +)\n/)
        if (afterSpaces) {
          if (s) return n(NodeType.Text, s)
          this.pos += afterSpaces[1].length // eat spaces, let \n be processed next
          // replace \n with HardBr
          this.pos++ // eat \n
          return n(NodeType.HardBr, '')
        }
      }
      s += this._eat()
    }
    return n(NodeType.Text, s || this._eat())
  }

  private _eat(): string {
    return this.src[this.pos++] ?? ''
  }
}

function mergeText(nodes: Node[]): Node[] {
  const out: Node[] = []
  for (const nd of nodes) {
    const prev = out[out.length - 1]
    if (nd.type === NodeType.Text && prev?.type === NodeType.Text) {
      prev.text = (prev.text ?? '') + (nd.text ?? '')
    } else {
      out.push(nd)
    }
  }
  return out
}

// ─── Public parse function ────────────────────────────────────────────────────

export function parseInline(
  src: string,
  ctx: InlineContext,
  extraRules: InlineRule[] = [],
): Node[] {
  const scanner = new InlineScanner(src, ctx, extraRules)
  return scanner.scan()
}

// ─── Core inline rules (none for now — built into scanner) ───────────────────
// Plugin InlineRule objects are passed via extraRules and tried before scanner logic.

export const coreInlineRules: InlineRule[] = []
