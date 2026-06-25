/**
 * MarkdownParser — 两层解析：
 *   Layer 1: 按 heading 行分块
 *   Layer 2: 块内按内容类型细分（paragraph / list / code / table / blockquote / hr）
 *
 * 规则：
 *   1. /^#{1,6}\s/ 行作为 Layer1 分隔符
 *   2. 首个 heading 之前的内容 → 前导 section
 *   3. 每个 section 内按内容类型细分
 *   4. lines 始终保留原始 raw，不删减、不拼接
 *   5. paragraph 不合并，每行独立
 *   6. 空行合并到上一个非空 block 的 lines 尾部
 *
 * 接口：
 *   var p = new Parser()
 *   p.read(mdContent)                        // 返回 void，即时回调 TypedBlock
 *   var err = p.readFile(filename)           // 返回 Error | undefined
 *   p.onBlockUpdate(function(block) { ... }) // 注册 block 回调
 *   p.onDone(function() { ... })             // 注册完成回调
 *   p.allBlocks()                            // 返回本次解析的所有 TypedBlock[]
 */

class Parser {
  constructor() {
    this._callbacks = [];
    this._doneCallbacks = [];
    this._blocks = [];
  }

  onBlockUpdate(callback) {
    this._callbacks.push(callback);
  }

  onDone(callback) {
    this._doneCallbacks.push(callback);
  }

  allBlocks() {
    return this._blocks;
  }

