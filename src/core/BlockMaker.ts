import type { openSync as _OpenSync, readSync as _ReadSync, closeSync as _CloseSync } from 'node:fs'
import {
  Block, BlockMakerOptions, BlockMakerPlugin, BlockRule, InlineRule,
  HtmlCtx, ChangedCallback, DirtyFlag, BlockContext, Node,
  NodeType, BlockType, InlineContext, BlockProcessorCtx, LinkType,
} from './types'
import { coreBlockRules, coreBlockTypeNames, coreNodeTypeNames } from './parse-blocks'
import { parseInline, coreInlineRules } from './parse-inline'

// ─── List building (CommonMark W-rule) ───────────────────────────────────────

function countLeading(line: string): number {
  let i = 0; while (i < line.length && line[i] === ' ') i++; return i
}

function parseMarker(line: string): { W: number; firstContent: string; ordered: boolean; start: number } | null {
  const bm = line.match(/^( {0,3})([-*+])( +)(.*)$/)
  if (bm) {
    const col = bm[1].length, spaces = bm[3].length
    const eff = spaces >= 5 ? 1 : spaces
    return { W: col + 1 + eff, firstContent: spaces >= 5 ? ' '.repeat(spaces - 1) + bm[4] : bm[4], ordered: false, start: 1 }
  }
  const om = line.match(/^( {0,3})(\d{1,9})([.)]) ?( +)(.*)$/)
  if (om) {
    const col = om[1].length, mlen = om[2].length + 1, spaces = (om[4] ?? ' ').length
    const eff = spaces >= 5 ? 1 : spaces
    return { W: col + mlen + eff, firstContent: spaces >= 5 ? ' '.repeat(spaces - 1) + (om[5] ?? '') : (om[5] ?? ''), ordered: true, start: parseInt(om[2], 10) }
  }
  return null
}

function buildListNode(
  lines: string[],
  start: number,
  parseInlineFn: (s: string) => Node[],
  subdivFn: (ls: string[], lstart: number) => Block[],
  processBlockFn: (b: Block) => Node[],
): { node: Node; end: number } {
  const items: Node[] = []
  let loose = false
  let i = start
  let prevBlank = false
  let ordered = false
  let listStart = 1

  while (i < lines.length) {
    const line = lines[i]
    if (line === '') { if (items.length > 0) prevBlank = true; i++; continue }
    const marker = parseMarker(line)
    if (!marker) break
    if (prevBlank && items.length > 0) loose = true
    prevBlank = false
    if (items.length === 0) { ordered = marker.ordered; listStart = marker.start }

    const { W, firstContent } = marker
    const contentLines: string[] = [firstContent]
    i++
    let itemBlank = false

    while (i < lines.length) {
      const l = lines[i]
      if (l === '') { itemBlank = true; contentLines.push(''); i++; continue }
      const indent = countLeading(l)
      if (indent >= W) {
        if (itemBlank) loose = true
        contentLines.push(l.slice(W))
        itemBlank = false; i++
      } else break
    }

    if (itemBlank) prevBlank = true
    while (contentLines.length && contentLines[contentLines.length - 1] === '') contentLines.pop()

    // Parse item content
    const itemChildren = buildItemContent(contentLines, parseInlineFn, subdivFn, processBlockFn)
    const itemNode: Node = { type: NodeType.ListItem, children: itemChildren }
    items.push(itemNode)
  }

  const listNode: Node = { type: NodeType.List, children: items, ordered, start: listStart }
  if (loose) listNode.loose = true
  return { node: listNode, end: i }
}

function buildItemContent(
  lines: string[],
  parseInlineFn: (s: string) => Node[],
  subdivFn: (ls: string[], lstart: number) => Block[],
  processBlockFn: (b: Block) => Node[],
): Node[] {
  const nodes: Node[] = []
  let i = 0
  while (i < lines.length) {
    if (lines[i] === '') { i++; continue }
    if (parseMarker(lines[i])) {
      const { node, end } = buildListNode(lines, i, parseInlineFn, subdivFn, processBlockFn)
      nodes.push(node); i = end; continue
    }
    const paraLines: string[] = []
    while (i < lines.length && lines[i] !== '' && !parseMarker(lines[i])) {
      paraLines.push(lines[i]); i++
    }
    if (paraLines.length) {
      nodes.push({ type: NodeType.Paragraph, children: parseInlineFn(paraLines.join('\n')) })
    }
    if (i < lines.length && lines[i] === '') i++
  }
  return nodes
}

