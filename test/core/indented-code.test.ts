import { describe, it, expect } from 'vitest'
import { BlockMaker } from '../../src/core/BlockMaker'
import { blockMakerGFM } from '../../src/plugins/gfm'
import { BlockType } from '../../src/core/types'
import { GFMBlockType } from '../../src/plugins/gfm'

function parse(md: string, indentedCode?: boolean) {
  let result: any[] = []
  new BlockMaker({ indentedCode }).changed((blocks, isEnd) => {
    if (isEnd) result = blocks
  }).parse(md)
  return result
}

function parseGfm(md: string, indentedCode?: boolean) {
  let result: any[] = []
  new BlockMaker({ indentedCode }).use(blockMakerGFM).changed((blocks, isEnd) => {
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

// ─── indentedCode: true (default) ────────────────────────────────────────────

describe('indentedCode: true (default) — ≥4 spaces become code', () => {
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

// ─── indentedCode: false ──────────────────────────────────────────────────────

describe('indentedCode: false — ≥4 spaces stripped, syntax recognized', () => {
  it('    # heading → Heading', () => {
    expect(parse('    # Heading', false)[0].type).toBe(BlockType.Heading)
  })
  it('    ## heading → Heading', () => {
    expect(parse('    ## H2', false)[0].type).toBe(BlockType.Heading)
  })
  it('    * list → List', () => {
    expect(parse('    * item', false)[0].type).toBe(BlockType.List)
  })
  it('    1. ordered list → List', () => {
    expect(parse('    1. item', false)[0].type).toBe(BlockType.List)
  })
  it('    > blockquote → Blockquote', () => {
    expect(parse('    > quote', false)[0].type).toBe(BlockType.Blockquote)
  })
  it('    --- hr → Hr', () => {
    expect(parse('    ---', false)[0].type).toBe(BlockType.Hr)
  })
  it('    | table | → Table (GFM)', () => {
    const b = parseGfm('    | A | B |\n    |---|---|\n    | 1 | 2 |', false)
    expect(b[0].type).toBe(GFMBlockType.Table)
  })
  it('tab-indented heading → Heading', () => {
    expect(parse('\t# Heading', false)[0].type).toBe(BlockType.Heading)
  })
  it('fenced code still recognized', () => {
    expect(parse('```\ncode\n```', false)[0].type).toBe(BlockType.Code)
  })
  it('    fenced code still recognized', () => {
    expect(parse('    ```\ncode\n```', false)[0].type).toBe(BlockType.Code)
  })
  it('plain indented text → Paragraph (not code)', () => {
    expect(parse('    just text', false)[0].type).toBe(BlockType.Paragraph)
  })
})

// ─── table header alignment fix ──────────────────────────────────────────────

describe('table header with leading spaces', () => {
  it('3-space-indented table header aligns correctly', () => {
    const b = parseGfm('   | 名称 | 描述 |\n| :--- | :--- |\n| a | b |')
    expect(b[0].type).toBe(GFMBlockType.Table)
    // header row should have 2 cells, not 3 (no phantom empty cell)
    const headerRow = b[0].markdown?.[0]?.children?.[0]
    expect(headerRow?.children?.length).toBe(2)
  })
})
