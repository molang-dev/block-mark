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

    for (const line of lines) {
      if (/^```/.test(line)) {
        inFence = !inFence;
      }

      if (!inFence && /^#{1,6}\s/.test(line)) {
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

    if (rawLines.length > 0 && /^#{1,6}\s/.test(rawLines[0])) {
      const depth = rawLines[0].match(/^(#{1,6})/)[1].length;
      blocks.push({ type: 'heading', depth, lines: [rawLines[0]] });
      i = 1;
    }

    while (i < rawLines.length) {
      const line = rawLines[i];

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

      if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        blocks.push({ type: 'hr', lines: [line] });
        i++;
        continue;
      }

      if (/^[\-\*\+]\s/.test(line) || /^\d+\.\s/.test(line)) {
        const listLines = [];
        while (i < rawLines.length && (/^[\-\*\+]\s/.test(rawLines[i]) || /^\d+\.\s/.test(rawLines[i]))) {
          listLines.push(rawLines[i]);
          i++;
        }
        blocks.push({ type: 'list', lines: listLines });
        continue;
      }

      if (/^>\s?/.test(line)) {
        const bqLines = [];
        while (i < rawLines.length && /^>\s?/.test(rawLines[i])) {
          bqLines.push(rawLines[i]);
          i++;
        }
        blocks.push({ type: 'blockquote', lines: bqLines });
        continue;
      }

      if (/^\|.*\|/.test(line)) {
        const tableLines = [];
        while (i < rawLines.length && /^\|.*\|/.test(rawLines[i])) {
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
