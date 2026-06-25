/**
 * MarkdownParser — ESM 版本，复制自 ../../index.js
 */
export class Parser {
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
      if (/^\s*(`{3,}|~{3,})/.test(line)) {
        inFence = !inFence;
      }

      if (!inFence) {
        htmlDepth += this._netTagDepth(line);
        if (htmlDepth < 0) htmlDepth = 0;
      }

      if (!inFence && htmlDepth === 0 && /^\s*#{1,6}\s/.test(line)) {
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

  _subdivide(rawLines) {
    const blocks = [];
    let i = 0;

    if (rawLines.length > 0 && /^\s*#{1,6}\s/.test(rawLines[0])) {
      const depth = rawLines[0].match(/^\s*(#{1,6})/)[1].length;
      blocks.push({ type: 'heading', depth, lines: [rawLines[0]] });
      i = 1;
    }

    while (i < rawLines.length) {
      const line = rawLines[i];

      // --- html block（最高优先级）---
      if (/^\s*<[a-zA-Z][a-zA-Z0-9-]*(\s|>|\/>)/.test(line) && !/^\s*<\//.test(line)) {
        const m = line.match(/^\s*<([a-zA-Z][a-zA-Z0-9-]*)/);
        const tag = m[1];
        const selfClose = /^\s*<[a-zA-Z][a-zA-Z0-9-]*[^>]*\/>/.test(line);
        if (this._isVoid(tag) || selfClose) {
          blocks.push({ type: 'html', lines: [line] });
          i++;
          continue;
        }
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

      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        blocks.push({ type: 'hr', lines: [line] });
        i++;
        continue;
      }

      if (/^\s*[\-\*\+]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
        const listLines = [];
        while (i < rawLines.length && (/^\s*[\-\*\+]\s/.test(rawLines[i]) || /^\s*\d+\.\s/.test(rawLines[i]))) {
          listLines.push(rawLines[i]);
          i++;
        }
        blocks.push({ type: 'list', lines: listLines });
        continue;
      }

      if (/^\s*>\s?/.test(line)) {
        const bqLines = [];
        while (i < rawLines.length && /^\s*>\s?/.test(rawLines[i])) {
          bqLines.push(rawLines[i]);
          i++;
        }
        blocks.push({ type: 'blockquote', lines: bqLines });
        continue;
      }

      if (/^\s*\|.*\|/.test(line)) {
        const tableLines = [];
        while (i < rawLines.length && /^\s*\|.*\|/.test(rawLines[i])) {
          tableLines.push(rawLines[i]);
          i++;
        }
        blocks.push({ type: 'table', lines: tableLines });
        continue;
      }

      blocks.push({ type: 'paragraph', lines: [line] });
      i++;
    }

    return blocks;
  }
}
