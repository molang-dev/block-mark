const { Parser } = require('./index.js');
const assert = require('assert');
const fs = require('fs');

function collect(p, mdContent) {
  const blocks = [];
  p.onBlockUpdate(function(block) {
    blocks.push(block);
  });
  p.read(mdContent);
  return blocks;
}

// ============================================================
// 基本 heading 分块 + 空行合并到上一个非空 block
// ============================================================
{
  const blocks = collect(new Parser(),
    '# Title\ncontent line 1\n\n## Sub\n- item1\n- item2\n\n```js\nvar a = 0;\n```\n');
  // heading: ['# Title']
  assert.strictEqual(blocks[0].type, 'heading');
  assert.strictEqual(blocks[0].depth, 1);
  assert.deepStrictEqual(blocks[0].lines, ['# Title']);

  // para + 后面空行合并
  assert.strictEqual(blocks[1].type, 'paragraph');
  assert.deepStrictEqual(blocks[1].lines, ['content line 1', '']);

  // ## Sub heading
  assert.strictEqual(blocks[2].type, 'heading');
  assert.strictEqual(blocks[2].depth, 2);
  assert.deepStrictEqual(blocks[2].lines, ['## Sub']);

  // list + 后面空行合并
  assert.strictEqual(blocks[3].type, 'list');
  assert.deepStrictEqual(blocks[3].lines, ['- item1', '- item2', '']);

  // code + 末尾空行合并
  assert.strictEqual(blocks[4].type, 'code');
  assert.deepStrictEqual(blocks[4].lines, ['```js', 'var a = 0;', '```', '']);
}

// ============================================================
// 前导 block — 空行合并到前导 paragraph
// ============================================================
{
  const blocks = collect(new Parser(), 'preamble\n\n# Heading\nbody\n');
  assert.strictEqual(blocks[0].type, 'paragraph');
  assert.deepStrictEqual(blocks[0].lines, ['preamble', '']);
  assert.strictEqual(blocks[1].type, 'heading');
  assert.deepStrictEqual(blocks[1].lines, ['# Heading']);
  assert.strictEqual(blocks[2].type, 'paragraph');
  assert.deepStrictEqual(blocks[2].lines, ['body', '']);
}

// ============================================================
// list — 末尾空行合并
// ============================================================
{
  const blocks = collect(new Parser(), '# L\n- a\n- b\n1. c\n2. d\n');
  const list = blocks.find(b => b.type === 'list');
  assert.deepStrictEqual(list.lines, ['- a', '- b', '1. c', '2. d', '']);
}

// ============================================================
// hr — 末尾空行合并到最后一个 hr
// ============================================================
{
  const blocks = collect(new Parser(), '# HR\n---\n***\n___\n');
  const hrs = blocks.filter(b => b.type === 'hr');
  assert.strictEqual(hrs.length, 3);
  assert.deepStrictEqual(hrs[0].lines, ['---']);
  assert.deepStrictEqual(hrs[1].lines, ['***']);
  assert.deepStrictEqual(hrs[2].lines, ['___', '']);   // trailing '' merged
}

// ============================================================
// hr 不与 list 混淆
// ============================================================
{
  const blocks = collect(new Parser(), '- item\n---\n');
  assert.strictEqual(blocks[0].type, 'list');
  assert.deepStrictEqual(blocks[0].lines, ['- item']);
  assert.strictEqual(blocks[1].type, 'hr');
  assert.deepStrictEqual(blocks[1].lines, ['---', '']);  // trailing '' merged
}

// ============================================================
// blockquote — 空行合并
// ============================================================
{
  const blocks = collect(new Parser(), '# Q\n> line one\n> line two\n\nnot quote\n');
  const bq = blocks.find(b => b.type === 'blockquote');
  assert.deepStrictEqual(bq.lines, ['> line one', '> line two', '']);
}

// ============================================================
// table — 空行合并
// ============================================================
{
  const blocks = collect(new Parser(), '# T\n| a | b |\n| c | d |\n\npara\n');
  const table = blocks.find(b => b.type === 'table');
  assert.deepStrictEqual(table.lines, ['| a | b |', '| c | d |', '']);
}

// ============================================================
// code fence — 末尾空行合并
// ============================================================
{
  const blocks = collect(new Parser(), '# C\n```python\nprint(1)\nprint(2)\n```\n');
  const code = blocks.find(b => b.type === 'code');
  assert.deepStrictEqual(code.lines, ['```python', 'print(1)', 'print(2)', '```', '']);
}

// ============================================================
// 空输入
// ============================================================
{
  const blocks = collect(new Parser(), '');
  assert.strictEqual(blocks.length, 0);
}

// ============================================================
// 即时回调
// ============================================================
{
  const p = new Parser();
  const received = [];
  p.onBlockUpdate(function(block) { received.push(block.type); });
  p.read('# A\nbody');
  assert.strictEqual(received.length, 2);
  assert.strictEqual(received[0], 'heading');
  assert.strictEqual(received[1], 'paragraph');
}

// ============================================================
// readFile — 文件不存在
// ============================================================
{
  const err = new Parser().readFile('/nonexistent/test.md');
  assert.ok(err instanceof Error);
}

// ============================================================
// read 返回 void
// ============================================================
{
  const ret = new Parser().read('# X');
  assert.strictEqual(ret, undefined);
}

// ============================================================
// lines 完整性 — 纯空格行保留不合并
// ============================================================
{
  const blocks = collect(new Parser(), 'a\n  \nb\n');
  assert.strictEqual(blocks[0].type, 'paragraph');
  assert.deepStrictEqual(blocks[0].lines, ['a']);
  assert.strictEqual(blocks[1].type, 'paragraph');
  assert.deepStrictEqual(blocks[1].lines, ['  ']);  // 纯空格保留
  assert.strictEqual(blocks[2].type, 'paragraph');
  assert.deepStrictEqual(blocks[2].lines, ['b', '']);  // 末尾空行合并
}

// ============================================================
// heading 后的空行合并到 heading
// ============================================================
{
  const blocks = collect(new Parser(), '# A\n\nbody\n');
  assert.strictEqual(blocks[0].type, 'heading');
  assert.deepStrictEqual(blocks[0].lines, ['# A', '']);  // heading 吸收后面空行
  assert.strictEqual(blocks[1].type, 'paragraph');
  assert.deepStrictEqual(blocks[1].lines, ['body', '']);
}

console.log('All tests passed.');