// ─── Blockquote processing ───────────────────────────────────────────────────

function stripBq(line: string): string {
  return line.replace(/^( {0,3})> ?/, '')
}

function peelBlanks(lines: string[]): { content: string[]; brs: Node[] } {
  const content = [...lines]
  const brs: Node[] = []
  while (content.length > 0 && content[content.length - 1] === '') {
    content.pop()
    brs.unshift({ type: NodeType.Br })
  }
  return { content, brs }
}

// ─── BlockMaker ──────────────────────────────────────────────────────────────

export class BlockMaker {
  private _opts: BlockMakerOptions
  private _blockRules: BlockRule[]
  private _inlineRules: InlineRule[]
  private _blockProcessors: Map<number, (block: Block, ctx: BlockProcessorCtx) => Node[]>
  private _htmlBlock: Map<number, (block: Block, ctx: HtmlCtx) => string>
  private _htmlNode: Map<number, (node: Node, ctx: HtmlCtx) => string>
  private _blockTypeNames: Map<number, string>
  private _nodeTypeNames: Map<number, string>
  private _blocks: Block[] = []
  private _rawLines: string[] = []
  private _tocBlock: Block | null = null
  private _defs: Map<string, { url: string; blockIndex: number }> = new Map()
  private _refs: Array<{ node: Node; blockIndex: number }> = []
  private _plugins: BlockMakerPlugin[] = []
  private _nextId = 1
  private _callback: ChangedCallback | null = null
  private _batchSizes: number[] = [400, 800, 1600, 3200]
  private _batchIdx = 0

  constructor(opts: BlockMakerOptions = {}) {
    this._opts = opts
    if (opts.batchSizes) this._batchSizes = opts.batchSizes
    this._blockRules = opts.indentedCode === false
      ? coreBlockRules.filter(r => r.name !== 'indented-code')
      : [...coreBlockRules]
    this._inlineRules = [...coreInlineRules]
    this._blockProcessors = new Map()
    this._htmlBlock = new Map()
    this._htmlNode = new Map()
    this._blockTypeNames = new Map(Object.entries(coreBlockTypeNames).map(([k, v]) => [Number(k), v]))
    this._nodeTypeNames  = new Map(Object.entries(coreNodeTypeNames).map(([k, v]) => [Number(k), v]))
    this._registerCoreProcessors()
  }

  applyTheme(theme: string): this {
    for (const p of this._plugins) p.applyTheme?.(theme)
    return this
  }

  use(plugin: BlockMakerPlugin): this {
    this._plugins.push(plugin)
    if (plugin.blockRules) {
      this._blockRules.push(...plugin.blockRules)
      this._blockRules.sort((a, b) => a.priority - b.priority)
    }
    if (plugin.inlineRules) {
      this._inlineRules.push(...plugin.inlineRules)
      this._inlineRules.sort((a, b) => a.priority - b.priority)
    }
    if (plugin.blockProcessors) {
      for (const [k, fn] of Object.entries(plugin.blockProcessors))
        this._blockProcessors.set(Number(k), fn)
    }
    if (plugin.htmlBlock) {
      for (const [k, fn] of Object.entries(plugin.htmlBlock))
        this._htmlBlock.set(Number(k), fn as (block: Block, ctx: HtmlCtx) => string)
    }
    if (plugin.htmlNode) {
      for (const [k, fn] of Object.entries(plugin.htmlNode))
        this._htmlNode.set(Number(k), fn as (node: Node, ctx: HtmlCtx) => string)
    }
    if (plugin.blockTypeNames) {
      for (const [k, v] of Object.entries(plugin.blockTypeNames))
        this._blockTypeNames.set(Number(k), v)
    }
    if (plugin.nodeTypeNames) {
      for (const [k, v] of Object.entries(plugin.nodeTypeNames))
        this._nodeTypeNames.set(Number(k), v)
    }
    return this
  }

