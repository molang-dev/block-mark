import { describe, it, expect } from 'vitest'
import { BlockMaker } from '../../src/core/BlockMaker'
import { NodeType } from '../../src/core/types'
import { blockMakerGFM, GFMBlockType, GFMNodeType } from '../../src/plugins/gfm'

function parse(md: string) {
  let result: any[] = []
  new BlockMaker().use(blockMakerGFM).changed((blocks, isEnd) => { if (isEnd) result = blocks }).parse(md)
  return result
}

function inlineNodes(md: string): any[] {
  const blocks = parse(md)
  return blocks[0]?.markdown?.[0]?.children ?? []
}

// ─── G-B-01 Table ────────────────────────────────────────────────────────────

describe('GFM Table — block recognition', () => {
  it('basic table is GFMBlockType.Table', () => {
    const blocks = parse('| A | B |\n|---|---|\n| 1 | 2 |')
    expect(blocks[0].type).toBe(GFMBlockType.Table)
  })

  it('table requires | in header line', () => {
    const blocks = parse('A B\n---\n1 2')
    expect(blocks[0].type).not.toBe(GFMBlockType.Table)
  })

  it('table requires valid sep row (--- cells)', () => {
    const blocks = parse('| A | B |\n| x | y |\n| 1 | 2 |')
    expect(blocks[0].type).not.toBe(GFMBlockType.Table)
  })

  it('table stops at blank line', () => {
    const blocks = parse('| A | B |\n|---|---|\n| 1 | 2 |\n\n| 3 | 4 |')
    expect(blocks.filter((b: any) => b.type === GFMBlockType.Table)).toHaveLength(1)
    expect(blocks[0].type).toBe(GFMBlockType.Table)
    expect(blocks[1].type).not.toBe(GFMBlockType.Table)
  })

  it('table with only header+sep (no body rows) is valid', () => {
    const blocks = parse('| A | B |\n|---|---|')
    expect(blocks[0].type).toBe(GFMBlockType.Table)
  })

  it('table body has correct row count', () => {
    const blocks = parse('| A |\n|---|\n| r1 |\n| r2 |\n| r3 |')
    const table = blocks[0].markdown?.[0]
    expect(table?.children).toHaveLength(4) // 1 header + 3 body
  })
})

describe('GFM Table — alignment', () => {
  it('default alignment: null in meta', () => {
    const blocks = parse('| A |\n|---|\n| v |')
    const align = JSON.parse(blocks[0].meta)
    expect(align[0]).toBeNull()
  })

  it(':--- = left align', () => {
    const blocks = parse('| A |\n|:---|\n| v |')
    const align = JSON.parse(blocks[0].meta)
    expect(align[0]).toBe('left')
  })

  it('---: = right align', () => {
    const blocks = parse('| A |\n|---:|\n| v |')
    const align = JSON.parse(blocks[0].meta)
    expect(align[0]).toBe('right')
  })

  it(':---: = center align', () => {
    const blocks = parse('| A |\n|:---:|\n| v |')
    const align = JSON.parse(blocks[0].meta)
    expect(align[0]).toBe('center')
  })

  it('mixed alignment per column', () => {
    const blocks = parse('| L | C | R |\n|:---|:---:|---:|\n| a | b | c |')
    const align = JSON.parse(blocks[0].meta)
    expect(align).toEqual(['left', 'center', 'right'])
  })
})

