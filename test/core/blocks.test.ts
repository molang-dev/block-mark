import { describe, it, expect } from 'vitest'
import { BlockMaker } from '../../src/core/BlockMaker'
import { BlockType, NodeType, DirtyFlag } from '../../src/core/types'

function parse(md: string) {
  let result: any[] = []
  new BlockMaker().changed((blocks, isEnd) => { if (isEnd) result = blocks }).parse(md)
  return result
}

// ─── B-02 ATX Heading ────────────────────────────────────────────────────────

describe('ATX Heading', () => {
  it('parses h1–h6', () => {
    const blocks = parse('# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6')
    expect(blocks).toHaveLength(6)
    blocks.forEach((b, i) => {
      expect(b.type).toBe(BlockType.Heading)
      expect(b.depth).toBe(i + 1)
    })
  })

  it('requires space after #', () => {
    const blocks = parse('#not-a-heading\n# is heading')
    expect(blocks[0].type).toBe(BlockType.Paragraph)
    expect(blocks[1].type).toBe(BlockType.Heading)
  })

  it('allows 0-3 leading spaces', () => {
    const b0 = parse('# h')
    const b1 = parse(' # h')
    const b2 = parse('  # h')
    const b3 = parse('   # h')
    expect(b0[0].type).toBe(BlockType.Heading)
    expect(b1[0].type).toBe(BlockType.Heading)
    expect(b2[0].type).toBe(BlockType.Heading)
    expect(b3[0].type).toBe(BlockType.Heading)
  })

  it('4 leading spaces = code block, not heading', () => {
    const blocks = parse('    # not heading')
    expect(blocks[0].type).toBe(BlockType.Code)
  })

  it('trailing # stripped from ATX text', () => {
    const blocks = parse('# Heading ##')
    const nd = blocks[0].markdown?.[0]
    expect(nd?.children?.[0]?.text).toBe('Heading')
  })
})

// ─── B-03 Setext Heading ─────────────────────────────────────────────────────

describe('Setext Heading', () => {
  it('=== is h1, --- is h2', () => {
    const blocks = parse('Title\n=====\n\nSubtitle\n--------')
    expect(blocks[0].type).toBe(BlockType.Heading)
    expect(blocks[0].depth).toBe(1)
    expect(blocks[1].type).toBe(BlockType.Heading)
    expect(blocks[1].depth).toBe(2)
  })

  it('--- alone is HR, not setext', () => {
    const blocks = parse('---')
    expect(blocks[0].type).toBe(BlockType.Hr)
  })

  it('text + interrupt before --- is paragraph + hr', () => {
    const blocks = parse('Foo\n* * *')
    expect(blocks[0].type).toBe(BlockType.Paragraph)
    expect(blocks[1].type).toBe(BlockType.Hr)
  })
})

// ─── B-04 Indented Code ──────────────────────────────────────────────────────

describe('Indented Code Block', () => {
  it('4 spaces = indented code', () => {
    const blocks = parse('    code here')
    expect(blocks[0].type).toBe(BlockType.Code)
    expect(blocks[0].markdown?.[0]?.text).toBe('code here')
  })

  it('does not interrupt paragraph', () => {
    const blocks = parse('paragraph\n    still paragraph')
    expect(blocks[0].type).toBe(BlockType.Paragraph)
    expect(blocks).toHaveLength(1)
  })

  it('trailing blanks not included', () => {
    const blocks = parse('    code\n\nnot code')
    expect(blocks[0].type).toBe(BlockType.Code)
    expect(blocks[1].type).not.toBe(BlockType.Code)
  })
})

// ─── B-05 Fenced Code ────────────────────────────────────────────────────────

