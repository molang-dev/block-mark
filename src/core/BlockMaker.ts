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
  return line.replace(/^[ \t]*> ?/, '')
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function linesEq(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((l, i) => l === b[i])
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
    this._blockRules = opts.disableIndentedCode
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
    let blockOrder = 0
    const pendingEntries: Node[] = []
    const ctx = this._makeHtmlCtx()

    for (const bl of this._subdivide(lines, 0)) {
      bl.order = blockOrder++
      bl.id = this._nextId++
      this._processBlock(bl)
      this._blocks.push(bl)
      if (bl.type === BlockType.Toc) {
        bl.markdown = pendingEntries
      } else {
        const fn = this._htmlBlock.get(bl.type)
        if (fn) bl.html = fn(bl, ctx)
        if (bl.type === BlockType.Heading) {
          pendingEntries.push(this._makeTocEntry(bl))
        }
      }
    }

    // Re-process and re-render blocks whose lines were extended by _mergeTrailingBlanks
    const lenSnap = this._blocks.map(b => b.lines.length)
    this._mergeTrailingBlanks()
    for (let i = 0; i < this._blocks.length; i++) {
      const bl = this._blocks[i]
      if (bl.lines.length !== lenSnap[i]) {
        this._processBlock(bl)
        if (bl.type !== BlockType.Toc) {
          const fn = this._htmlBlock.get(bl.type)
          if (fn) bl.html = fn(bl, ctx)
        }
      }
    }

    this._assignTypeNames()
    this._renderTocHtml(ctx)
    this._notify(this._blocks, deletedIds, true)
    return this
  }

  parseFile(filename: string): this {
    if (typeof process === 'undefined' || !process.versions?.node) {
      throw new Error('BlockMaker.parseFile() is only available in Node.js. Use parse(content) in browser environments.')
    }
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
    const pendingEntries: Node[] = []
    const ctx = this._makeHtmlCtx()

    const flush = (isEnd: boolean) => {
      const batchStart = globalLine - pendingLines.length
      const newBlocks: Block[] = []
      for (const bl of this._subdivide(pendingLines, batchStart)) {
        bl.order = blockOrder++
        bl.id = this._nextId++
        this._processBlock(bl)
        this._blocks.push(bl)
        newBlocks.push(bl)
        if (bl.type === BlockType.Toc) {
          bl.markdown = pendingEntries
        } else {
          const fn = this._htmlBlock.get(bl.type)
          if (fn) bl.html = fn(bl, ctx)
          if (bl.type === BlockType.Heading) {
            pendingEntries.push(this._makeTocEntry(bl))
            // Any toc block processed in a previous batch needs re-render
            for (const toc of this._blocks) {
              if (toc.type === BlockType.Toc) toc.dirty = DirtyFlag.Changed
            }
          }
        }
      }
      pendingLines = []
      if (isEnd) {
        const lenSnap = this._blocks.map(b => b.lines.length)
        this._mergeTrailingBlanks()
        for (let i = 0; i < this._blocks.length; i++) {
          const bl = this._blocks[i]
          if (bl.lines.length !== lenSnap[i]) {
            this._processBlock(bl)
            if (bl.type !== BlockType.Toc) {
              const fn = this._htmlBlock.get(bl.type)
              if (fn) bl.html = fn(bl, ctx)
            }
          }
        }
        this._assignTypeNames()
        this._renderTocHtml(ctx)
        this._notify(this._blocks, pendingDeletedIds, true)
        pendingDeletedIds = []
      } else {
        this._assignTypeNames()
        this._renderTocHtml(ctx)
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

    for (const b of this._blocks) b.dirty = DirtyFlag.Clean

    const rawLines = [...this._rawLines]

    row1 = Math.max(0, Math.min(row1, rawLines.length - 1))
    row2 = Math.max(row1, Math.min(row2, rawLines.length - 1))

    const prefix   = (rawLines[row1] ?? '').slice(0, col1)
    const suffix   = (rawLines[row2] ?? '').slice(col2)
    const middle   = (prefix + content + suffix).split('\n')
    const lineDelta = middle.length - (row2 - row1 + 1)

    rawLines.splice(row1, row2 - row1 + 1, ...middle)

    const firstAffected = this._blocks.findIndex(b => b.lineEnd >= row1)
    const lastAffected  = this._blocks.findIndex(b => b.lineStart > row2)
    let lo = firstAffected < 0 ? this._blocks.length - 1 : firstAffected
    let hi = lastAffected  < 0 ? this._blocks.length - 1 : lastAffected - 1
    if (lo > hi) {
      if (hi < 0) hi = lo
      else        [lo, hi] = [hi, lo]
    }

    const innerLo = lo, innerHi = hi
    if (lo > 0)                        lo--
    if (hi < this._blocks.length - 1)  hi++

    const prevBlock     = lo < innerLo ? this._blocks[lo] : null
    const nextBlock     = hi > innerHi ? this._blocks[hi] : null
    const prevBlockSnap = prevBlock ? prevBlock.lines.slice() : null

    const secStart = Math.min(this._blocks[lo].lineStart, row1)
    const secEnd   = Math.max(this._blocks[hi].lineEnd, row2) + lineDelta

    const affLines = rawLines.slice(secStart, secEnd + 1)
    const newBlocks = this._subdivide(affLines, secStart)

    let nbEnd = newBlocks.length
    if (nextBlock && nbEnd > 0 && linesEq(newBlocks[nbEnd - 1].lines, nextBlock.lines)) nbEnd--

    const fullOldBlocks = this._blocks.slice(lo, hi + 1)
    const posPool = nbEnd < newBlocks.length ? fullOldBlocks.slice(0, -1) : fullOldBlocks

    const ctx = this._makeHtmlCtx()

    let blockOrder = lo
    for (let i = 0; i < newBlocks.length; i++) {
      newBlocks[i].order = blockOrder++
      if (i === nbEnd && nextBlock) {
        newBlocks[i].id = nextBlock.id
      } else if (i < posPool.length) {
        newBlocks[i].id = posPool[i].id
      } else {
        newBlocks[i].id = this._nextId++
      }
      this._processBlock(newBlocks[i])
      // Override dirty after _processBlock (which always resets to Changed)
      if (i === nbEnd && nextBlock) {
        newBlocks[i].dirty = newBlocks[i].lineStart !== nextBlock.lineStart
          ? DirtyFlag.Shifted : DirtyFlag.Clean
      } else if (i < posPool.length && linesEq(newBlocks[i].lines, posPool[i].lines)) {
        newBlocks[i].dirty = lineDelta !== 0 ? DirtyFlag.Shifted : DirtyFlag.Clean
      }
      // Generate html immediately for non-Toc changed blocks
      if (newBlocks[i].type !== BlockType.Toc && newBlocks[i].dirty === DirtyFlag.Changed) {
        const fn = this._htmlBlock.get(newBlocks[i].type)
        if (fn) newBlocks[i].html = fn(newBlocks[i], ctx)
      }
    }

    const assignedIds = new Set(newBlocks.map(b => b.id))
    const deletedIds  = fullOldBlocks.filter(b => !assignedIds.has(b.id)).map(b => b.id)

    this._blocks.splice(lo, hi - lo + 1, ...newBlocks)

    for (let i = lo + newBlocks.length; i < this._blocks.length; i++) {
      const bl = this._blocks[i]
      bl.order = i
      if (lineDelta !== 0) {
        bl.lineStart += lineDelta; bl.lineEnd += lineDelta
        bl.dirty = DirtyFlag.Shifted
      }
    }

    this._rawLines = rawLines
    const dirtySnapshot = this._blocks.map(b => b.dirty)
    this._mergeTrailingBlanks()
    if (prevBlockSnap && this._blocks[lo]) {
      if (linesEq(this._blocks[lo].lines, prevBlockSnap)) this._blocks[lo].dirty = DirtyFlag.Clean
    }
    // Re-process and re-render blocks extended by _mergeTrailingBlanks
    for (let i = 0; i < this._blocks.length; i++) {
      if (this._blocks[i].dirty === DirtyFlag.Changed && dirtySnapshot[i] < DirtyFlag.Changed) {
        this._processBlock(this._blocks[i])
        if (this._blocks[i].type !== BlockType.Toc) {
          const fn = this._htmlBlock.get(this._blocks[i].type)
          if (fn) this._blocks[i].html = fn(this._blocks[i], ctx)
        }
      }
    }

    this._assignTypeNames()
    this._updateToc(fullOldBlocks, newBlocks, assignedIds)
    this._renderTocHtml(ctx)

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
    return this._blocks
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

  _subdivide(lines: string[], lineStart: number): Block[] {
    const ctx: BlockContext = {
      defs: this._defs, refs: this._refs, blockIndex: this._blocks.length,
      docLineStart: lineStart, disableIndentedCode: this._opts.disableIndentedCode,
    }
    const blocks: Block[] = []
    let i = 0

    while (i < lines.length) {
      let matched = false
      for (const rule of this._blockRules) {
        const block = rule.tryCollect(lines, i, ctx)
        if (block) {
          block.lineStart = lineStart + i
          block.lineEnd   = block.lineStart + block.lines.length - 1
          blocks.push(block)
          i += block.lines.length
          while (i < lines.length && lines[i] === '') {
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

  private _normLines(lines: string[]): string[] {
    return this._opts.disableIndentedCode
      ? lines.map(l => l.replace(/^[ \t]+/, ''))
      : lines
  }

  private _registerCoreProcessors(): void {
    this._blockProcessors.set(BlockType.Heading, (block, ctx) => {
      const { content, brs } = peelBlanks(block.lines)
      const normed = this._normLines(content)
      let text = normed[0] ?? ''
      if (normed.length === 1) {
        text = text.replace(/^( {0,3})#{1,6}\s*/, '').replace(/\s+#+\s*$/, '').trim()
      } else {
        text = normed.slice(0, -1).join('\n')
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
      let lines = content
      if (this._opts.disableIndentedCode) {
        const nonBlank = content.filter(l => l !== '')
        const min = nonBlank.reduce((m, l) => Math.min(m, (l.match(/^[ \t]*/) ?? [''])[0].length), Infinity)
        if (min > 0 && isFinite(min)) lines = content.map(l => l === '' ? l : l.slice(min))
      }
      const { node } = buildListNode(
        lines, 0,
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

  private _extractText(nodes: Node[]): string {
    return (nodes ?? []).map(n => n.children ? this._extractText(n.children) : (n.text ?? '')).join('')
  }

  private _makeTocEntry(heading: Block): Node {
    return {
      type: NodeType.Link,
      depth: heading.depth ?? 1,
      defId: String(heading.id),
      url: `#bmd-h-${heading.id}`,
      children: [{ type: NodeType.Text, text: this._extractText(heading.markdown?.[0]?.children ?? []) }],
    }
  }

  private _renderTocHtml(ctx: HtmlCtx): void {
    const fn = this._htmlBlock.get(BlockType.Toc)
    if (!fn) return
    for (const bl of this._blocks) {
      if (bl.type === BlockType.Toc && bl.dirty === DirtyFlag.Changed) {
        bl.html = fn(bl, ctx)
      }
    }
  }

  private _updateToc(fullOldBlocks: Block[], newBlocks: Block[], assignedIds: Set<number>): void {
    const tocBlocks = this._blocks.filter(b => b.type === BlockType.Toc)
    if (tocBlocks.length === 0) return

    const newBlockIds = new Set(newBlocks.map(b => b.id))
    const newTocBlocks      = tocBlocks.filter(b =>  newBlockIds.has(b.id))
    const existingTocBlocks = tocBlocks.filter(b => !newBlockIds.has(b.id))

    // Toc blocks in the re-parse range: full rebuild from all current headings
    if (newTocBlocks.length > 0) {
      const entries = this._blocks
        .filter(b => b.type === BlockType.Heading)
        .map(b => this._makeTocEntry(b))
      for (const toc of newTocBlocks) {
        toc.markdown = entries
        toc.dirty = DirtyFlag.Changed
      }
    }

    // Toc blocks outside the range: incremental update
    if (existingTocBlocks.length > 0) {
      const oldHeadingIds = new Set(fullOldBlocks.map(b => b.id))
      const deletedDefIds = new Set(
        fullOldBlocks
          .filter(b => !assignedIds.has(b.id) && b.type === BlockType.Heading)
          .map(b => String(b.id))
      )
      const changedHeadings = newBlocks.filter(b =>
        b.type === BlockType.Heading && b.dirty === DirtyFlag.Changed && oldHeadingIds.has(b.id))
      const addedHeadings = newBlocks.filter(b =>
        b.type === BlockType.Heading && !oldHeadingIds.has(b.id))

      let changed = false

      // 1. Remove deleted headings
      if (deletedDefIds.size > 0) {
        for (const toc of existingTocBlocks) {
          toc.markdown = (toc.markdown ?? []).filter(n => !deletedDefIds.has(n.defId ?? ''))
        }
        changed = true
      }

      // 2. Update changed headings (content only)
      for (const h of changedHeadings) {
        const entry = this._makeTocEntry(h)
        for (const toc of existingTocBlocks) {
          const md = toc.markdown ?? []
          const idx = md.findIndex(n => n.defId === String(h.id))
          if (idx >= 0) { md[idx] = entry; changed = true }
        }
      }

      // 3. Insert added headings at correct position
      for (const h of addedHeadings) {
        const entry = this._makeTocEntry(h)
        const hPos = this._blocks.indexOf(h)
        const beforeIds = new Set(
          this._blocks.slice(0, hPos)
            .filter(b => b.type === BlockType.Heading)
            .map(b => String(b.id))
        )
        for (const toc of existingTocBlocks) {
          const md = toc.markdown ?? []
          let insertIdx = 0
          for (let i = md.length - 1; i >= 0; i--) {
            if (beforeIds.has(md[i].defId ?? '')) { insertIdx = i + 1; break }
          }
          md.splice(insertIdx, 0, entry)
          toc.markdown = md
          changed = true
        }
      }

      if (changed) {
        for (const toc of existingTocBlocks) toc.dirty = DirtyFlag.Changed
      }
    }
  }

  private _notify(changedBlocks: Block[], deletedIds: number[], isEnd: boolean): void {
    const all = this.allBlocks()
    for (const p of this._plugins) p.onChanged?.(changedBlocks, deletedIds, all, isEnd)
    if (this._callback) this._callback(changedBlocks, isEnd)
  }
}
