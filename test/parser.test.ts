import { describe, it, expect } from 'vitest'
import { writeFileSync, unlinkSync } from 'node:fs'
import { Parser } from '../src/parser'
import type { TypedBlock } from '../src/types'
import { BlockType } from '../src/types'

function collect(mdContent: string): TypedBlock[] {
  const p = new Parser()
  const blocks: TypedBlock[] = []
  p.onUpdate((list) => { for (const b of list) blocks.push(b) })
  p.read(mdContent)
  return blocks
}

describe('Parser', () => {
  // ============================================================
  it('基本 heading 分块 + 空行合并', () => {
    const blocks = collect('# Title\ncontent line 1\n\n## Sub\n- item1\n- item2\n\n```js\nvar a = 0;\n```\n')
    expect(blocks.length).toBeGreaterThanOrEqual(5)

    expect(blocks[0].type).toBe(BlockType.Heading)
    expect(blocks[0].depth).toBe(1)
    expect(blocks[0].lines).toEqual(['# Title'])

    expect(blocks[1].type).toBe(BlockType.Paragraph)
    expect(blocks[1].lines).toEqual(['content line 1', ''])

    const subHead = blocks.find(b => b.type === BlockType.Heading && b.depth === 2)
    expect(subHead).toBeTruthy()
    expect(subHead!.lines).toEqual(['## Sub'])

    const list = blocks.find(b => b.type === BlockType.List)
    expect(list).toBeTruthy()
    expect(list!.lines).toEqual(['- item1', '- item2', ''])

    const code = blocks.find(b => b.type === BlockType.Code)
    expect(code).toBeTruthy()
    expect(code!.lines).toEqual(['```js', 'var a = 0;', '```', ''])
  })

  // ============================================================
  it('前导 block（无 heading）', () => {
    const blocks = collect('preamble\n\n# Heading\nbody\n')
    expect(blocks[0].type).toBe(BlockType.Paragraph)
    expect(blocks[0].lines).toEqual(['preamble', ''])
    expect(blocks[1].type).toBe(BlockType.Heading)
    expect(blocks[1].lines).toEqual(['# Heading'])
  })

  // ============================================================
  it('有序+无序 list 合并', () => {
    const blocks = collect('# L\n- a\n- b\n1. c\n2. d\n')
    const list = blocks.find(b => b.type === BlockType.List)
    expect(list).toBeTruthy()
    expect(list!.lines).toEqual(['- a', '- b', '1. c', '2. d', ''])
  })

  // ============================================================
  it('hr 三种形式', () => {
    const blocks = collect('# HR\n---\n***\n___\n')
    const hrs = blocks.filter(b => b.type === BlockType.Hr)
    expect(hrs.length).toBe(3)
    expect(hrs[0].lines).toEqual(['---'])
    expect(hrs[1].lines).toEqual(['***'])
    expect(hrs[2].lines).toEqual(['___', ''])
  })

  // ============================================================
  it('hr 不与 list 混淆：- item 是 list，--- 是 hr', () => {
    const blocks = collect('- item\n---\n')
    expect(blocks[0].type).toBe(BlockType.List)
    expect(blocks[0].lines).toEqual(['- item'])
    expect(blocks[1].type).toBe(BlockType.Hr)
    expect(blocks[1].lines).toEqual(['---', ''])
  })

  // ============================================================
  it('blockquote — 连续的 > 行合并，保留 >', () => {
    const blocks = collect('# Q\n> line one\n> line two\n\nnot quote\n')
    const bq = blocks.find(b => b.type === BlockType.Blockquote)
    expect(bq).toBeTruthy()
    expect(bq!.lines).toEqual(['> line one', '> line two', ''])
  })

  // ============================================================
  it('table — 连续的 |...| 行合并', () => {
    const blocks = collect('# T\n| a | b |\n| c | d |\n\npara\n')
    const table = blocks.find(b => b.type === BlockType.Table)
    expect(table).toBeTruthy()
    expect(table!.lines).toEqual(['| a | b |', '| c | d |', ''])
  })

  // ============================================================
  it('code fence — 原样保留', () => {
    const blocks = collect('# C\n```python\nprint(1)\nprint(2)\n```\n')
    const code = blocks.find(b => b.type === BlockType.Code)
    expect(code).toBeTruthy()
    expect(code!.lines).toEqual(['```python', 'print(1)', 'print(2)', '```', ''])
  })

  // ============================================================
  it('空输入 → 0 block', () => {
    const blocks = collect('')
    expect(blocks.length).toBe(0)
  })

  // ============================================================
  it('即时回调', () => {
    const p = new Parser()
    const received: BlockType[] = []
    p.onUpdate(list => list.forEach(b => received.push(b.type)))
    p.read('# A\nbody')
    expect(received).toEqual([BlockType.Heading, BlockType.Paragraph])
  })

  // ============================================================
  it('readFile 文件不存在返回 Error', () => {
    const err = new Parser().readFile('/nonexistent/test.md')
    expect(err).toBeInstanceOf(Error)
  })

  // ============================================================
  it('read 返回 void', () => {
    const ret = new Parser().read('# X')
    expect(ret).toBeUndefined()
  })

  // ============================================================
  it('lines 完整性 — 纯空格行保留', () => {
    const blocks = collect('a\n  \nb\n')
    expect(blocks[0].lines).toEqual(['a'])
    expect(blocks[1].lines).toEqual(['  '])
    expect(blocks[2].lines).toEqual(['b', ''])
  })

  // ============================================================
  it('heading 后的空行合并到 heading', () => {
    const blocks = collect('# A\n\nbody\n')
    expect(blocks[0].lines).toEqual(['# A', ''])
    expect(blocks[1].lines).toEqual(['body', ''])
  })

  // ============================================================
  it('code fence 内部 # 不被切分', () => {
    const blocks = collect('```python\n# 注释\nprint(1)\n```\n')
    expect(blocks.length).toBe(1)
    expect(blocks[0].type).toBe(BlockType.Code)
    expect(blocks[0].lines).toEqual(['```python', '# 注释', 'print(1)', '```', ''])
  })

  // ============================================================
  it('fence 外的 heading 正常切分', () => {
    const blocks = collect('```\ncode\n```\n# real heading\nbody\n')
    const headings = blocks.filter(b => b.type === BlockType.Heading)
    expect(headings.length).toBe(1)
  })

  // ============================================================
  it('前导空白：heading / fence / hr / list / blockquote / table', () => {
    const blocks = collect('  ## 带空白的标题\n    - 带空白的列表\n  > 带空白的引用\n   | a | b |\n  ---\n')
    expect(blocks[0].type).toBe(BlockType.Heading)
    expect(blocks[0].depth).toBe(2)

    const list = blocks.find(b => b.type === BlockType.List)
    expect(list).toBeTruthy()
    expect(list!.lines).toEqual(['    - 带空白的列表'])

    const bq = blocks.find(b => b.type === BlockType.Blockquote)
    expect(bq).toBeTruthy()

    const table = blocks.find(b => b.type === BlockType.Table)
    expect(table).toBeTruthy()

    const hr = blocks.find(b => b.type === BlockType.Hr)
    expect(hr!.lines).toEqual(['  ---', ''])
  })

  // ============================================================
  it('~~~ 作为 code fence', () => {
    const blocks = collect('~~~bash\necho ok\n~~~\n')
    expect(blocks.length).toBe(1)
    expect(blocks[0].type).toBe(BlockType.Code)
    expect(blocks[0].lines).toEqual(['~~~bash', 'echo ok', '~~~', ''])
  })

  // ============================================================
  it('~~~ 内部 # 不切分，外部 heading 正常', () => {
    const blocks = collect('~~~\n# 注释\ncode\n~~~\n# real heading\nbody\n')
    expect(blocks[0].type).toBe(BlockType.Code)
    expect(blocks[0].lines).toEqual(['~~~', '# 注释', 'code', '~~~'])
    expect(blocks[1].type).toBe(BlockType.Heading)
  })

  // ============================================================
  it('HTML 多行 block，内部 # 不切分', () => {
    const blocks = collect('<div class="wrap">\n  # 不是 heading\n  <p>text</p>\n</div>\n# real heading\nbody\n')
    expect(blocks[0].type).toBe(BlockType.Html)
    expect(blocks[0].lines).toEqual(['<div class="wrap">', '  # 不是 heading', '  <p>text</p>', '</div>'])
    expect(blocks[1].type).toBe(BlockType.Heading)
  })

  // ============================================================
  it('HTML 嵌套标签深度跟踪', () => {
    const blocks = collect('<div>\n  <ul>\n    <li>a</li>\n  </ul>\n</div>\n')
    expect(blocks.length).toBe(1)
    expect(blocks[0].type).toBe(BlockType.Html)
    expect(blocks[0].lines).toEqual(['<div>', '  <ul>', '    <li>a</li>', '  </ul>', '</div>', ''])
  })

  // ============================================================
  it('HTML void/自闭合 → 单行 block', () => {
    const blocks = collect('<hr>\n<br/>\n<img src="x.png">\n')
    expect(blocks.filter(b => b.type === BlockType.Html).length).toBe(3)
  })

  // ============================================================
  it('HTML 前导空白', () => {
    const blocks = collect('  <div>\n    content\n  </div>\n')
    expect(blocks[0].type).toBe(BlockType.Html)
    expect(blocks[0].lines).toEqual(['  <div>', '    content', '  </div>', ''])
  })

  // ============================================================
  it('allBlocks + isEnd', () => {
    const p = new Parser()
    let endReceived = false
    p.onUpdate((_blocks, isEnd) => { if (isEnd) endReceived = true })
    p.read('# Hello\n')
    expect(endReceived).toBe(true)
    expect(p.allBlocks().length).toBeGreaterThan(0)
  })

  // ============================================================
  it('readFile 正常文件', () => {
    const tmp = '/tmp/mdparser_ts_test.md'
    writeFileSync(tmp, '# Hi\nworld\n')
    const p = new Parser()
    const blocks: TypedBlock[] = []
    p.onUpdate(list => { for (const b of list) blocks.push(b) })
    const ret = p.readFile(tmp)
    expect(ret).toBeNull()
    expect(blocks.length).toBeGreaterThan(0)
    unlinkSync(tmp)
  })

  // ============================================================
  it('getBlockByLineNumber — 命中', () => {
    const p = new Parser()
    p.read('# A\n\nbody\n')
    const b = p.findBlocks(2, 2)[0] ?? null
    expect(b).toBeTruthy()
    expect(b!.type).toBe(BlockType.Paragraph)
    expect(b!.lines).toEqual(['body', ''])
  })

  // ============================================================
  it('getBlockByLineNumber — 未命中返回 null', () => {
    const p = new Parser()
    p.read('# A\n')
    expect(p.findBlocks(99, 99)[0] ?? null).toBeNull()
  })

  // ============================================================
  it('updateLine — 单行纯文本原地替换', () => {
    const p = new Parser()
    p.read('# Title\nold text\n')
    p.updateLine(1, 1, 'new text')
    const b = p.findBlocks(1, 1)[0] ?? null
    expect(b).toBeTruthy()
    expect(b!.type).toBe(BlockType.Paragraph)
    expect(b!.lines).toEqual(['new text', ''])
  })

  // ============================================================
  it('updateLine — 多行文本展开', () => {
    const p = new Parser()
    p.read('# Title\nsingle\n')
    p.updateLine(1, 1, 'line a\nline b')
    const all = p.allBlocks()
    expect(all.length).toBe(3) // heading + 2 paragraphs
    expect(all[1].lines).toEqual(['line a'])
    expect(all[2].lines).toEqual(['line b', ''])
  })

  // ============================================================
  it('updateLine — 插入 heading 导致 block 拆分', () => {
    const p = new Parser()
    p.read('# Title\nline one\n')
    p.updateLine(1, 1, '## Sub\nsub body')
    const all = p.allBlocks()
    expect(all.length).toBe(3)
    expect(all[1].type).toBe(BlockType.Heading)
    expect(all[1].depth).toBe(2)
    expect(all[1].lines).toEqual(['## Sub'])
    expect(all[2].type).toBe(BlockType.Paragraph)
    expect(all[2].lines).toEqual(['sub body', ''])
    expect(all[0].lineStart).toBe(0)
    expect(all[1].lineStart).toBe(1)
    expect(all[2].lineStart).toBe(2)
  })

  // ============================================================
  it('updateLine — 闭合 code fence 拆分 block', () => {
    const p = new Parser()
    p.read('```js\ncode\nmore\n```\n')
    p.updateLine(1, 1, '```')
    const all = p.allBlocks()
    expect(all.length).toBe(3)
    expect(all[0].type).toBe(BlockType.Code)
    expect(all[0].lines).toEqual(['```js', '```'])
    expect(all[1].type).toBe(BlockType.Paragraph)
    expect(all[1].lines).toEqual(['more'])
    expect(all[2].type).toBe(BlockType.Code)
    expect(all[2].lines).toEqual(['```', ''])
  })

  // ============================================================
  it('updateLine — 后续 block 行号偏移修正', () => {
    const p = new Parser()
    p.read('a\n\nb\n')
    p.updateLine(1, 1, 'x\ny\nz')
    const all = p.allBlocks()
    expect(all[1].lines).toEqual(['x'])
    expect(all[2].lines).toEqual(['y'])
    expect(all[3].lines).toEqual(['z'])
    const bBlock = all.find(b => b.lines[0] === 'b')
    expect(bBlock!.lineStart).toBe(4)
  })

  // ============================================================
  it('updateLine — heading 替换为普通文本', () => {
    const p = new Parser()
    p.read('# Title\nbody\n')
    p.updateLine(0, 0, 'just text')
    const b = p.findBlocks(0, 0)[0] ?? null
    expect(b!.type).toBe(BlockType.Paragraph)
    expect(b!.lines).toEqual(['just text'])
  })

  // ============================================================
  it('updateLine — heading 替换为新 heading', () => {
    const p = new Parser()
    p.read('# Title\nbody\n')
    p.updateLine(0, 0, '## New Title')
    const b = p.findBlocks(0, 0)[0] ?? null
    expect(b!.type).toBe(BlockType.Heading)
    expect(b!.depth).toBe(2)
    expect(b!.lines).toEqual(['## New Title'])
  })

  // ============================================================
  it('updateLine — list item 替换为普通文本', () => {
    const p = new Parser()
    p.read('- item 1\n- item 2\n')
    p.updateLine(0, 0, 'plain text')
    const all = p.allBlocks()
    expect(all[0].type).toBe(BlockType.Paragraph)
    expect(all[0].lines).toEqual(['plain text'])
    const list = all.find(b => b.type === BlockType.List)
    expect(list).toBeTruthy()
    expect(list!.lines).toEqual(['- item 2', ''])
  })

  // ============================================================
  it('updateLine — table row 替换为普通文本', () => {
    const p = new Parser()
    p.read('| a | b |\n| c | d |\n')
    p.updateLine(0, 0, 'no longer table')
    const all = p.allBlocks()
    expect(all[0].type).toBe(BlockType.Paragraph)
    expect(all[0].lines).toEqual(['no longer table'])
    const table = all.find(b => b.type === BlockType.Table)
    expect(table).toBeTruthy()
    expect(table!.lines).toEqual(['| c | d |', ''])
  })

  // ============================================================
  it('updateLine — blockquote 替换为普通文本', () => {
    const p = new Parser()
    p.read('> quote line\n> more quote\n')
    p.updateLine(0, 0, 'plain text')
    const all = p.allBlocks()
    expect(all[0].type).toBe(BlockType.Paragraph)
    expect(all[0].lines).toEqual(['plain text'])
    const bq = all.find(b => b.type === BlockType.Blockquote)
    expect(bq).toBeTruthy()
    expect(bq!.lines).toEqual(['> more quote', ''])
  })

  // ============================================================
  it('updateLine — hr 替换为普通文本', () => {
    const p = new Parser()
    p.read('---\n')
    p.updateLine(0, 0, 'hello')
    const b = p.findBlocks(0, 0)[0] ?? null
    expect(b!.type).toBe(BlockType.Paragraph)
    expect(b!.lines).toEqual(['hello', ''])
  })

  // ============================================================
  it('updateLine — 普通文本变成 hr', () => {
    const p = new Parser()
    p.read('text\n---\n')
    p.updateLine(0, 0, '***')
    const b = p.findBlocks(0, 0)[0] ?? null
    expect(b!.type).toBe(BlockType.Hr)
    expect(b!.lines).toEqual(['***'])
  })

  // ============================================================
  it('updateLine — html block 标签替换为普通文本', () => {
    const p = new Parser()
    p.read('<div>content</div>\n')
    p.updateLine(0, 0, 'plain')
    const b = p.findBlocks(0, 0)[0] ?? null
    expect(b!.type).toBe(BlockType.Paragraph)
    expect(b!.lines).toEqual(['plain', ''])
  })

  // ============================================================
  it('updateLine — 在 html block 中插入闭合标签', () => {
    const p = new Parser()
    p.read('<div>\n  <p>text</p>\n</div>\n')
    p.updateLine(1, 1, '</div>')
    const all = p.allBlocks()
    expect(all.length).toBeGreaterThanOrEqual(2)
    expect(all[0].type).toBe(BlockType.Html)
    expect(all[0].lines).toEqual(['<div>', '</div>'])
  })

  // ============================================================
  it('dirty — updateLine 标记 dirty=2，再次 updateLine 清零重标', () => {
    const p = new Parser()
    p.read('# A\nline1\nline2\n')
    p.updateLine(1, 1, 'changed')
    const dirtyAfterFirst = p.allBlocks().map(b => b.dirty)
    expect(dirtyAfterFirst.some(d => d === 2)).toBe(true)

    p.updateLine(2, 2, 'changed2')
    // 所有 dirty 先被清零再重新标记，第一次的 dirty 不应残留
    const dirtyAfterSecond = p.allBlocks().map(b => b.dirty)
    // 只有受影响的 block dirty=2，其他 dirty=0
    const nonZero = dirtyAfterSecond.filter(d => (d ?? 0) > 0)
    expect(nonZero.length).toBeGreaterThan(0)
    // 上次影响的 block（line1）如果未受影响，应是 dirty=0
    const b1 = p.findBlocks(1, 1)[0] ?? null
    expect(b1!.dirty).toBe(0)
  })

  // ============================================================
  it('isEnd=true 边界 — buffer 恰好整除 batchSize', () => {
    const p = new Parser()
    p.setBatchSize([2])
    let lastIsEnd = false
    p.onUpdate((_blocks, isEnd) => { lastIsEnd = isEnd })
    // 生成恰好 2 个 block
    p.read('# A\n# B\n')
    expect(lastIsEnd).toBe(true)
  })

  // ============================================================
  it('read 空内容后再 read 有内容 — onUpdate 收到 isEnd=true', () => {
    const p = new Parser()
    const log: Array<{ len: number; isEnd: boolean }> = []
    p.onUpdate((list, isEnd) => log.push({ len: list.length, isEnd }))
    p.read('')
    p.read('# X\n')
    // 第一次 read('') → onUpdate([], true)
    // 第二次 read('# X\n') → onUpdate([heading], true)
    expect(log[0]).toEqual({ len: 0, isEnd: true })
    expect(log[log.length - 1].isEnd).toBe(true)
  })
})
