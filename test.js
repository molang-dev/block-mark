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
// 测试：基本 heading 分块
// ============================================================
{
  const p = new Parser();
  // split('\n') 末尾产生 '' → 最后 block 会多一个空行
  const blocks = collect(p, '# Title\ncontent line 1\ncontent line 2\n\n## Sub heading\n```js\nvar a = 0;\n```\n\n### Another\nlast line\n');
  assert.strictEqual(blocks.length, 3);
  assert.deepStrictEqual(blocks[0].lines, ['# Title', 'content line 1', 'content line 2', '']);
  assert.deepStrictEqual(blocks[1].lines, ['## Sub heading', '```js', 'var a = 0;', '```', '']);
  assert.deepStrictEqual(blocks[2].lines, ['### Another', 'last line', '']);
}

// ============================================================
// 测试：前导 block（第一个 heading 之前有内容）
// ============================================================
{
  const p = new Parser();
  const blocks = collect(p, 'preamble line 1\n\npreamble line 2\n# Heading\ncontent\n');
  assert.strictEqual(blocks.length, 2);
  assert.deepStrictEqual(blocks[0].lines, ['preamble line 1', '', 'preamble line 2']);
  assert.deepStrictEqual(blocks[1].lines, ['# Heading', 'content', '']);
}

// ============================================================
// 测试：只有前导内容，无 heading
// ============================================================
{
  const p = new Parser();
  // 末尾无 \n → 无尾随空行
  const blocks = collect(p, 'just some text\nno heading here');
  assert.strictEqual(blocks.length, 1);
  assert.deepStrictEqual(blocks[0].lines, ['just some text', 'no heading here']);
}

// ============================================================
// 测试：只有 heading，无其他内容
// ============================================================
{
  const p = new Parser();
  // 末尾 \n 产生尾随空行，归入最后 block
  const blocks = collect(p, '# One\n## Two\n### Three\n');
  assert.strictEqual(blocks.length, 3);
  assert.deepStrictEqual(blocks[0].lines, ['# One']);
  assert.deepStrictEqual(blocks[1].lines, ['## Two']);
  assert.deepStrictEqual(blocks[2].lines, ['### Three', '']);
}

// ============================================================
// 测试：空输入
// ============================================================
{
  const p = new Parser();
  const blocks = collect(p, '');
  assert.strictEqual(blocks.length, 0);
}

// ============================================================
// 测试：即时回调（每遇到 block 立即触发）
// ============================================================
{
  const p = new Parser();
  const received = [];
  p.onBlockUpdate(function(block) {
    received.push(block.lines[0]);
  });
  // 末尾无 \n
  p.read('# A\nbody\n# B\nbody2');
  assert.strictEqual(received.length, 2);
  assert.strictEqual(received[0], '# A');
  assert.strictEqual(received[1], '# B');
}

// ============================================================
// 测试：多个回调
// ============================================================
{
  const p = new Parser();
  let count1 = 0, count2 = 0;
  p.onBlockUpdate(function() { count1++; });
  p.onBlockUpdate(function() { count2++; });
  p.read('# A\nbody\n# B\n');
  assert.strictEqual(count1, 2);
  assert.strictEqual(count2, 2);
}

// ============================================================
// 测试：readFile — 文件不存在返回 Error
// ============================================================
{
  const p = new Parser();
  const err = p.readFile('/nonexistent/mdparser_test_file.md');
  assert.ok(err instanceof Error);
}

// ============================================================
// 测试：readFile — 正常文件解析
// ============================================================
{
  const tmpFile = '/tmp/mdparser_test_sample.md';
  fs.writeFileSync(tmpFile, '# Hello\nworld');

  const p = new Parser();
  const received = [];
  p.onBlockUpdate(function(block) {
    received.push(block);
  });

  const ret = p.readFile(tmpFile);
  assert.strictEqual(ret, undefined);

  assert.strictEqual(received.length, 1);
  assert.deepStrictEqual(received[0].lines, ['# Hello', 'world']);

  fs.unlinkSync(tmpFile);
}

// ============================================================
// 测试：read 返回 void
// ============================================================
{
  const p = new Parser();
  // 末尾无 \n
  const ret = p.read('# X');
  assert.strictEqual(ret, undefined);
}

// ============================================================
// 测试：H1~H6 全部识别
// ============================================================
{
  const p = new Parser();
  // 末尾无 \n
  const blocks = collect(p, '# H1\n# H2\n## H3\n### H4\n#### H5\n##### H6\n###### H7');
  assert.strictEqual(blocks.length, 7);
}

// ============================================================
// 测试：不是 heading 的 # 符号（如 # 不在行首）
// ============================================================
{
  const p = new Parser();
  // 末尾无 \n
  const blocks = collect(p, 'not a # heading\n## real heading');
  assert.strictEqual(blocks.length, 2);
  assert.deepStrictEqual(blocks[0].lines, ['not a # heading']);
  assert.deepStrictEqual(blocks[1].lines, ['## real heading']);
}

console.log('All tests passed.');
