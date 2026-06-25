/**
 * MarkdownParser — 按 heading 行将 markdown 即时拆分为 block。
 *
 * 规则：
 *   1. /^#{1,6}\s/ 行作为分隔符，开启新 block
 *   2. 首个 heading 之前的内容 → 前导 block（无 heading）
 *   3. 空行保留为空字符串
 *   4. 相邻 heading → 各自独立成 block
 *
 * 接口：
 *   var p = new Parser()
 *   p.read(mdContent)                        // 返回 void，即时回调
 *   var err = p.readFile(filename)           // 返回 Error | undefined
 *   p.onBlockUpdate(function(block) { ... }) // 注册回调
 */

class Parser {
  constructor() {
    this._callbacks = [];
  }

  /**
   * 注册回调。每次 read/readFile 解析到一个完整 block 时触发。
   */
  onBlockUpdate(callback) {
    this._callbacks.push(callback);
  }

  /**
   * 解析 markdown 字符串。每遇到一个完整 block 即时回调，返回 void。
   */
  read(mdContent) {
    if (mdContent === '') {
      return;
    }
    const lines = mdContent.split('\n');
    let currentBlock = null;

    for (const line of lines) {
      if (/^#{1,6}\s/.test(line)) {
        // 遇到 heading → 先回调前一个 block（如果存在）
        if (currentBlock) {
          this._emit(currentBlock);
        }
        currentBlock = { lines: [line] };
      } else {
        // 非 heading
        if (!currentBlock) {
          currentBlock = { lines: [] };
        }
        currentBlock.lines.push(line);
      }
    }

    // 最后一个 block
    if (currentBlock) {
      this._emit(currentBlock);
    }
  }

  /**
   * 读文件并解析。文件不存在时返回 Error，否则返回 undefined。
   */
  readFile(filename) {
    const fs = require('fs');
    try {
      const content = fs.readFileSync(filename, 'utf-8');
      this.read(content);
    } catch (err) {
      return err;
    }
  }

  _emit(block) {
    for (const cb of this._callbacks) {
      cb(block);
    }
  }
}

module.exports = { Parser };