describe('Fenced Code Block', () => {
  it('``` fence with lang', () => {
    const blocks = parse('```typescript\nconst x = 1\n```')
    expect(blocks[0].type).toBe(BlockType.Code)
    expect(blocks[0].markdown?.[0]?.lang).toBe('typescript')
    expect(blocks[0].markdown?.[0]?.text).toBe('const x = 1')
  })

  it('~~~ fence', () => {
    const blocks = parse('~~~\ncontent\n~~~')
    expect(blocks[0].type).toBe(BlockType.Code)
    expect(blocks[0].markdown?.[0]?.text).toBe('content')
  })

  it('unclosed fence includes all remaining lines', () => {
    const blocks = parse('```\nunclosed')
    expect(blocks[0].type).toBe(BlockType.Code)
  })

  it('closing fence must match char and length', () => {
    const blocks = parse('```\ncontent\n``')  // `` is not a closing fence
    expect(blocks[0].markdown?.[0]?.text).toContain('content')
  })

  it('empty lang info', () => {
    const blocks = parse('```\nno lang\n```')
    expect(blocks[0].markdown?.[0]?.lang).toBeUndefined()
  })
})

// ─── B-06 HTML Block ─────────────────────────────────────────────────────────

describe('HTML Block', () => {
  it('type 1: <pre>', () => {
    const blocks = parse('<pre>\ncontent\n</pre>')
    expect(blocks[0].type).toBe(BlockType.Html)
  })

  it('type 2: comment', () => {
    const blocks = parse('<!-- comment -->\nparagraph')
    expect(blocks[0].type).toBe(BlockType.Html)
    expect(blocks[1].type).toBe(BlockType.Paragraph)
  })

  it('type 6: block tag', () => {
    const blocks = parse('<div>\ncontent\n</div>')
    expect(blocks[0].type).toBe(BlockType.Html)
  })

  it('unknown tag is not html block', () => {
    const blocks = parse('<custom-tag>\ncontent')
    expect(blocks[0].type).toBe(BlockType.Paragraph)
  })
})

// ─── B-07 Link Def ───────────────────────────────────────────────────────────

describe('Link Reference Definition', () => {
  it('parses [label]: url', () => {
    const blocks = parse('[foo]: https://example.com\n\n[foo]')
    expect(blocks[0].type).toBe(BlockType.Def)
    expect(blocks[0].meta).toBe('foo')
  })

  it('resolves forward references', () => {
    const blocks = parse('[foo]\n\n[foo]: https://example.com')
    const para = blocks[0]
    const linkNode = para.markdown?.[0]?.children?.find((n: any) => n.type === NodeType.LinkRef)
    expect(linkNode?.url).toBe('https://example.com')
  })

  it('title on next line', () => {
    const blocks = parse('[foo]: https://example.com\n"Title"')
    expect(blocks[0].type).toBe(BlockType.Def)
  })
})

// ─── B-08 Blockquote ─────────────────────────────────────────────────────────

describe('Blockquote', () => {
  it('> prefix', () => {
    const blocks = parse('> hello world')
    expect(blocks[0].type).toBe(BlockType.Blockquote)
  })

  it('nested blockquote', () => {
    const blocks = parse('> > nested')
    expect(blocks[0].type).toBe(BlockType.Blockquote)
  })

  it('lazy continuation', () => {
    const blocks = parse('> line 1\ncontinuation')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe(BlockType.Blockquote)
  })

  it('blank breaks blockquote', () => {
    const blocks = parse('> line 1\n\nnot bq')
    expect(blocks.some((b: any) => b.type === BlockType.Paragraph)).toBe(true)
  })
})

// ─── B-09 List ───────────────────────────────────────────────────────────────

