import type { TypedBlock, BlockCallback, ParseContext, Node } from './types'
import { BlockType } from './types'
import { parseBlock } from './inline'

interface RawSection {
  lines: string[]
}

function linesEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

interface FlushCtx {
  batchIdx: number
  endSent: boolean
}

export class Parser {
  private _callbacks: BlockCallback[] = []          // onUpdate 注册的回调（只保留最新一个）
  private _blocks: TypedBlock[] = []                // 全部已完成解析的 block
  private _buffer: TypedBlock[] = []                // 待 flush 的 block 缓冲，凑够 batchSize 后通知
  private _batchSizes: number[] = [400, 800, 1600, 3200]  // 每批通知的 block 数量阶梯
  private _defs: Map<string, { url: string, blockIndex: number }> = new Map()
  private _refs: Array<{ node: Node, blockIndex: number }> = []

  private _currentBlock: RawSection | null = null   // 正在积累中、尚未结束的 section
  private _sectionStart = 0                         // 当前 section 在文档中的起始行号
  private _inFence = false                          // 是否在 code fence（``` 或 ~~~）内
  private _htmlDepth = 0                            // HTML 标签嵌套深度，>0 表示在 HTML block 内
  private _globalLineNum = 0                        // 已处理总行数（跨 chunk 累计，用于计算 lineStart）

  // ====== Public API ======

  setBatchSize(sizes: number[]): void {
    this._batchSizes = sizes
  }

  onUpdate(callback: BlockCallback): void {
    this._callbacks = [callback]
  }

  allBlocks(): TypedBlock[] {
    return this._blocks
  }

  read(content: string): void {
    const ctx: FlushCtx = { batchIdx: 0, endSent: false }
    this._read(content, false, ctx)
    if (this._currentBlock) {
      this._subdivideAndEmit(this._currentBlock.lines, this._sectionStart, ctx)
      this._currentBlock = null
    }
    this._flushRemaining(ctx)
  }

  readFile(filename: string): Error | null {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs: typeof import('fs') = require('fs')
    let fd: number
    try {
      fd = fs.openSync(filename, 'r')
    } catch (e) {
      return e as Error
    }

    const ctx: FlushCtx = { batchIdx: 0, endSent: false }
    const BUF_SIZE = 1024 * 10
    const buf = Buffer.alloc(BUF_SIZE)
    let leftover = ''
    let isFirst = true

    try {
      let bytesRead: number
      while ((bytesRead = fs.readSync(fd, buf, 0, BUF_SIZE, null)) > 0) {
        const chunk = leftover + buf.toString('utf-8', 0, bytesRead)
        const lines = chunk.split('\n')
        leftover = lines.pop() ?? ''
        if (lines.length > 0) {
          this._read(lines.join('\n'), !isFirst, ctx)
          isFirst = false
        }
      }
      fs.closeSync(fd)

      if (leftover) {
        this._read(leftover, !isFirst, ctx)
        isFirst = false
      }

      if (isFirst) {
        // empty file
        this._read('', false, ctx)
      }

      if (this._currentBlock) {
        this._subdivideAndEmit(this._currentBlock.lines, this._sectionStart, ctx)
        this._currentBlock = null
      }
      this._flushRemaining(ctx)
      return null
    } catch (err) {
      try { fs.closeSync(fd) } catch { /* ignore */ }
      return err as Error
    }
  }

  findBlocks(start: number, end: number): TypedBlock[] {
    if (start > end) [start, end] = [end, start]
    return this._blocks.filter(b => b.lineEnd >= start && b.lineStart <= end)
  }