  changed(cb: ChangedCallback): this {
    this._callback = cb
    return this
  }

  parse(content: string): this {
    const deletedIds = this._blocks.map(b => b.id)
    this._reset()
    const lines = content.split('\n')
    this._rawLines = lines
    const sections = this._splitSections(lines)
    let blockOrder = 0
    for (const sec of sections) {
      const blocks = this._subdivide(sec.lines, sec.lineStart)
      for (const bl of blocks) {
        bl.order = blockOrder++
        bl.id = this._nextId++
        this._processBlock(bl)
        this._blocks.push(bl)
      }
    }
    this._mergeTrailingBlanks()
    this._assignTypeNames()
    this._runHtmlPass()
    this._notify(this._blocks, deletedIds, true)
    // Reset dirty flags after parse — parse creates a fresh baseline
    for (const b of this._blocks) b.dirty = DirtyFlag.Clean
    return this
  }

  parseFile(filename: string): this {
    if (typeof process === 'undefined' || !process.versions?.node) {
      throw new Error('BlockMaker.parseFile() is only available in Node.js. Use parse(content) in browser environments.')
    }
    // Lazy-load node:fs — avoids Vite externalising the module at build time.
    // String split prevents static analysis by bundlers.
    const { openSync, readSync, closeSync } = require('node' + ':fs') as {
      openSync:  typeof _OpenSync
      readSync:  typeof _ReadSync
      closeSync: typeof _CloseSync
    }
    let pendingDeletedIds = this._blocks.map(b => b.id)
    this._reset()
    const CHUNK = 64 * 1024
    const fd = openSync(filename, 'r')
    const buf = Buffer.alloc(CHUNK)
    let pending = ''
    let pendingLines: string[] = []
    let globalLine = 0
    let blockOrder = 0
    let batchCount = 0

    const flush = (isEnd: boolean) => {
      const sections = this._splitSections(pendingLines)
      const newBlocks: Block[] = []
      for (const sec of sections) {
        const blocks = this._subdivide(sec.lines, sec.lineStart)
        for (const bl of blocks) {
          bl.order = blockOrder++
          bl.id = this._nextId++
          this._processBlock(bl)
          this._blocks.push(bl)
          newBlocks.push(bl)
        }
      }
      pendingLines = []
      if (isEnd) {
        this._mergeTrailingBlanks()
        this._assignTypeNames()
        this._runHtmlPass()
        this._notify(this._blocks, pendingDeletedIds, true)
        pendingDeletedIds = []
      } else {
        this._assignTypeNames()
        this._runHtmlPass()
        const size = this._batchSizes[Math.min(this._batchIdx, this._batchSizes.length - 1)]
        batchCount += newBlocks.length
        if (batchCount >= size) {
          this._notify(newBlocks, pendingDeletedIds, false)
          pendingDeletedIds = []
          this._batchIdx++; batchCount = 0
        }
      }
    }

    let bytesRead: number
    while ((bytesRead = readSync(fd, buf, 0, CHUNK, null)) > 0) {
      const chunk = pending + buf.slice(0, bytesRead).toString('utf8')
      const parts = chunk.split('\n')
      pending = parts.pop()!
      for (const l of parts) { pendingLines.push(l); globalLine++ }
      const size = this._batchSizes[Math.min(this._batchIdx, this._batchSizes.length - 1)]
      if (pendingLines.length >= size) flush(false)
    }
    closeSync(fd)
    if (pending) pendingLines.push(pending)
    flush(true)
    return this
  }