describe('List', () => {
  it('unordered list', () => {
    const blocks = parse('- item 1\n- item 2\n- item 3')
    expect(blocks[0].type).toBe(BlockType.List)
    const listNode = blocks[0].markdown?.[0]
    expect(listNode?.children).toHaveLength(3)
  })

  it('ordered list', () => {
    const blocks = parse('1. first\n2. second')
    const listNode = blocks[0].markdown?.[0]
    expect(listNode?.ordered).toBe(true)
    expect(listNode?.start).toBe(1)
  })

  it('loose list (blank between items)', () => {
    const blocks = parse('- item 1\n\n- item 2')
    const listNode = blocks[0].markdown?.[0]
    expect(listNode?.loose).toBe(true)
  })

  it('tight list (no blank between items)', () => {
    const blocks = parse('- item 1\n- item 2')
    const listNode = blocks[0].markdown?.[0]
    expect(listNode?.loose).toBeUndefined()
  })

  it('continuation line indented by W', () => {
    const blocks = parse('- item\n  continuation')
    const listNode = blocks[0].markdown?.[0]
    const firstItem = listNode?.children?.[0]
    const paraText = firstItem?.children?.[0]?.children?.map((n: any) => n.text).join('')
    expect(paraText).toContain('item')
  })

  it('sublist nested with indentation', () => {
    const blocks = parse('- parent\n  - child')
    const listNode = blocks[0].markdown?.[0]
    const parentItem = listNode?.children?.[0]
    // parent item should contain a nested list
    const nested = parentItem?.children?.find((n: any) => n.type === NodeType.List)
    expect(nested).toBeDefined()
  })

  it('double blank ends list', () => {
    const blocks = parse('- item\n\n\nparagraph')
    expect(blocks.some((b: any) => b.type === BlockType.Paragraph)).toBe(true)
  })
})

// ─── B-10 Thematic Break ─────────────────────────────────────────────────────

describe('Thematic Break', () => {
  it('--- is hr', () => {
    expect(parse('---')[0].type).toBe(BlockType.Hr)
  })
  it('*** is hr', () => {
    expect(parse('***')[0].type).toBe(BlockType.Hr)
  })
  it('___ is hr', () => {
    expect(parse('___')[0].type).toBe(BlockType.Hr)
  })
  it('- - - with spaces is hr', () => {
    expect(parse('- - -')[0].type).toBe(BlockType.Hr)
  })
  it('-- is not hr (need 3)', () => {
    expect(parse('--')[0].type).toBe(BlockType.Paragraph)
  })
})

// ─── B-11 Paragraph ──────────────────────────────────────────────────────────

describe('Paragraph', () => {
  it('plain text is paragraph', () => {
    const blocks = parse('hello world')
    expect(blocks[0].type).toBe(BlockType.Paragraph)
  })

  it('multi-line paragraph', () => {
    const blocks = parse('line 1\nline 2\nline 3')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe(BlockType.Paragraph)
  })

  it('blank line separates paragraphs', () => {
    const blocks = parse('para 1\n\npara 2')
    expect(blocks.filter((b: any) => b.type === BlockType.Paragraph)).toHaveLength(2)
  })
})

// ─── lineStart / lineEnd ─────────────────────────────────────────────────────

describe('Block line numbers', () => {
  it('tracks lineStart and lineEnd', () => {
    const blocks = parse('# Title\n\nParagraph')
    const heading = blocks[0]
    const para = blocks[blocks.length - 1]
    expect(heading.lineStart).toBe(0)
    expect(heading.lineEnd).toBe(0)
    expect(para.lineStart).toBeGreaterThan(0)
  })
})

// ─── showTypeName ─────────────────────────────────────────────────────────────

describe('showTypeName', () => {
  it('sets typeName on blocks and nodes when enabled', () => {
    let result: any[] = []
    new BlockMaker({ showTypeName: true })
      .changed((blocks, isEnd) => { if (isEnd) result = blocks })
      .parse('# Hello *world*')
    expect(result[0].typeName).toBe('Heading')
    const em = result[0].markdown?.[0]?.children?.find((n: any) => n.typeName === 'Em')
    expect(em).toBeDefined()
  })

  it('does not set typeName by default', () => {
    const blocks = parse('# Hello')
    expect(blocks[0].typeName).toBeUndefined()
  })
})