  update(row1: number, col1: number, row2: number, col2: number, content: string): void {
    if (row1 > row2 || (row1 === row2 && col1 > col2)) {
      ;[row1, row2] = [row2, row1]
      ;[col1, col2] = [col2, col1]
    }

    for (const b of this._blocks) b.dirty = 0

    const affected   = this.findBlocks(row1, row2)
    const firstBlock = affected[0] ?? null
    const lastBlock  = affected[affected.length - 1] ?? null

    const prevBlock = firstBlock && firstBlock.index > 0
      ? this._blocks[firstBlock.index - 1]
      : null
    const nextBlock = lastBlock && lastBlock.index < this._blocks.length - 1
      ? this._blocks[lastBlock.index + 1]
      : null

    const expandFirst = prevBlock ?? firstBlock
    const expandLast  = nextBlock ?? lastBlock

    const firstIdx     = expandFirst?.index ?? this._blocks.length
    const sectionStart = expandFirst?.lineStart ?? row1

    const prefixLines   = firstBlock ? firstBlock.lines.slice(0, row1 - firstBlock.lineStart)  : []
    const suffixLines   = lastBlock  ? lastBlock.lines.slice(row2 - lastBlock.lineStart + 1)   : []
    const startLineText = firstBlock?.lines[row1 - firstBlock.lineStart] ?? ''
    const endLineText   = lastBlock?.lines[row2 - lastBlock.lineStart]   ?? ''
    const charPrefix    = startLineText.slice(0, col1)
    const charSuffix    = endLineText.slice(col2)
    const middleLines   = (charPrefix + content + charSuffix).split('\n')

    const expandPrefix = prevBlock ? prevBlock.lines : []
    const expandSuffix = nextBlock ? nextBlock.lines : []
    const combined     = [...expandPrefix, ...prefixLines, ...middleLines, ...suffixLines, ...expandSuffix]

    if (affected.length === 0 && !expandFirst && content === '') return

    const oldTotalLines = expandFirst && expandLast ? expandLast.lineEnd - expandFirst.lineStart + 1 : 0
    const numReplace    = expandFirst && expandLast ? expandLast.index - expandFirst.index + 1       : affected.length
    const lineDelta     = combined.length - oldTotalLines

    const prevSnap = prevBlock ? { lines: prevBlock.lines.slice(), markdown: prevBlock.markdown } : null
    const nextSnap = nextBlock ? { lines: nextBlock.lines.slice(), markdown: nextBlock.markdown } : null

    // Capture and remove old defs from blocks being replaced
    const oldDefMap = new Map<string, string>()
    for (const b of this._blocks.slice(firstIdx, firstIdx + numReplace)) {
      if (b.type === BlockType.Def) {
        const m = b.lines[0]?.match(/^\s*\[([^\]]+)\]: (\S+)/)
        if (m) oldDefMap.set(m[1].toLowerCase(), m[2])
      }
    }
    for (const id of oldDefMap.keys()) this._defs.delete(id)

    // Remove _refs entries for blocks being replaced; record count of old refs remaining
    this._refs = this._refs.filter(r => r.blockIndex < firstIdx || r.blockIndex >= firstIdx + numReplace)
    const refsCountAfterFilter = this._refs.length

    const typed  = this._subdivide(combined, sectionStart)
    const merged = this._mergeEmptyParas(typed)
    for (let i = 0; i < merged.length; i++) {
      const b = merged[i]
      const parseCtx: ParseContext = { defs: this._defs, refs: this._refs, blockIndex: firstIdx + i }
      b.dirty    = 2
      b.markdown = parseBlock(b, parseCtx)
    }

    if (prevSnap && merged.length > 0 && linesEqual(merged[0].lines, prevSnap.lines)) {
      merged[0].dirty    = 0
      merged[0].markdown = prevSnap.markdown
    }
    if (nextSnap && merged.length > 0) {
      const last = merged[merged.length - 1]
      if (linesEqual(last.lines, nextSnap.lines)) {
        last.dirty    = lineDelta !== 0 ? 1 : 0
        last.markdown = nextSnap.markdown
      }
    }