  update(row1: number, col1: number, row2: number, col2: number, content: string): void {
    if (!this._blocks.length) { this.parse(content); return }

    // Clear dirty flags left over from the previous update before computing new ones
    for (const b of this._blocks) b.dirty = DirtyFlag.Clean

    const rawLines = [...this._rawLines]

    // Clamp coordinates
    row1 = Math.max(0, Math.min(row1, rawLines.length - 1))
    row2 = Math.max(row1, Math.min(row2, rawLines.length - 1))

    const prefix   = (rawLines[row1] ?? '').slice(0, col1)
    const suffix   = (rawLines[row2] ?? '').slice(col2)
    const middle   = (prefix + content + suffix).split('\n')
    const lineDelta = middle.length - (row2 - row1 + 1)

    // Splice raw lines
    rawLines.splice(row1, row2 - row1 + 1, ...middle)

    // Find affected blocks (expand to whole contiguous range)
    const firstAffected = this._blocks.findIndex(b => b.lineEnd >= row1)
    const lastAffected  = this._blocks.findIndex(b => b.lineStart > row2)
    let lo = firstAffected < 0 ? this._blocks.length - 1 : firstAffected
    let hi = lastAffected  < 0 ? this._blocks.length - 1 : lastAffected - 1
    // Edit in uncovered gap: expand to surrounding blocks
    if (lo > hi) {
      if (hi < 0) hi = lo
      else        [lo, hi] = [hi, lo]
    }

    // Snap to surrounding section boundaries
    const secStart = Math.min(this._blocks[lo].lineStart, row1)
    const secEnd   = Math.max(this._blocks[hi].lineEnd, row2) + lineDelta

    // Re-subdivide affected lines
    const affLines = rawLines.slice(secStart, secEnd + 1)
    const newBlocks = this._subdivide(affLines, secStart)

    // Reuse old ids by position; only truly removed blocks go into deletedIds
    const oldBlocks = this._blocks.slice(lo, hi + 1)
    const deletedIds = oldBlocks.slice(newBlocks.length).map(b => b.id)

    // Assign order and id: reuse old id when a matching position exists
    let blockOrder = lo
    for (let i = 0; i < newBlocks.length; i++) {
      newBlocks[i].order = blockOrder++
      newBlocks[i].id = i < oldBlocks.length ? oldBlocks[i].id : this._nextId++
      this._processBlock(newBlocks[i])
      // If content is identical to old block, downgrade Changed to Shifted/Clean
      if (i < oldBlocks.length) {
        const nb = newBlocks[i], ob = oldBlocks[i]
        if (nb.lines.length === ob.lines.length && nb.lines.every((l, j) => l === ob.lines[j])) {
          nb.dirty = lineDelta !== 0 ? DirtyFlag.Shifted : DirtyFlag.Clean
        }
      }
    }

    // Splice into _blocks
    this._blocks.splice(lo, hi - lo + 1, ...newBlocks)

    // Fix subsequent blocks: update order, keep id; shift line numbers when needed
    for (let i = lo + newBlocks.length; i < this._blocks.length; i++) {
      const bl = this._blocks[i]
      bl.order = i
      if (lineDelta !== 0) {
        bl.lineStart += lineDelta; bl.lineEnd += lineDelta
        bl.dirty = DirtyFlag.Shifted
      }
    }

    this._rawLines = rawLines  // update early so _mergeTrailingBlanks can read new content
    const dirtySnapshot = this._blocks.map(b => b.dirty)
    this._mergeTrailingBlanks()
    // Re-process blocks whose lines were extended by _mergeTrailingBlanks
    for (let i = 0; i < this._blocks.length; i++) {
      if (this._blocks[i].dirty === DirtyFlag.Changed && dirtySnapshot[i] < DirtyFlag.Changed) {
        this._processBlock(this._blocks[i])
      }
    }
    this._assignTypeNames()
    this._runHtmlPass()

    const dirty = this._blocks.filter(b => b.dirty > 0)
    if (dirty.length === 0) {
      this._notify([], deletedIds, true)
    } else {
      let sent = 0, batchIdx = 0
      while (sent < dirty.length) {
        const size = this._batchSizes[Math.min(batchIdx++, this._batchSizes.length - 1)]
        const batch = dirty.slice(sent, sent + size)
        sent += size
        const isEnd = sent >= dirty.length
        this._notify(batch, isEnd ? deletedIds : [], isEnd)
      }
    }
  }

  allBlocks(): Block[] {
    if (!this._opts.toc || !this._tocBlock) return this._blocks
    const firstHeadingIdx = this._blocks.findIndex(b => b.type === BlockType.Heading)
    if (firstHeadingIdx < 0) return this._blocks
    const result = [...this._blocks]
    result.splice(firstHeadingIdx + 1, 0, this._tocBlock)
    return result
  }

