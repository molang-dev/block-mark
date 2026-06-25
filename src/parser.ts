import type { TypedBlock, BlockCallback, DoneCallback } from './types'

/** 内部临时结构 —— Layer1 收集的原始 section */
interface RawSection {
  lines: string[]
}

export class Parser {
  private _callbacks: BlockCallback[] = []
  private _doneCallbacks: DoneCallback[] = []
  private _blocks: TypedBlock[] = []

  // ====== 公开 API ======

  onBlockUpdate(callback: BlockCallback): void {
    this._callbacks.push(callback)
  }

  onDone(callback: DoneCallback): void {
    this._doneCallbacks.push(callback)
  }

  allBlocks(): TypedBlock[] {
    return this._blocks
  }

  read(mdContent: string): void {
    if (mdContent === '') return
    this._blocks = []
    const lines = mdContent.split('\n')
    let currentBlock: RawSection | null = null
    let sectionStart = 0
    let inFence = false
    let htmlDepth = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // toggle fence mode（``` 或 ~~~，前面允许空白）
      if (/^\s*(`{3,}|~{3,})/.test(line)) {
        inFence = !inFence
      }

      // 跟踪 HTML 标签深度（fence 外）
      if (!inFence) {
        htmlDepth += this._netTagDepth(line)
        if (htmlDepth < 0) htmlDepth = 0
      }

      if (!inFence && htmlDepth === 0 && /^\s*#{1,6}\s/.test(line)) {
        if (currentBlock) {
          this._subdivideAndEmit(currentBlock.lines, sectionStart)
        }
        currentBlock = { lines: [line] }
        sectionStart = i
      } else {
        if (!currentBlock) {
          currentBlock = { lines: [] }
        }
        currentBlock.lines.push(line)
      }
    }

    if (currentBlock) {
      this._subdivideAndEmit(currentBlock.lines, sectionStart)
    }

    this._fireDone()
  }

  readFile(filename: string): Error | undefined {
    try {
      // 运行时 require，避免浏览器构建时静态分析 node:fs
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs: typeof import('fs') = require('fs')
      const content = fs.readFileSync(filename, 'utf-8')
      this.read(content)
    } catch (err) {
      return err as Error
    }
  }

  /** 根据原始文档行号查找所属 block */
  getBlockByRawLineNumber(lineNum: number): TypedBlock | null {
    for (const b of this._blocks) {
      if (lineNum >= b.lineStart && lineNum <= b.lineEnd) {
        return b
      }
    }
    return null
  }

  // ====== 内部方法 ======

  private _emit(block: TypedBlock): void {
    block.index = this._blocks.length
    block.lineEnd = block.lineStart + block.lines.length - 1
    this._blocks.push(block)
    for (const cb of this._callbacks) {
      cb(block)
    }
  }

  private _fireDone(): void {
    for (const cb of this._doneCallbacks) {
      cb()
    }
  }

  private _subdivideAndEmit(rawLines: string[], sectionStart: number): void {
    const typed = this._subdivide(rawLines, sectionStart)
    const merged = this._mergeEmptyParas(typed)
    for (const tb of merged) {
      this._emit(tb)
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

  // ---- HTML ----

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

  // ---- Layer 2 细分 ----

  private _subdivide(rawLines: string[], sectionStart: number): TypedBlock[] {
    const blocks: TypedBlock[] = []
    let i = 0

    // 首行是 heading
    if (rawLines.length > 0 && /^\s*#{1,6}\s/.test(rawLines[0])) {
      const depth = rawLines[0].match(/^\s*(#{1,6})/)![1].length
      blocks.push({ type: 'heading', depth, lines: [rawLines[0]], index: 0, lineStart: sectionStart + 0, lineEnd: 0 })
      i = 1
    }

    while (i < rawLines.length) {
      const line = rawLines[i]
      const blockStart = sectionStart + i

      // --- html block ---
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

      // --- code fence ---
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

      // --- hr ---
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        blocks.push({ type: 'hr', lines: [line], index: 0, lineStart: blockStart, lineEnd: 0 })
        i++
        continue
      }

      // --- list ---
      if (/^\s*[\-\*\+]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
        const listLines: string[] = []
        while (i < rawLines.length && (/^\s*[\-\*\+]\s/.test(rawLines[i]) || /^\s*\d+\.\s/.test(rawLines[i]))) {
          listLines.push(rawLines[i])
          i++
        }
        blocks.push({ type: 'list', lines: listLines, index: 0, lineStart: blockStart, lineEnd: 0 })
        continue
      }

      // --- blockquote ---
      if (/^\s*>\s?/.test(line)) {
        const bqLines: string[] = []
        while (i < rawLines.length && /^\s*>\s?/.test(rawLines[i])) {
          bqLines.push(rawLines[i])
          i++
        }
        blocks.push({ type: 'blockquote', lines: bqLines, index: 0, lineStart: blockStart, lineEnd: 0 })
        continue
      }

      // --- table ---
      if (/^\s*\|.*\|/.test(line)) {
        const tableLines: string[] = []
        while (i < rawLines.length && /^\s*\|.*\|/.test(rawLines[i])) {
          tableLines.push(rawLines[i])
          i++
        }
        blocks.push({ type: 'table', lines: tableLines, index: 0, lineStart: blockStart, lineEnd: 0 })
        continue
      }

      // --- paragraph ---
      blocks.push({ type: 'paragraph', lines: [line], index: 0, lineStart: blockStart, lineEnd: 0 })
      i++
    }

    return blocks
  }
}