    // Compute extra dirty blocks from def changes
    const extraDirtySet = new Set<number>()
    for (const [id, oldUrl] of oldDefMap) {
      const newDef = this._defs.get(id)
      if (!newDef || newDef.url !== oldUrl) {
        const newUrl = newDef?.url
        for (const ref of this._refs) {
          if (ref.node.defId === id) { ref.node.url = newUrl; extraDirtySet.add(ref.blockIndex) }
        }
      }
    }
    for (const [id, def] of this._defs) {
      if (!oldDefMap.has(id)) {
        for (const ref of this._refs) {
          if (ref.node.defId === id) { ref.node.url = def.url; extraDirtySet.add(ref.blockIndex) }
        }
      }
    }

    this._blocks.splice(firstIdx, numReplace, ...merged)

    if (lineDelta !== 0) {
      for (let i = firstIdx + merged.length; i < this._blocks.length; i++) {
        this._blocks[i].lineStart += lineDelta
        this._blocks[i].lineEnd   += lineDelta
        this._blocks[i].dirty = 1
      }
    }

    for (let i = firstIdx; i < this._blocks.length; i++) {
      const b = this._blocks[i]
      b.index  = i
      b.lineEnd = b.lineStart + b.lines.length - 1
    }

    // Shift old _refs block indices (new refs from re-parse already carry correct final indices)
    const blockDelta = merged.length - numReplace
    if (blockDelta !== 0) {
      for (let j = 0; j < refsCountAfterFilter; j++) {
        if (this._refs[j].blockIndex >= firstIdx + numReplace) {
          this._refs[j].blockIndex += blockDelta
        }
      }
    }

    // Mark extra dirty blocks from def changes (old indices, shift if needed)
    for (const idx of extraDirtySet) {
      const shifted = idx >= firstIdx + numReplace ? idx + blockDelta : idx
      const b = this._blocks[shifted]
      if (b && (b.dirty ?? 0) === 0) b.dirty = 2
    }

    const allDirty = this._blocks.filter(b => (b.dirty ?? 0) > 0)
    if (allDirty.length === 0) {
      if (merged.length === 0) this._notify([], true)
      return
    }

