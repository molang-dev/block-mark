import type { TypedBlock, BlockCallback } from './types'

interface RawSection {
  lines: string[]
}

interface FlushCtx {
  batchIdx: number
  endSent: boolean
}

export class Parser {
  private _callbacks: BlockCallback[] = []
  private _blocks: TypedBlock[] = []
  private _buffer: TypedBlock[] = []
  private _batchSizes: number[] = [400, 800, 1600, 3200]

  private _currentBlock: RawSection | null = null
  private _sectionStart = 0
  private _inFence = false
  private _htmlDepth = 0
  private _globalLineNum = 0

  // ====== Public API ======

  setBatchSize(sizes: number[]): void {
    this._batchSizes = sizes
  }

  onUpdate(callback: BlockCallback): void {
    this._callbacks.push(callback)
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

  updateLine(startLine: number, endLine: number, newContent: string): void {
    for (const b of this._blocks) b.dirty = 0

    const affected = this.findBlocks(startLine, endLine)
    if (affected.length === 0) return

    const firstBlock = affected[0]
    const lastBlock  = affected[affected.length - 1]
    const firstIdx   = firstBlock.index

    const prefixLines = firstBlock.lines.slice(0, startLine - firstBlock.lineStart)
    const suffixLines = lastBlock.lines.slice(endLine - lastBlock.lineStart + 1)
    const newLines    = newContent === '' ? [] : newContent.split('\n')
    const combined    = [...prefixLines, ...newLines, ...suffixLines]

    const oldTotalLines = lastBlock.lineEnd - firstBlock.lineStart + 1
    const sectionStart  = firstBlock.lineStart

    const typed  = this._subdivide(combined, sectionStart)
    const merged = this._mergeEmptyParas(typed)
    for (const b of merged) b.dirty = 2

    this._blocks.splice(firstIdx, affected.length, ...merged)

    const lineDelta = combined.length - oldTotalLines
    if (lineDelta !== 0) {
      for (let i = firstIdx + merged.length; i < this._blocks.length; i++) {
        this._blocks[i].lineStart += lineDelta
        this._blocks[i].lineEnd   += lineDelta
        this._blocks[i].dirty = 1
      }
    }

    for (let i = firstIdx; i < this._blocks.length; i++) {
      const b = this._blocks[i]
      b.index   = i
      b.lineEnd = b.lineStart + b.lines.length - 1
    }

    const allDirty = this._blocks.filter(b => (b.dirty ?? 0) > 0)
    if (allDirty.length === 0) {
      if (merged.length === 0) this._notify([], true)
      return
    }

    let batchIdx = 0
    let offset = 0
    while (offset < allDirty.length) {
      const size = batchIdx < this._batchSizes.length
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
      if (block.type === 'paragraph' && block.lines.length === 1 && block.lines[0] === '') {
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
      blocks.push({ type: 'heading', depth, lines: [rawLines[0]], index: 0, lineStart: sectionStart, lineEnd: 0 })
      i = 1
    }

    while (i < rawLines.length) {
      const line = rawLines[i]
      const blockStart = sectionStart + i

      // html block
      if (/^\s*<[a-zA-Z][a-zA-Z0-9-]*(\s|>|\/>)/.test(line) && !/^\s*<\//.test(line)) {
        const m = line.match(/^\s*<([a-zA-Z][a-zA-Z0-9-]*)/)!
        const tag = m[1]
        const selfClose = /^\s*<[a-zA-Z][a-zA-Z0-9-]*[^>]*\/>/.test(line)
        if (this._isVoid(tag) || selfClose) {
          blocks.push({ type: 'html', lines: [line], index: 0, lineStart: blockStart, lineEnd: 0 })
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
        blocks.push({ type: 'html', lines: htmlLines, index: 0, lineStart: blockStart, lineEnd: 0 })
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
        blocks.push({ type: 'code', lines: codeLines, index: 0, lineStart: blockStart, lineEnd: 0 })
        continue
      }

      // hr
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        blocks.push({ type: 'hr', lines: [line], index: 0, lineStart: blockStart, lineEnd: 0 })
        i++
        continue
      }

      // list
      if (/^\s*[\-\*\+]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
        const listLines: string[] = []
        while (i < rawLines.length && (/^\s*[\-\*\+]\s/.test(rawLines[i]) || /^\s*\d+\.\s/.test(rawLines[i]))) {
          listLines.push(rawLines[i])
          i++
        }
        blocks.push({ type: 'list', lines: listLines, index: 0, lineStart: blockStart, lineEnd: 0 })
        continue
      }

      // blockquote
      if (/^\s*>\s?/.test(line)) {
        const bqLines: string[] = []
        while (i < rawLines.length && /^\s*>\s?/.test(rawLines[i])) {
          bqLines.push(rawLines[i])
          i++
        }
        blocks.push({ type: 'blockquote', lines: bqLines, index: 0, lineStart: blockStart, lineEnd: 0 })
        continue
      }

      // table
      if (/^\s*\|.*\|/.test(line)) {
        const tableLines: string[] = []
        while (i < rawLines.length && /^\s*\|.*\|/.test(rawLines[i])) {
          tableLines.push(rawLines[i])
          i++
        }
        blocks.push({ type: 'table', lines: tableLines, index: 0, lineStart: blockStart, lineEnd: 0 })
        continue
      }

      // paragraph
      blocks.push({ type: 'paragraph', lines: [line], index: 0, lineStart: blockStart, lineEnd: 0 })
      i++
    }

    return blocks
  }
}