  read(mdContent) {
    if (mdContent === '') {
      return;
    }
    this._blocks = [];
    const lines = mdContent.split('\n');
    let currentBlock = null;
    let inFence = false;
    let htmlDepth = 0;

    for (const line of lines) {
      // toggle fence mode（``` 或 ~~~，前面允许空白）
      if (/^\s*(`{3,}|~{3,})/.test(line)) {
        inFence = !inFence;
      }

      // 跟踪 HTML 标签深度（fence 外）
      if (!inFence) {
        htmlDepth += this._netTagDepth(line);
        if (htmlDepth < 0) htmlDepth = 0;
      }

      if (!inFence && htmlDepth === 0 && /^\s*#{1,6}\s/.test(line)) {
        // heading（不在 fence 内，也不在 html block 内）→ 开启新 section
        if (currentBlock) {
          this._subdivideAndEmit(currentBlock);
        }
        currentBlock = { lines: [line] };
      } else {
        if (!currentBlock) {
          currentBlock = { lines: [] };
        }
        currentBlock.lines.push(line);
      }
    }

    if (currentBlock) {
      this._subdivideAndEmit(currentBlock);
    }

    this._fireDone();
  }

  readFile(filename) {
    const fs = require('fs');
    try {
      const content = fs.readFileSync(filename, 'utf-8');
      this.read(content);
    } catch (err) {
      return err;
    }
  }

  // ---- 内部方法 ----

  _emit(block) {
    this._blocks.push(block);
    for (const cb of this._callbacks) {
      cb(block);
    }
  }

  _fireDone() {
    for (const cb of this._doneCallbacks) {
      cb();
    }
  }

  _mergeEmptyParas(blocks) {
    const result = [];
    for (const block of blocks) {
      if (block.type === 'paragraph' && block.lines.length === 1 && block.lines[0] === '') {
        if (result.length > 0) {
          result[result.length - 1].lines.push('');
        } else {
          result.push(block);
        }
      } else {
        result.push(block);
      }
    }
    return result;
  }

  // ---- HTML 辅助 ----

  _isVoid(tagName) {
    return /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(tagName);
  }

  /**
   * 计算一行内 HTML 标签的净深度变化。
   *   <div>  → +1
   *   </div> → -1
   *   <br> <img> <input/>  → 0
   */
  _netTagDepth(line) {
    let depth = 0;
    const re = /<\/?([a-zA-Z][a-zA-Z0-9-]*)(\s[^>]*)?(\/)?>/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      const full = m[0];
      const tag = m[1];
      const selfClose = m[3];
      if (full.startsWith('</')) {
        depth--;
      } else if (selfClose !== '/') {
        if (!this._isVoid(tag)) {
          depth++;
        }
      }
    }
    return depth;
  }

  _subdivideAndEmit(rawBlock) {
    const typed = this._subdivide(rawBlock.lines);
    const merged = this._mergeEmptyParas(typed);
    for (const tb of merged) {
      this._emit(tb);
    }
  }

  /**
   * 将原始行数组细分为 TypedBlock[]。
   * 首行若是 heading → heading block；其余行按类型分组。
   */
  _subdivide(rawLines) {
    const blocks = [];
    let i = 0;

    // 首行是 heading → 单独作为 heading block
    if (rawLines.length > 0 && /^\s*#{1,6}\s/.test(rawLines[0])) {
      const depth = rawLines[0].match(/^\s*(#{1,6})/)[1].length;
      blocks.push({ type: 'heading', depth, lines: [rawLines[0]] });
      i = 1;
    }

    while (i < rawLines.length) {
      const line = rawLines[i];

      // --- html block（最高优先级，在 code fence 前检测）---
      if (/^\s*<[a-zA-Z][a-zA-Z0-9-]*(\s|>|\/>)/.test(line) && !/^\s*<\//.test(line)) {
        const m = line.match(/^\s*<([a-zA-Z][a-zA-Z0-9-]*)/);
        const tag = m[1];
        const selfClose = /^\s*<[a-zA-Z][a-zA-Z0-9-]*[^>]*\/>/.test(line);
        if (this._isVoid(tag) || selfClose) {
          // void 或自闭合 → 单行 html block
          blocks.push({ type: 'html', lines: [line] });
          i++;
          continue;
        }
        // 多行 html block — 追踪标签深度
        let depth = 0;
        const htmlLines = [];
        while (i < rawLines.length) {
          htmlLines.push(rawLines[i]);
          depth += this._netTagDepth(rawLines[i]);
          i++;
          if (depth === 0) break;
        }
        blocks.push({ type: 'html', lines: htmlLines });
        continue;
      }

      // --- code fence（``` 或 ~~~，前面允许空白）---
      if (/^\s*(`{3,}|~{3,})/.test(line)) {
        const codeLines = [];
        while (i < rawLines.length) {
          codeLines.push(rawLines[i]);
          if (codeLines.length > 1 && /^\s*(`{3,}|~{3,})/.test(rawLines[i])) {
            i++;
            break;
          }
          i++;
        }
        blocks.push({ type: 'code', lines: codeLines });
        continue;
      }

      // --- hr（在 list 之前检测，避免 --- 被识别为 list）---
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        blocks.push({ type: 'hr', lines: [line] });
        i++;
        continue;
      }

      // --- list（连续的 - / * / + / 1.）---
      if (/^\s*[\-\*\+]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
        const listLines = [];
        while (i < rawLines.length && (/^\s*[\-\*\+]\s/.test(rawLines[i]) || /^\s*\d+\.\s/.test(rawLines[i]))) {
          listLines.push(rawLines[i]);
          i++;
        }
        blocks.push({ type: 'list', lines: listLines });
        continue;
      }

      // --- blockquote（连续的 > 行）---
      if (/^\s*>\s?/.test(line)) {
        const bqLines = [];
        while (i < rawLines.length && /^\s*>\s?/.test(rawLines[i])) {
          bqLines.push(rawLines[i]);
          i++;
        }
        blocks.push({ type: 'blockquote', lines: bqLines });
        continue;
      }

      // --- table（连续的 |...| 行）---
      if (/^\s*\|.*\|/.test(line)) {
        const tableLines = [];
        while (i < rawLines.length && /^\s*\|.*\|/.test(rawLines[i])) {
          tableLines.push(rawLines[i]);
          i++;
        }
        blocks.push({ type: 'table', lines: tableLines });
        continue;
      }

      // --- paragraph（每行独立，含空行）---
      blocks.push({ type: 'paragraph', lines: [line] });
      i++;
    }

    return blocks;
  }
}

module.exports = { Parser };
