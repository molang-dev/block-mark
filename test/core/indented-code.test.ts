import { describe, it, expect } from 'vitest'
import { BlockMaker } from '../../src/core/BlockMaker'
import { blockMakerGFM } from '../../src/plugins/gfm'
import { BlockType } from '../../src/core/types'
import { GFMBlockType } from '../../src/plugins/gfm'

function parse(md: string, disableIndentedCode?: boolean) {
  let result: any[] = []
  new BlockMaker({ disableIndentedCode }).changed((blocks, isEnd) => {
    if (isEnd) result = blocks
  }).parse(md)
  return result
}

function parseGfm(md: string, disableIndentedCode?: boolean) {
  let result: any[] = []
  new BlockMaker({ disableIndentedCode }).use(blockMakerGFM).changed((blocks, isEnd) => {
    if (isEnd) result = blocks
  }).parse(md)
  return result
}

// ─── < 4 spaces: always recognized (both modes) ──────────────────────────────

describe('< 4 leading spaces — always recognized', () => {
  it('# heading with 3 spaces', () => {
    expect(parse('   # Heading')[0].type).toBe(BlockType.Heading)
  })
  it('## heading with 2 spaces', () => {
    expect(parse('  ## H2')[0].type).toBe(BlockType.Heading)
  })
  it('* list with 3 spaces', () => {
    expect(parse('   * item')[0].type).toBe(BlockType.List)
  })
  it('1. ordered list with 3 spaces', () => {
    expect(parse('   1. item')[0].type).toBe(BlockType.List)
  })
  it('> blockquote with 3 spaces', () => {
    expect(parse('   > quote')[0].type).toBe(BlockType.Blockquote)
  })
  it('--- hr with 3 spaces', () => {
    expect(parse('   ---')[0].type).toBe(BlockType.Hr)
  })
  it('table with 3 spaces (GFM)', () => {
    const b = parseGfm('   | A | B |\n   |---|---|\n   | 1 | 2 |')
    expect(b[0].type).toBe(GFMBlockType.Table)
  })
})

// ─── disableIndentedCode: false (default) ────────────────────────────────────

describe('disableIndentedCode: false (default) — ≥4 spaces become code', () => {
  it('    # heading → Code', () => {
    expect(parse('    # Heading')[0].type).toBe(BlockType.Code)
  })
  it('    ## heading → Code', () => {
    expect(parse('    ## H2')[0].type).toBe(BlockType.Code)
  })
  it('    * list → Code', () => {
    expect(parse('    * item')[0].type).toBe(BlockType.Code)
  })
  it('    1. ordered list → Code', () => {
    expect(parse('    1. item')[0].type).toBe(BlockType.Code)
  })
  it('    > blockquote → Code', () => {
    expect(parse('    > quote')[0].type).toBe(BlockType.Code)
  })
  it('    --- hr → Code', () => {
    expect(parse('    ---')[0].type).toBe(BlockType.Code)
  })
  it('    | table | → Code (GFM)', () => {
    const b = parseGfm('    | A | B |\n    |---|---|\n    | 1 | 2 |')
    expect(b[0].type).toBe(BlockType.Code)
  })
  it('tab-indented content → Code', () => {
    expect(parse('\t# Heading')[0].type).toBe(BlockType.Code)
  })
  it('fenced code still recognized', () => {
    expect(parse('```\ncode\n```')[0].type).toBe(BlockType.Code)
  })
})

// ─── disableIndentedCode: true ────────────────────────────────────────────────

describe('disableIndentedCode: true — ≥4 spaces stripped, syntax recognized', () => {
  it('    # heading → Heading', () => {
    expect(parse('    # Heading', true)[0].type).toBe(BlockType.Heading)
  })
  it('    ## heading → Heading', () => {
    expect(parse('    ## H2', true)[0].type).toBe(BlockType.Heading)
  })
  it('    * list → List', () => {
    expect(parse('    * item', true)[0].type).toBe(BlockType.List)
  })
  it('    1. ordered list → List', () => {
    expect(parse('    1. item', true)[0].type).toBe(BlockType.List)
  })
  it('    > blockquote → Blockquote', () => {
    expect(parse('    > quote', true)[0].type).toBe(BlockType.Blockquote)
  })
  it('    --- hr → Hr', () => {
    expect(parse('    ---', true)[0].type).toBe(BlockType.Hr)
  })
  it('    | table | → Table (GFM)', () => {
    const b = parseGfm('    | A | B |\n    |---|---|\n    | 1 | 2 |', true)
    expect(b[0].type).toBe(GFMBlockType.Table)
  })
  it('tab-indented heading → Heading', () => {
    expect(parse('\t# Heading', true)[0].type).toBe(BlockType.Heading)
  })
  it('fenced code still recognized', () => {
    expect(parse('```\ncode\n```', true)[0].type).toBe(BlockType.Code)
  })
  it('    fenced code still recognized', () => {
    expect(parse('    ```\ncode\n```', true)[0].type).toBe(BlockType.Code)
  })
  it('plain indented text → Paragraph (not code)', () => {
    expect(parse('    just text', true)[0].type).toBe(BlockType.Paragraph)
  })

  it('5-space ATX heading — heading text correct', () => {
    const b = parse('     ### H3 - title', true)[0]
    expect(b.type).toBe(BlockType.Heading)
    expect(b.depth).toBe(3)
    expect(b.markdown?.[0]?.children?.[0]?.text).toBe('H3 - title')
  })

  it('4-space list — list items parsed correctly', () => {
    const b = parse('    - item one\n    - item two', true)[0]
    expect(b.type).toBe(BlockType.List)
    expect(b.markdown?.[0]?.children).toHaveLength(2)
  })
})

// ─── table header alignment fix ──────────────────────────────────────────────

// ─── block.lines 原文不变 ────────────────────────────────────────────────────

function checkRaw(md: string, disableIndentedCode?: boolean) {
  const raw = md.split('\n')
  const blocks = parse(md, disableIndentedCode)
  for (const b of blocks) {
    expect(b.lines).toEqual(raw.slice(b.lineStart, b.lineEnd + 1))
  }
}

describe('block.lines === raw source lines (indented-code)', () => {
  it('disableIndentedCode:false — 4-space code block preserves leading spaces', () =>
    checkRaw('    line one\n    line two'))
  it('disableIndentedCode:false — fenced code with indented body preserved', () =>
    checkRaw('```python\ndef f():\n    return 1\n```'))
  it('disableIndentedCode:true — 4-space heading: block.lines keeps original spaces', () =>
    checkRaw('    # Heading', true))
  it('disableIndentedCode:true — 4-space list: block.lines keeps original spaces', () =>
    checkRaw('    - item', true))
  it('disableIndentedCode:true — fenced code indented body still raw', () =>
    checkRaw('```python\ndef greet(name):\n    return f"Hello, {name}!"\n\nresult = greet("World")\nprint(result)\n```', true))
  it('disableIndentedCode:true — mixed document', () =>
    checkRaw('    # H1\n\n```js\nfunction f() {\n    return 1;\n}\n```\n\nparagraph', true))
})

describe('table header with leading spaces', () => {
  it('3-space-indented table header aligns correctly', () => {
    const b = parseGfm('   | 名称 | 描述 |\n| :--- | :--- |\n| a | b |')
    expect(b[0].type).toBe(GFMBlockType.Table)
    // header row should have 2 cells, not 3 (no phantom empty cell)
    const headerRow = b[0].markdown?.[0]?.children?.[0]
    expect(headerRow?.children?.length).toBe(2)
  })
})