describe('GFM Table — node structure', () => {
  it('markdown[0] is GFMNodeType.Table', () => {
    const blocks = parse('| A |\n|---|\n| v |')
    expect(blocks[0].markdown?.[0]?.type).toBe(GFMNodeType.Table)
  })

  it('first row is header row', () => {
    const blocks = parse('| Name |\n|------|\n| Alice |')
    const rows = blocks[0].markdown?.[0]?.children
    const header = rows?.[0]
    expect(header?.type).toBe(GFMNodeType.TableRow)
    expect(header?.children?.[0]?.type).toBe(GFMNodeType.TableCell)
  })

  it('header cell text matches column name', () => {
    const blocks = parse('| Name | Age |\n|---|---|\n| Alice | 30 |')
    const headerRow = blocks[0].markdown?.[0]?.children?.[0]
    const cells = headerRow?.children
    const text0 = cells?.[0]?.children?.map((n: any) => n.text).join('')
    const text1 = cells?.[1]?.children?.map((n: any) => n.text).join('')
    expect(text0).toBe('Name')
    expect(text1).toBe('Age')
  })

  it('body row cell text matches value', () => {
    const blocks = parse('| A |\n|---|\n| hello |')
    const bodyRow = blocks[0].markdown?.[0]?.children?.[1]
    const cellText = bodyRow?.children?.[0]?.children?.map((n: any) => n.text).join('')
    expect(cellText).toBe('hello')
  })

  it('cell alignment stored in cell meta', () => {
    const blocks = parse('| A |\n|:---:|\n| v |')
    const headerCell = blocks[0].markdown?.[0]?.children?.[0]?.children?.[0]
    expect(headerCell?.meta).toBe('center')
  })

  it('table cell with inline em content', () => {
    const blocks = parse('| *bold* |\n|---|\n| v |')
    const headerCell = blocks[0].markdown?.[0]?.children?.[0]?.children?.[0]
    const em = headerCell?.children?.find((n: any) => n.type === NodeType.Em)
    expect(em).toBeDefined()
  })
})

// ─── G-B-02 FootnoteDef ──────────────────────────────────────────────────────

describe('GFM FootnoteDef — block recognition', () => {
  it('[^id]: content → GFMBlockType.FootnoteDef', () => {
    const blocks = parse('[^foo]: bar')
    expect(blocks[0].type).toBe(GFMBlockType.FootnoteDef)
  })

  it('meta equals lowercased footnote id', () => {
    const blocks = parse('[^MyNote]: text')
    expect(blocks[0].meta).toBe('mynote')
  })

  it('multi-line footnote with 4-space continuation', () => {
    const blocks = parse('[^id]: first line\n    second line')
    expect(blocks[0].type).toBe(GFMBlockType.FootnoteDef)
    expect(blocks[0].lines.some((l: string) => l.includes('second'))).toBe(true)
  })

  it('continuation without 4-space indent ends footnote', () => {
    const blocks = parse('[^id]: first\nnot indented')
    expect(blocks).toHaveLength(2)
    expect(blocks[0].type).toBe(GFMBlockType.FootnoteDef)
  })

  it('footnote def markdown[0] is GFMNodeType.FootnoteDef', () => {
    const blocks = parse('[^id]: content')
    expect(blocks[0].markdown?.[0]?.type).toBe(GFMNodeType.FootnoteDef)
  })

  it('footnote def node has defId field', () => {
    const blocks = parse('[^abc]: content')
    expect(blocks[0].markdown?.[0]?.defId).toBe('abc')
  })
})

describe('GFM FootnoteRef — inline', () => {
  it('[^id] in paragraph → FootnoteRef node', () => {
    const nodes = inlineNodes('text [^note]\n\n[^note]: content')
    const ref = nodes.find((n: any) => n.type === GFMNodeType.FootnoteRef)
    expect(ref).toBeDefined()
  })

  it('footnote ref defId matches definition id', () => {
    const nodes = inlineNodes('see [^abc]\n\n[^abc]: content')
    const ref = nodes.find((n: any) => n.type === GFMNodeType.FootnoteRef)
    expect(ref?.defId).toBe('abc')
  })
})

// ─── G-B-03 Alert ────────────────────────────────────────────────────────────

describe('GFM Alert — block recognition', () => {
  it('> [!NOTE] → GFMBlockType.Alert', () => {
    const blocks = parse('> [!NOTE]')
    expect(blocks[0].type).toBe(GFMBlockType.Alert)
  })

  it('> [!TIP] → Alert', () => {
    expect(parse('> [!TIP]')[0].type).toBe(GFMBlockType.Alert)
  })

  it('> [!WARNING] → Alert', () => {
    expect(parse('> [!WARNING]')[0].type).toBe(GFMBlockType.Alert)
  })

  it('> [!CAUTION] → Alert', () => {
    expect(parse('> [!CAUTION]')[0].type).toBe(GFMBlockType.Alert)
  })

  it('> [!IMPORTANT] → Alert', () => {
    expect(parse('> [!IMPORTANT]')[0].type).toBe(GFMBlockType.Alert)
  })

  it('alert meta equals lowercased type', () => {
    const blocks = parse('> [!WARNING]')
    expect(blocks[0].meta).toBe('warning')
  })

  it('alert is case-insensitive', () => {
    const blocks = parse('> [!note]')
    expect(blocks[0].type).toBe(GFMBlockType.Alert)
  })

  it('alert with content line', () => {
    const blocks = parse('> [!NOTE]\n> some content')
    expect(blocks[0].type).toBe(GFMBlockType.Alert)
    expect(blocks[0].lines).toHaveLength(2)
  })
})

