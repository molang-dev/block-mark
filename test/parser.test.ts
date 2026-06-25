import { describe, it, expect } from 'vitest'
import { writeFileSync, unlinkSync } from 'node:fs'
import { Parser } from '../src/parser'
import type { TypedBlock, BlockType } from '../src/types'

function collect(mdContent: string): TypedBlock[] {
  const p = new Parser()
  const blocks: TypedBlock[] = []
  p.onBlockUpdate(b => blocks.push(b))
  p.read(mdContent)
  return blocks
}

describe('Parser', () => {
  // ============================================================
  it('基本 heading 分块 + 空行合并', () => {
    const blocks = collect('# Title\ncontent line 1\n\n## Sub\n- item1\n- item2\n\n```js\nvar a = 0;\n```\n')
    expect(blocks.length).toBeGreaterThanOrEqual(5)

    expect(blocks[0].type).toBe('heading')
    expect(blocks[0].depth).toBe(1)
    expect(blocks[0].lines).toEqual(['# Title'])

    expect(blocks[1].type).toBe('paragraph')
    expect(blocks[1].lines).toEqual(['content line 1', ''])

    const subHead = blocks.find(b => b.type === 'heading' && b.depth === 2)
    expect(subHead).toBeTruthy()
    expect(subHead!.lines).toEqual(['## Sub'])

    const list = blocks.find(b => b.type === 'list')
    expect(list).toBeTruthy()
    expect(list!.lines).toEqual(['- item1', '- item2', ''])

    const code = blocks.find(b => b.type === 'code')
    expect(code).toBeTruthy()
    expect(code!.lines).toEqual(['```js', 'var a = 0;', '```', ''])
  })

  // ============================================================
  it('前导 block（无 heading）', () => {
    const blocks = collect('preamble\n\n# Heading\nbody\n')
    expect(blocks[0].type).toBe('paragraph')
    expect(blocks[0].lines).toEqual(['preamble', ''])
    expect(blocks[1].type).toBe('heading')
    expect(blocks[1].lines).toEqual(['# Heading'])
  })

  // ============================================================
  it('有序+无序 list 合并', () => {
    const blocks = collect('# L\n- a\n- b\n1. c\n2. d\n')
    const list = blocks.find(b => b.type === 'list')
    expect(list).toBeTruthy()
    expect(list!.lines).toEqual(['- a', '- b', '1. c', '2. d', ''])
  })

  // ============================================================
  it('hr 三种形式', () => {
    const blocks = collect('# HR\n---\n***\n___\n')
    const hrs = blocks.filter(b => b.type === 'hr')
    expect(hrs.length).toBe(3)
    expect(hrs[0].lines).toEqual(['---'])
    expect(hrs[1].lines).toEqual(['***'])
    expect(hrs[2].lines).toEqual(['___', ''])
  })

  // ============================================================
  it('hr 不与 list 混淆：- item 是 list，--- 是 hr', () => {
    const blocks = collect('- item\n---\n')
    expect(blocks[0].type).toBe('list')
    expect(blocks[0].lines).toEqual(['- item'])
    expect(blocks[1].type).toBe('hr')
    expect(blocks[1].lines).toEqual(['---', ''])
  })

  // ============================================================
  it('blockquote — 连续的 > 行合并，保留 >', () => {
    const blocks = collect('# Q\n> line one\n> line two\n\nnot quote\n')
    const bq = blocks.find(b => b.type === 'blockquote')
    expect(bq).toBeTruthy()
    expect(bq!.lines).toEqual(['> line one', '> line two', ''])
  })

  // ============================================================
  it('table — 连续的 |...| 行合并', () => {
    const blocks = collect('# T\n| a | b |\n| c | d |\n\npara\n')
    const table = blocks.find(b => b.type === 'table')
    expect(table).toBeTruthy()
    expect(table!.lines).toEqual(['| a | b |', '| c | d |', ''])
  })

  // ============================================================
  it('code fence — 原样保留', () => {
    const blocks = collect('# C\n```python\nprint(1)\nprint(2)\n```\n')
    const code = blocks.find(b => b.type === 'code')
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
    p.onBlockUpdate(b => received.push(b.type))
    p.read('# A\nbody')
    expect(received).toEqual(['heading', 'paragraph'])
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
    expect(blocks[0].type).toBe('code')
    expect(blocks[0].lines).toEqual(['```python', '# 注释', 'print(1)', '```', ''])
  })

  // ============================================================
  it('fence 外的 heading 正常切分', () => {
    const blocks = collect('```\ncode\n```\n# real heading\nbody\n')
    const headings = blocks.filter(b => b.type === 'heading')
    expect(headings.length).toBe(1)
  })

  // ============================================================
  it('前导空白：heading / fence / hr / list / blockquote / table', () => {
    const blocks = collect('  ## 带空白的标题\n    - 带空白的列表\n  > 带空白的引用\n   | a | b |\n  ---\n')
    expect(blocks[0].type).toBe('heading')
    expect(blocks[0].depth).toBe(2)

    const list = blocks.find(b => b.type === 'list')
    expect(list).toBeTruthy()
    expect(list!.lines).toEqual(['    - 带空白的列表'])

    const bq = blocks.find(b => b.type === 'blockquote')
    expect(bq).toBeTruthy()

    const table = blocks.find(b => b.type === 'table')
    expect(table).toBeTruthy()

    const hr = blocks.find(b => b.type === 'hr')
    expect(hr!.lines).toEqual(['  ---', ''])
  })

  // ============================================================
  it('~~~ 作为 code fence', () => {
    const blocks = collect('~~~bash\necho ok\n~~~\n')
    expect(blocks.length).toBe(1)
    expect(blocks[0].type).toBe('code')
    expect(blocks[0].lines).toEqual(['~~~bash', 'echo ok', '~~~', ''])
  })

  // ============================================================
  it('~~~ 内部 # 不切分，外部 heading 正常', () => {
    const blocks = collect('~~~\n# 注释\ncode\n~~~\n# real heading\nbody\n')
    expect(blocks[0].type).toBe('code')
    expect(blocks[0].lines).toEqual(['~~~', '# 注释', 'code', '~~~'])
    expect(blocks[1].type).toBe('heading')
  })

  // ============================================================
  it('HTML 多行 block，内部 # 不切分', () => {
    const blocks = collect('<div class="wrap">\n  # 不是 heading\n  <p>text</p>\n</div>\n# real heading\nbody\n')
    expect(blocks[0].type).toBe('html')
    expect(blocks[0].lines).toEqual(['<div class="wrap">', '  # 不是 heading', '  <p>text</p>', '</div>'])
    expect(blocks[1].type).toBe('heading')
  })

  // ============================================================
  it('HTML 嵌套标签深度跟踪', () => {
    const blocks = collect('<div>\n  <ul>\n    <li>a</li>\n  </ul>\n</div>\n')
    expect(blocks.length).toBe(1)
    expect(blocks[0].type).toBe('html')
    expect(blocks[0].lines).toEqual(['<div>', '  <ul>', '    <li>a</li>', '  </ul>', '</div>', ''])
  })

  // ============================================================
  it('HTML void/自闭合 → 单行 block', () => {
    const blocks = collect('<hr>\n<br/>\n<img src="x.png">\n')
    expect(blocks.filter(b => b.type === 'html').length).toBe(3)
  })

  // ============================================================
  it('HTML 前导空白', () => {
    const blocks = collect('  <div>\n    content\n  </div>\n')
    expect(blocks[0].type).toBe('html')
    expect(blocks[0].lines).toEqual(['  <div>', '    content', '  </div>', ''])
  })

  // ============================================================
  it('onDone + allBlocks', () => {
    const p = new Parser()
    let done = false
    p.onDone(() => { done = true })
    p.read('# Hello\n')
    expect(done).toBe(true)
    expect(p.allBlocks().length).toBeGreaterThan(0)
  })

  // ============================================================
  it('readFile 正常文件', () => {
    const tmp = '/tmp/mdparser_ts_test.md'
    writeFileSync(tmp, '# Hi\nworld\n')
    const p = new Parser()
    const blocks: TypedBlock[] = []
    p.onBlockUpdate(b => blocks.push(b))
    const ret = p.readFile(tmp)
    expect(ret).toBeUndefined()
    expect(blocks.length).toBeGreaterThan(0)
    unlinkSync(tmp)
  })
})
