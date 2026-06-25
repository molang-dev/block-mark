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

    for (const line of lines) {
      if (/^#{1,6}\s/.test(line)) {
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
    if (rawLines.length > 0 && /^#{1,6}\s/.test(rawLines[0])) {
      const depth = rawLines[0].match(/^(#{1,6})/)[1].length;
      blocks.push({ type: 'heading', depth, lines: [rawLines[0]] });
      i = 1;
    }

    while (i < rawLines.length) {
      const line = rawLines[i];

      // --- code fence ---
      if (/^```/.test(line)) {
        const codeLines = [];
        while (i < rawLines.length) {
          codeLines.push(rawLines[i]);
          if (codeLines.length > 1 && /^```/.test(rawLines[i])) {
            i++;
            break;
          }
          i++;
        }
        blocks.push({ type: 'code', lines: codeLines });
        continue;
      }

      // --- hr（在 list 之前检测，避免 --- 被识别为 list）---
      if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        blocks.push({ type: 'hr', lines: [line] });
        i++;
        continue;
      }

      // --- list（连续的 - / * / + / 1.）---
      if (/^[\-\*\+]\s/.test(line) || /^\d+\.\s/.test(line)) {
        const listLines = [];
        while (i < rawLines.length && (/^[\-\*\+]\s/.test(rawLines[i]) || /^\d+\.\s/.test(rawLines[i]))) {
          listLines.push(rawLines[i]);
          i++;
        }
        blocks.push({ type: 'list', lines: listLines });
        continue;
      }

      // --- blockquote（连续的 > 行）---
      if (/^>\s?/.test(line)) {
        const bqLines = [];
        while (i < rawLines.length && /^>\s?/.test(rawLines[i])) {
          bqLines.push(rawLines[i]);
          i++;
        }
        blocks.push({ type: 'blockquote', lines: bqLines });
        continue;
      }

      // --- table（连续的 |...| 行）---
      if (/^\|.*\|/.test(line)) {
        const tableLines = [];
        while (i < rawLines.length && /^\|.*\|/.test(rawLines[i])) {
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