  findBlocks(start: number, end: number): Block[] {
    if (start > end) [start, end] = [end, start]
    return this._blocks.filter(b => b.lineStart <= end && b.lineEnd >= start)
  }

  // ─── private ─────────────────────────────────────────────────────────────

  private _reset(): void {
    this._blocks = []; this._rawLines = []; this._defs = new Map(); this._refs = []; this._batchIdx = 0
    this._nextId = 1
  }

  private _splitSections(lines: string[]): Array<{ lines: string[]; lineStart: number }> {
    const sections: Array<{ lines: string[]; lineStart: number }> = []
    let current: string[] = []
    let secStart = 0
    let inFence = false
    let fenceMark = ''

    const push = (start: number) => {
      if (current.length) { sections.push({ lines: current, lineStart: start }); current = [] }
    }

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      if (inFence) {
        if (new RegExp(`^( {0,3})${fenceMark}{3,}\\s*$`).test(l)) inFence = false
      } else {
        const fm = l.match(/^( {0,3})(`{3,}|~{3,})/)
        if (fm) {
          inFence = true; fenceMark = fm[2][0] === '`' ? '`' : '~'
        } else if (i !== 0 && /^( {0,3})(#{1,6})(\s|$)/.test(l)) {
          push(secStart); secStart = i
        }
      }
      current.push(l)
    }
    push(secStart)
    return sections.length ? sections : [{ lines, lineStart: 0 }]
  }

  _subdivide(lines: string[], lineStart: number): Block[] {
    // When indented-code is disabled, strip ≥4 leading spaces/tabs (no longer code markers)
    const ruleLines = this._opts.indentedCode === false
      ? lines.map(l => /^( {4,}|\t)/.test(l) ? l.replace(/^[ \t]+/, '') : l)
      : lines

    const ctx: BlockContext = { defs: this._defs, refs: this._refs, blockIndex: this._blocks.length }
    const blocks: Block[] = []
    let i = 0

    while (i < ruleLines.length) {
      let matched = false
      for (const rule of this._blockRules) {
        const block = rule.tryCollect(ruleLines, i, ctx)
        if (block) {
          block.lineStart = lineStart + i
          block.lineEnd   = block.lineStart + block.lines.length - 1
          blocks.push(block)
          i += block.lines.length
          // Absorb trailing blank lines into this block
          while (i < ruleLines.length && ruleLines[i] === '') {
            block.lines.push(lines[i]); block.lineEnd++; i++
          }
          ctx.blockIndex++
          matched = true
          break
        }
      }
      if (!matched) i++
    }

    return this._mergeTrailing(blocks)
  }

  private _mergeTrailing(blocks: Block[]): Block[] {
    const out: Block[] = []
    for (const bl of blocks) {
      if (bl.type === BlockType.Paragraph && bl.lines.length === 1 && bl.lines[0] === '') {
        if (out.length) { out[out.length - 1].lines.push(''); out[out.length - 1].lineEnd++ }
        else out.push(bl)
      } else out.push(bl)
    }
    return out
  }

  private _mergeTrailingBlanks(): void {
    for (let i = 0; i < this._blocks.length - 1; i++) {
      const cur  = this._blocks[i]
      const next = this._blocks[i + 1]
      if (cur.lineEnd + 1 < next.lineStart) {
        const blanks = next.lineStart - cur.lineEnd - 1
        for (let k = 0; k < blanks; k++) { cur.lines.push(''); cur.lineEnd++ }
        if (cur.dirty < DirtyFlag.Changed) cur.dirty = DirtyFlag.Changed
      }
    }
    if (this._blocks.length > 0) {
      const last   = this._blocks[this._blocks.length - 1]
      const docEnd = this._rawLines.length - 1
      while (last.lineEnd < docEnd && (this._rawLines[last.lineEnd + 1] ?? '') === '') {
        last.lines.push(''); last.lineEnd++
        if (last.dirty < DirtyFlag.Changed) last.dirty = DirtyFlag.Changed
      }
    }
  }

  private _makeInlineCtx(blockIndex: number): InlineContext {
    const self = this
    const ctx: InlineContext = {
      defs: this._defs, refs: this._refs, blockIndex,
      parse(src: string) { return parseInline(src, ctx, self._inlineRules) },
    }
    return ctx
  }

  private _makeProcessorCtx(blockIndex: number): BlockProcessorCtx {
    const inlineCtx = this._makeInlineCtx(blockIndex)
    return {
      parseInline: (src) => inlineCtx.parse(src),
      subdivide: (lines, ls) => this._subdivide(lines, ls),
      defs: this._defs, refs: this._refs, blockIndex,
    }
  }

  private _processBlock(block: Block): void {
    block.dirty = DirtyFlag.Changed
    const proc = this._blockProcessors.get(block.type)
    if (proc) {
      block.markdown = proc(block, this._makeProcessorCtx(block.order))
    }
  }

  private _registerCoreProcessors(): void {
    this._blockProcessors.set(BlockType.Heading, (block, ctx) => {
      const { content, brs } = peelBlanks(block.lines)
      let text = content[0] ?? ''
      if (content.length === 1) {
        // ATX: strip leading # and trailing #
        text = text.replace(/^( {0,3})#{1,6}\s*/, '').replace(/\s+#+\s*$/, '').trim()
      } else {
        // Setext: join all but last line (underline)
        text = content.slice(0, -1).join('\n')
      }
      const nd: Node = { type: NodeType.Heading, depth: block.depth ?? 1, children: ctx.parseInline(text) }
      return [nd, ...brs]
    })

    this._blockProcessors.set(BlockType.Paragraph, (block, ctx) => {
      const { content, brs } = peelBlanks(block.lines)
      const text = content.join('\n')
      return text ? [{ type: NodeType.Paragraph, children: ctx.parseInline(text) }, ...brs] : brs
    })

    this._blockProcessors.set(BlockType.Code, (block) => {
      const { content, brs } = peelBlanks(block.lines)
      const isFenced = /^\s*(`{3,}|~{3,})/.test(content[0] ?? '')
      let text: string
      if (isFenced) {
        const closeIdx = content.length > 1 && /^\s*(`{3,}|~{3,})/.test(content[content.length - 1]) ? content.length - 1 : undefined
        text = content.slice(1, closeIdx).join('\n')
      } else {
        // Indented: strip 4 spaces or 1 tab
        text = content.map(l => l.replace(/^( {4}|\t)/, '')).join('\n')
      }
      const nd: Node = { type: NodeType.Code, text, lang: block.meta || undefined }
      return [nd, ...brs]
    })

    this._blockProcessors.set(BlockType.Hr, (block) => {
      const { brs } = peelBlanks(block.lines)
      return [{ type: NodeType.Hr }, ...brs]
    })
    this._blockProcessors.set(BlockType.Html, (block) => {
      const { content, brs } = peelBlanks(block.lines)
      return [{ type: NodeType.Html, text: content.join('\n') }, ...brs]
    })
    this._blockProcessors.set(BlockType.Def, (block) => {
      const { brs } = peelBlanks(block.lines)
      const nd: Node = { type: NodeType.Def, defId: block.meta, text: block.lines[0] }
      return [nd, ...brs]
    })

    this._blockProcessors.set(BlockType.Blockquote, (block, ctx) => {
      const { content, brs } = peelBlanks(block.lines)
      const stripped = content.map(stripBq)
      const inner = ctx.subdivide(stripped, block.lineStart)
      const children: Node[] = []
      for (const ib of inner) {
        const proc = this._blockProcessors.get(ib.type)
        if (proc) {
          const iCtx = this._makeProcessorCtx(ib.order)
          children.push(...proc(ib, iCtx))
        }
      }
      return [{ type: NodeType.Blockquote, children }, ...brs]
    })

    this._blockProcessors.set(BlockType.List, (block, ctx) => {
      const { content, brs } = peelBlanks(block.lines)
      const { node } = buildListNode(
        content, 0,
        ctx.parseInline,
        ctx.subdivide,
        (b) => {
          const p = this._blockProcessors.get(b.type)
          return p ? p(b, ctx) : []
        },
      )
      return [node, ...brs]
    })
  }

  private _assignTypeNames(): void {
    if (!this._opts.showTypeName) return
    for (const bl of this._blocks) {
      const name = this._blockTypeNames.get(bl.type) ?? `Unknown(${bl.type})`
      const saved = { ...bl } as any
      for (const k of Object.keys(bl)) delete (bl as any)[k]
      bl.typeName = name
      Object.assign(bl, saved)
      for (const nd of bl.markdown ?? []) this._assignNodeTypeNames(nd)
    }
  }

  private _assignNodeTypeNames(nd: Node): void {
    const name = this._nodeTypeNames.get(nd.type) ?? `Unknown(${nd.type})`
    const saved = { ...nd } as any
    for (const k of Object.keys(nd)) delete (nd as any)[k]
    nd.typeName = name
    Object.assign(nd, saved)
    for (const child of nd.children ?? []) this._assignNodeTypeNames(child)
  }

  private _makeHtmlCtx(): HtmlCtx {
    const escape = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const renderNode = (nd: Node): string => {
      const fn = this._htmlNode.get(nd.type)
      if (fn) return fn(nd, ctx)
      return escape(nd.text ?? '')
    }
    const renderNodes = (nodes: Node[]): string => nodes.map(renderNode).join('')
    const renderLines = (lines: string[]): string => {
      const iCtx = this._makeInlineCtx(0)
      const nodes = parseInline(lines.join('\n'), iCtx, this._inlineRules)
      return renderNodes(nodes)
    }
    const ctx: HtmlCtx = { renderNodes, renderNode, renderLines, escape }
    return ctx
  }

  private _runHtmlPass(): void {
    if (this._htmlBlock.size === 0 && this._htmlNode.size === 0) return
    const ctx = this._makeHtmlCtx()
    for (const bl of this._blocks) {
      const fn = this._htmlBlock.get(bl.type)
      if (fn) bl.html = fn(bl, ctx)
    }
    this._buildToc()
  }

  private _extractText(nodes: Node[]): string {
    return (nodes ?? []).map(n => n.children ? this._extractText(n.children) : (n.text ?? '')).join('')
  }

  private _buildToc(): void {
    if (!this._opts.toc) return

    // Inject id into every heading's html
    for (const bl of this._blocks) {
      if (bl.type === BlockType.Heading && bl.html) {
        bl.html = bl.html.replace(/^<(h\d)>/, `<$1 id="bmd-h-${bl.id}">`)
      }
    }

    const headings = this._blocks.filter(b => b.type === BlockType.Heading)
    if (headings.length === 0) { this._tocBlock = null; return }

    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const parts: string[] = []
    const stack: number[] = []

    for (const b of headings) {
      const d = b.depth ?? 1
      const link = `<a href="#bmd-h-${b.id}">${esc(this._extractText(b.markdown?.[0]?.children ?? []))}</a>`
      if (stack.length === 0) {
        parts.push('<ul>', '<li>', link); stack.push(d)
      } else {
        const top = stack[stack.length - 1]
        if (d > top) {
          parts.push('<ul>', '<li>', link); stack.push(d)
        } else if (d === top) {
          parts.push('</li>', '<li>', link)
        } else {
          while (stack.length > 0 && stack[stack.length - 1] > d) {
            parts.push('</li>', '</ul>'); stack.pop()
          }
          if (stack.length > 0 && stack[stack.length - 1] === d) parts.push('</li>', '<li>', link)
          else { parts.push('<li>', link); stack.push(d) }
        }
      }
    }
    while (stack.length > 0) { parts.push('</li>', '</ul>'); stack.pop() }

    if (!this._tocBlock) {
      this._tocBlock = { type: BlockType.Toc, lines: [], id: 0, order: -1, lineStart: -1, lineEnd: -1, dirty: DirtyFlag.Clean }
      if (this._opts.showTypeName) this._tocBlock.typeName = 'Toc'
    }
    this._tocBlock.html = `<nav>${parts.join('')}</nav>`
  }

  private _notify(changedBlocks: Block[], deletedIds: number[], isEnd: boolean): void {
    const all = this.allBlocks()
    for (const p of this._plugins) p.onChanged?.(changedBlocks, deletedIds, all, isEnd)
    if (this._callback) this._callback(changedBlocks, isEnd)
  }
}