    let batchIdx = 0
    let offset   = 0
    while (offset < allDirty.length) {
      const size  = batchIdx < this._batchSizes.length
        ? this._batchSizes[batchIdx]
        : this._batchSizes[this._batchSizes.length - 1]
      const batch = allDirty.slice(offset, offset + size)
      offset += size
      const isLast = offset >= allDirty.length
      this._notify(batch, isLast)
      if (batchIdx < this._batchSizes.length - 1) batchIdx++
    }
  }

  // ====== Internal ======

  private _resetState(): void {
    this._blocks = []
    this._buffer = []
    this._currentBlock = null
    this._sectionStart = 0
    this._inFence = false
    this._htmlDepth = 0
    this._globalLineNum = 0
    this._defs = new Map()
    this._refs = []
  }

  private _notify(blocks: TypedBlock[], isEnd: boolean): void {
    for (const cb of this._callbacks) cb(blocks, isEnd)
  }

  private _read(content: string, append: boolean, ctx: FlushCtx): void {
    if (!append) {
      const hadBlocks = this._blocks.length > 0
      this._resetState()
      if (hadBlocks) {
        this._notify([], true)
        ctx.endSent = true
      }
    }
    if (!content) return

    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (/^\s*(`{3,}|~{3,})/.test(line)) {
        this._inFence = !this._inFence
      }

      if (!this._inFence) {
        this._htmlDepth += this._netTagDepth(line)
        if (this._htmlDepth < 0) this._htmlDepth = 0
      }

      if (!this._inFence && this._htmlDepth === 0 && /^\s*#{1,6}\s/.test(line)) {
        if (this._currentBlock) {
          this._subdivideAndEmit(this._currentBlock.lines, this._sectionStart, ctx)
        }
        this._currentBlock = { lines: [line] }
        this._sectionStart = this._globalLineNum + i
      } else {
        if (!this._currentBlock) {
          this._currentBlock = { lines: [] }
        }
        this._currentBlock.lines.push(line)
      }
    }

    this._globalLineNum += lines.length
  }

  private _emit(block: TypedBlock, ctx: FlushCtx): void {
    block.index = this._blocks.length
    block.lineEnd = block.lineStart + block.lines.length - 1
    block.dirty = 0
    const parseCtx: ParseContext = { defs: this._defs, refs: this._refs, blockIndex: block.index }
    block.markdown = parseBlock(block, parseCtx)
    this._blocks.push(block)
    this._buffer.push(block)
    this._tryFlush(ctx)
  }

  private _tryFlush(ctx: FlushCtx): void {
    const size = ctx.batchIdx < this._batchSizes.length
      ? this._batchSizes[ctx.batchIdx]
      : this._batchSizes[this._batchSizes.length - 1]
    if (this._buffer.length >= size) {
      const flushed = this._buffer.splice(0, size)
      this._notify(flushed, false)
      if (ctx.batchIdx < this._batchSizes.length - 1) ctx.batchIdx++
    }
  }

  private _flushRemaining(ctx: FlushCtx): void {
    const flushed = this._buffer.splice(0)
    if (flushed.length > 0 || !ctx.endSent) {
      this._notify(flushed, true)
    }
  }

  private _subdivideAndEmit(rawLines: string[], sectionStart: number, ctx: FlushCtx): void {
    const typed = this._subdivide(rawLines, sectionStart)
    const merged = this._mergeEmptyParas(typed)
    for (const tb of merged) {
      this._emit(tb, ctx)
    }
  }

  private _mergeEmptyParas(blocks: TypedBlock[]): TypedBlock[] {
    const result: TypedBlock[] = []
    for (const block of blocks) {
      if (block.type === BlockType.Paragraph && block.lines.length === 1 && block.lines[0] === '') {
        if (result.length > 0) {
          result[result.length - 1].lines.push('')
        } else {
          result.push(block)
        }
      } else {
        result.push(block)
      }
    }
    return result
  }

  private _isVoid(tagName: string): boolean {
    return /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(tagName)
  }

  _netTagDepth(line: string): number {
    let depth = 0
    const re = /<\/?([a-zA-Z][a-zA-Z0-9-]*)(\s[^>]*)?(\/)?>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(line)) !== null) {
      const full = m[0]
      const tag = m[1]
      const selfClose = m[3]
      if (full.startsWith('</')) {
        depth--
      } else if (selfClose !== '/') {
        if (!this._isVoid(tag)) {
          depth++
        }
      }
    }
    return depth
  }

  private _subdivide(rawLines: string[], sectionStart: number): TypedBlock[] {
    const blocks: TypedBlock[] = []
    let i = 0

    if (rawLines.length > 0 && /^\s*#{1,6}\s/.test(rawLines[0])) {
      const depth = rawLines[0].match(/^\s*(#{1,6})/)![1].length
      blocks.push({ type: BlockType.Heading, depth, lines: [rawLines[0]], index: 0, lineStart: sectionStart, lineEnd: 0, dirty: 2, markdown: [] })
      i = 1
    }

    while (i < rawLines.length) {
      const line = rawLines[i]
      const blockStart = sectionStart + i

      // heading in body (occurs during update when combined spans section boundaries)
      if (/^\s*#{1,6}\s/.test(line)) {
        const depth = line.match(/^\s*(#{1,6})/)![1].length
        blocks.push({ type: BlockType.Heading, depth, lines: [line], index: 0, lineStart: blockStart, lineEnd: 0, dirty: 2, markdown: [] })
        i++
        continue
      }

      // html block
      if (/^\s*<[a-zA-Z][a-zA-Z0-9-]*(\s|>|\/>)/.test(line) && !/^\s*<\//.test(line)) {
        const m = line.match(/^\s*<([a-zA-Z][a-zA-Z0-9-]*)/)!
        const tag = m[1]
        const selfClose = /^\s*<[a-zA-Z][a-zA-Z0-9-]*[^>]*\/>/.test(line)
        if (this._isVoid(tag) || selfClose) {
          blocks.push({ type: BlockType.Html, lines: [line], index: 0, lineStart: blockStart, lineEnd: 0, dirty: 2, markdown: [] })
          i++
          continue
        }
        let depth = 0
        const htmlLines: string[] = []
        while (i < rawLines.length) {
          htmlLines.push(rawLines[i])
          depth += this._netTagDepth(rawLines[i])
          i++
          if (depth === 0) break
        }
        blocks.push({ type: BlockType.Html, lines: htmlLines, index: 0, lineStart: blockStart, lineEnd: 0, dirty: 2, markdown: [] })
        continue
      }

      // code fence
      if (/^\s*(`{3,}|~{3,})/.test(line)) {
        const codeLines: string[] = []
        while (i < rawLines.length) {
          codeLines.push(rawLines[i])
          if (codeLines.length > 1 && /^\s*(`{3,}|~{3,})/.test(rawLines[i])) {
            i++
            break
          }
          i++
        }
        blocks.push({ type: BlockType.Code, lines: codeLines, index: 0, lineStart: blockStart, lineEnd: 0, dirty: 2, markdown: [] })
        continue
      }

      // hr
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        blocks.push({ type: BlockType.Hr, lines: [line], index: 0, lineStart: blockStart, lineEnd: 0, dirty: 2, markdown: [] })
        i++
        continue
      }

      // def [id]: url  (continuation: empty or tab/4+ spaces)
      if (/^\s*\[([^\]]+)\]: \S+/.test(line)) {
        const defLines: string[] = [line]
        i++
        while (i < rawLines.length) {
          const l = rawLines[i]
          if (l === '' || /^\t|^ {4}/.test(l)) { defLines.push(l); i++ }
          else break
        }
        while (defLines.length > 1 && defLines[defLines.length - 1] === '') defLines.pop()
        blocks.push({ type: BlockType.Def, lines: defLines, index: 0, lineStart: blockStart, lineEnd: 0, dirty: 2, markdown: [] })
        continue
      }

      // list - CommonMark: 0-3 leading spaces before marker
      if (/^( {0,3})([-*+]|\d{1,9}[.)]) /.test(line)) {
        const listLines: string[] = []
        let blankBuf: string[] = []
        let blankCount = 0
        while (i < rawLines.length) {
          const l = rawLines[i]
          if (l === '') {
            blankCount++
            if (blankCount >= 2) break
            blankBuf.push(l); i++; continue
          }
          blankCount = 0
          if (/^\s*#{1,6}\s/.test(l) || /^\s*(`{3,}|~{3,})/.test(l) ||
              /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l) || /^\s*>\s?/.test(l)) break
          const leading = l.match(/^( *)/)?.[1].length ?? 0
          if (leading === 0 && !/^( {0,3})([-*+]|\d{1,9}[.)]) /.test(l)) break
          listLines.push(...blankBuf); blankBuf = []
          listLines.push(l); i++
        }
        listLines.push(...blankBuf)
        blocks.push({ type: BlockType.List, lines: listLines, index: 0, lineStart: blockStart, lineEnd: 0, dirty: 2, markdown: [] })
        continue
      }

      // blockquote
      if (/^\s*>\s?/.test(line)) {
        const bqLines: string[] = []
        while (i < rawLines.length && /^\s*>\s?/.test(rawLines[i])) {
          bqLines.push(rawLines[i])
          i++
        }
        blocks.push({ type: BlockType.Blockquote, lines: bqLines, index: 0, lineStart: blockStart, lineEnd: 0, dirty: 2, markdown: [] })
        continue
      }

      // table
      if (/^\s*\|.*\|/.test(line)) {
        const tableLines: string[] = []
        while (i < rawLines.length && /^\s*\|.*\|/.test(rawLines[i])) {
          tableLines.push(rawLines[i])
          i++
        }
        blocks.push({ type: BlockType.Table, lines: tableLines, index: 0, lineStart: blockStart, lineEnd: 0, dirty: 2, markdown: [] })
        continue
      }

      // paragraph
      blocks.push({ type: BlockType.Paragraph, lines: [line], index: 0, lineStart: blockStart, lineEnd: 0, dirty: 2, markdown: [] })
      i++
    }

    return blocks
  }
}