describe('GFM Alert — node structure', () => {
  it('markdown[0] is GFMNodeType.Alert', () => {
    const blocks = parse('> [!NOTE]')
    expect(blocks[0].markdown?.[0]?.type).toBe(GFMNodeType.Alert)
  })

  it('first child of Alert is AlertTitle', () => {
    const blocks = parse('> [!NOTE]')
    const alertNode = blocks[0].markdown?.[0]
    expect(alertNode?.children?.[0]?.type).toBe(GFMNodeType.AlertTitle)
  })

  it('AlertTitle text matches alert type name', () => {
    const blocks = parse('> [!WARNING]')
    const titleNode = blocks[0].markdown?.[0]?.children?.[0]
    expect(titleNode?.text).toContain('Warning')
  })

  it('alert content lines are parsed as children after title', () => {
    const blocks = parse('> [!NOTE]\n> hello world')
    const alertNode = blocks[0].markdown?.[0]
    expect(alertNode?.children?.length).toBeGreaterThan(1)
  })
})

// ─── G-B-04 MathBlock ────────────────────────────────────────────────────────

describe('GFM MathBlock — block recognition', () => {
  it('$$ ... $$ → GFMBlockType.MathBlock', () => {
    const blocks = parse('$$\nx^2\n$$')
    expect(blocks[0].type).toBe(GFMBlockType.MathBlock)
  })

  it('$$ alone (unclosed) → collected as-is', () => {
    const blocks = parse('$$\nx^2')
    // Should collect remaining lines (or be MathBlock with unclosed)
    expect(blocks[0].type).toBe(GFMBlockType.MathBlock)
  })

  it('empty math block ($$\\n$$)', () => {
    const blocks = parse('$$\n$$')
    expect(blocks[0].type).toBe(GFMBlockType.MathBlock)
    const text = blocks[0].markdown?.[0]?.text ?? ''
    expect(text).toBe('')
  })

  it('math block node text is formula content', () => {
    const blocks = parse('$$\na + b = c\n$$')
    expect(blocks[0].markdown?.[0]?.text).toBe('a + b = c')
  })

  it('multi-line formula preserved', () => {
    const blocks = parse('$$\nline1\nline2\n$$')
    expect(blocks[0].markdown?.[0]?.text).toBe('line1\nline2')
  })

  it('markdown[0] is GFMNodeType.MathBlock', () => {
    const blocks = parse('$$\nf(x)\n$$')
    expect(blocks[0].markdown?.[0]?.type).toBe(GFMNodeType.MathBlock)
  })
})

describe('GFM MathInline — inline', () => {
  it('$x$ in paragraph → MathInline node', () => {
    const nodes = inlineNodes('value is $x^2$')
    const math = nodes.find((n: any) => n.type === GFMNodeType.MathInline)
    expect(math).toBeDefined()
    expect(math?.text).toBe('x^2')
  })

  it('unclosed $ is literal', () => {
    const nodes = inlineNodes('price $100')
    const math = nodes.find((n: any) => n.type === GFMNodeType.MathInline)
    expect(math).toBeUndefined()
  })
})

// ─── G-I-01 Strikethrough ────────────────────────────────────────────────────

describe('GFM Strikethrough', () => {
  it('~~text~~ → Del node', () => {
    const nodes = inlineNodes('~~deleted~~')
    expect(nodes[0].type).toBe(GFMNodeType.Del)
  })

  it('Del node has children with inner text', () => {
    const nodes = inlineNodes('~~hello~~')
    const text = nodes[0].children?.map((n: any) => n.text).join('')
    expect(text).toBe('hello')
  })

  it('unclosed ~~ is literal text', () => {
    const nodes = inlineNodes('~~unclosed')
    expect(nodes.every((n: any) => n.type !== GFMNodeType.Del)).toBe(true)
  })

  it('~~two words~~ → single Del node', () => {
    const nodes = inlineNodes('~~hello world~~')
    expect(nodes[0].type).toBe(GFMNodeType.Del)
    const text = nodes[0].children?.map((n: any) => n.text).join('')
    expect(text).toBe('hello world')
  })
})
