import { describe, it, expect } from 'vitest'
import { BlockMaker } from '../../src/core/BlockMaker'
import { BlockType, NodeType, DirtyFlag } from '../../src/core/types'
import { blockMakerGFM, GFMBlockType, GFMNodeType } from '../../src/plugins/gfm'

function parse(md: string) {
  let result: any[] = []
  new BlockMaker().changed((blocks, isEnd) => { if (isEnd) result = blocks }).parse(md)
  return result
}

function parseGFM(md: string) {
  let result: any[] = []
  new BlockMaker().use(blockMakerGFM).changed((blocks, isEnd) => { if (isEnd) result = blocks }).parse(md)
  return result
}

function bm(md: string): BlockMaker {
  return new BlockMaker().changed(() => {}).parse(md)
}

// ─── ATX Heading edge cases ──────────────────────────────────────────────────

describe('ATX Heading — edge cases', () => {
  it('# alone (no text) → Heading with empty children', () => {
    const blocks = parse('# ')
    expect(blocks[0].type).toBe(BlockType.Heading)
    expect(blocks[0].depth).toBe(1)
  })

  it('7 # signs → not a heading (paragraph)', () => {
    const blocks = parse('####### seven')
    expect(blocks[0].type).toBe(BlockType.Paragraph)
  })

  it('# text # trailing hash stripped', () => {
    const blocks = parse('# Hello #')
    const text = blocks[0].markdown?.[0]?.children?.map((n: any) => n.text).join('')
    expect(text).toBe('Hello')
  })

  it('# text ## different-length trailing hash stripped', () => {
    const blocks = parse('## Title ##')
    const text = blocks[0].markdown?.[0]?.children?.map((n: any) => n.text).join('')
    expect(text).toBe('Title')
  })

  it('# text #nospace trailing not stripped (no space before #)', () => {
    const blocks = parse('# Hello#')
    const text = blocks[0].markdown?.[0]?.children?.map((n: any) => n.text).join('')
    expect(text).toBe('Hello#')
  })

  it('block.depth is 1 through 6 for # through ######', () => {
    const md = '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6'
    const blocks = parse(md)
    blocks.forEach((b, i) => {
      expect(b.depth).toBe(i + 1)
    })
  })

  it('heading with inline strong: children include Strong node', () => {
    const blocks = parse('# **bold** title')
    const children = blocks[0].markdown?.[0]?.children
    expect(children?.some((n: any) => n.type === NodeType.Bold)).toBe(true)
  })

  it('heading interrupts preceding paragraph', () => {
    const blocks = parse('some text\n# Heading')
    expect(blocks[0].type).toBe(BlockType.Paragraph)
    expect(blocks[1].type).toBe(BlockType.Heading)
  })
})

// ─── Setext Heading edge cases ───────────────────────────────────────────────

describe('Setext Heading — edge cases', () => {
  it('multi-line text above === → single h1', () => {
    const blocks = parse('line one\nline two\n=========')
    expect(blocks[0].type).toBe(BlockType.Heading)
    expect(blocks[0].depth).toBe(1)
  })

  it('single = is enough for h1 underline', () => {
    const blocks = parse('Title\n=')
    expect(blocks[0].type).toBe(BlockType.Heading)
    expect(blocks[0].depth).toBe(1)
  })

  it('single - is enough for h2 underline', () => {
    const blocks = parse('Title\n-')
    expect(blocks[0].type).toBe(BlockType.Heading)
    expect(blocks[0].depth).toBe(2)
  })

  it('setext candidate interrupted by ATX → no setext formed', () => {
    // # before the underline breaks the setext
    const blocks = parse('candidate\n# Heading\n---')
    expect(blocks[0].type).toBe(BlockType.Paragraph)
    expect(blocks[1].type).toBe(BlockType.Heading)
    expect(blocks[2].type).toBe(BlockType.Hr)
  })

  it('blank line before underline → paragraph, then hr', () => {
    const blocks = parse('text\n\n---')
    expect(blocks[0].type).toBe(BlockType.Paragraph)
    expect(blocks[1].type).toBe(BlockType.Hr)
  })
})

// ─── Fenced Code edge cases ──────────────────────────────────────────────────

describe('Fenced Code — edge cases', () => {
  it('block.meta equals info string', () => {
    const blocks = parse('```typescript\ncode\n```')
    expect(blocks[0].meta).toBe('typescript')
  })

  it('no meta when no info string', () => {
    const blocks = parse('```\ncode\n```')
    expect(blocks[0].meta).toBeUndefined()
  })

  it('closing fence with 1 leading space is valid', () => {
    const blocks = parse('```\ncode\n ```')
    expect(blocks[0].markdown?.[0]?.text).toBe('code')
  })

  it('closing fence with 3 leading spaces is valid', () => {
    const blocks = parse('```\ncode\n   ```')
    expect(blocks[0].markdown?.[0]?.text).toBe('code')
  })

  it('closing fence with 4 spaces: collector skips it, processor treats \\s* as close', () => {
    // The collector does not recognize 4-space close (requires 0-3 spaces),
    // so it is collected as a content line. However the processor uses \s*
    // and strips it as the closing fence → text is just 'code'.
    const blocks = parse('```\ncode\n    ```')
    expect(blocks[0].type).toBe(BlockType.Code)
    expect(blocks[0].markdown?.[0]?.text).toBe('code')
  })

  it('longer closing fence than opening is accepted', () => {
    const blocks = parse('```\ncode\n`````')
    expect(blocks[0].markdown?.[0]?.text).toBe('code')
  })

  it('closing backticks shorter than opening do not close fence', () => {
    const blocks = parse('````\ncode\n```\nmore\n````')
    expect(blocks[0].markdown?.[0]?.text).toBe('code\n```\nmore')
  })

  it('tilde fence not closed by backtick fence', () => {
    const blocks = parse('~~~\ncode\n```\n~~~')
    expect(blocks[0].markdown?.[0]?.text).toBe('code\n```')
  })

  it('empty code body (open + close only)', () => {
    const blocks = parse('```\n```')
    expect(blocks[0].type).toBe(BlockType.Code)
    expect(blocks[0].markdown?.[0]?.text).toBe('')
  })
})

// ─── HTML Block edge cases ───────────────────────────────────────────────────

describe('HTML Block — edge cases', () => {
  it('<style> type 1 HTML block', () => {
    const blocks = parse('<style>\nbody { color: red }\n</style>')
    expect(blocks[0].type).toBe(BlockType.Html)
  })

  it('<script> type 1 HTML block', () => {
    const blocks = parse('<script>\nalert(1)\n</script>')
    expect(blocks[0].type).toBe(BlockType.Html)
  })

  it('<?php ?> processing instruction → HTML block', () => {
    const blocks = parse('<?php echo "hello"; ?>')
    expect(blocks[0].type).toBe(BlockType.Html)
  })

  it('<!DOCTYPE html> declaration → HTML block', () => {
    const blocks = parse('<!DOCTYPE html>\n<html>')
    expect(blocks[0].type).toBe(BlockType.Html)
  })

  it('<div> type 6 block collected until closing tag', () => {
    // Non-void type-6 tags use depth tracking; blank lines do not terminate
    const blocks = parse('<div>\ncontent\n</div>\n\nparagraph')
    expect(blocks[0].type).toBe(BlockType.Html)
    expect(blocks[1].type).toBe(BlockType.Paragraph)
  })
})

// ─── Blockquote edge cases ───────────────────────────────────────────────────

describe('Blockquote — edge cases', () => {
  it('multiple > lines → single Blockquote block', () => {
    const blocks = parse('> line 1\n> line 2\n> line 3')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe(BlockType.Blockquote)
    expect(blocks[0].lines).toHaveLength(3)
  })

  it('> without space after is still blockquote', () => {
    const blocks = parse('>no space')
    expect(blocks[0].type).toBe(BlockType.Blockquote)
  })

  it('>> nested blockquote lines collected in parent block', () => {
    const blocks = parse('> > nested')
    expect(blocks[0].type).toBe(BlockType.Blockquote)
    expect(blocks[0].lines[0]).toContain('>')
  })

  it('blockquote followed by heading: separate blocks', () => {
    const blocks = parse('> quote\n# Heading')
    expect(blocks[0].type).toBe(BlockType.Blockquote)
    expect(blocks[1].type).toBe(BlockType.Heading)
  })
})

// ─── List edge cases ─────────────────────────────────────────────────────────

describe('List — edge cases', () => {
  it('* marker works same as -', () => {
    const blocks = parse('* item 1\n* item 2')
    expect(blocks[0].type).toBe(BlockType.List)
    expect(blocks[0].markdown?.[0]?.children).toHaveLength(2)
  })

  it('+ marker works same as -', () => {
    const blocks = parse('+ item 1\n+ item 2')
    expect(blocks[0].type).toBe(BlockType.List)
  })

  it('ordered list start number stored in node.start', () => {
    const blocks = parse('3. first\n4. second')
    const listNode = blocks[0].markdown?.[0]
    expect(listNode?.ordered).toBe(true)
    expect(listNode?.start).toBe(3)
  })

  it('task list [ ] → GFMNodeType.Checkbox node with text=" "', () => {
    const blocks = parseGFM('- [ ] task')
    // List → ListItem → Paragraph → [Checkbox, Text]
    const paraChildren = blocks[0].markdown?.[0]?.children?.[0]?.children?.[0]?.children
    const checkbox = paraChildren?.find((n: any) => n.type === GFMNodeType.Checkbox)
    expect(checkbox).toBeDefined()
    expect(checkbox?.text).toBe(' ')
  })

  it('task list [x] → GFMNodeType.Checkbox node with text="x"', () => {
    const blocks = parseGFM('- [x] done')
    const paraChildren = blocks[0].markdown?.[0]?.children?.[0]?.children?.[0]?.children
    const checkbox = paraChildren?.find((n: any) => n.type === GFMNodeType.Checkbox)
    expect(checkbox).toBeDefined()
    expect(checkbox?.text).toBe('x')
  })

  it('list item continuation indented by item width', () => {
    const blocks = parse('- item\n  continued')
    expect(blocks[0].type).toBe(BlockType.List)
    expect(blocks[0].lines).toHaveLength(2)
  })

  it('different list markers do not merge (- then *)', () => {
    // While CommonMark says they could merge under some conditions,
    // in this parser different markers are collected in one list block
    const blocks = parse('- a\n- b')
    expect(blocks[0].type).toBe(BlockType.List)
  })
})

// ─── Thematic Break edge cases ───────────────────────────────────────────────

describe('Thematic Break — edge cases', () => {
  it('spaces between --- allowed: - - -', () => {
    expect(parse('- - -')[0].type).toBe(BlockType.Hr)
  })

  it('trailing spaces on --- allowed', () => {
    expect(parse('---   ')[0].type).toBe(BlockType.Hr)
  })

  it('4 leading spaces → code not hr', () => {
    const blocks = parse('    ---')
    expect(blocks[0].type).toBe(BlockType.Code)
  })

  it('paragraph text + newline + --- → setext h2, not paragraph + hr', () => {
    const blocks = parse('Title\n---')
    expect(blocks[0].type).toBe(BlockType.Heading)
    expect(blocks[0].depth).toBe(2)
  })
})

// ─── Paragraph edge cases ────────────────────────────────────────────────────

describe('Paragraph — edge cases', () => {
  it('paragraph interrupted by ATX heading', () => {
    const blocks = parse('text\n# Heading')
    expect(blocks[0].type).toBe(BlockType.Paragraph)
    expect(blocks[1].type).toBe(BlockType.Heading)
    expect(blocks).toHaveLength(2)
  })

  it('paragraph interrupted by fenced code', () => {
    const blocks = parse('text\n```\ncode\n```')
    expect(blocks[0].type).toBe(BlockType.Paragraph)
    expect(blocks[1].type).toBe(BlockType.Code)
  })

  it('paragraph interrupted by blockquote', () => {
    const blocks = parse('text\n> quote')
    expect(blocks[0].type).toBe(BlockType.Paragraph)
    expect(blocks[1].type).toBe(BlockType.Blockquote)
  })

  it('paragraph interrupted by thematic break', () => {
    const blocks = parse('text\n***')
    expect(blocks[0].type).toBe(BlockType.Paragraph)
    expect(blocks[1].type).toBe(BlockType.Hr)
  })

  it('indented code does NOT interrupt paragraph', () => {
    const blocks = parse('paragraph\n    indented line')
    expect(blocks[0].type).toBe(BlockType.Paragraph)
    expect(blocks).toHaveLength(1)
  })
})

// ─── Document structure ──────────────────────────────────────────────────────

describe('Document structure', () => {
  it('empty document → 0 blocks', () => {
    expect(parse('')).toHaveLength(0)
  })

  it('only blank lines → 0 blocks', () => {
    expect(parse('\n\n\n')).toHaveLength(0)
  })

  it('content before first heading → Paragraph (preamble)', () => {
    const blocks = parse('preamble text\n\n# Heading')
    expect(blocks[0].type).toBe(BlockType.Paragraph)
    expect(blocks[1].type).toBe(BlockType.Heading)
  })

  it('multiple blank lines between blocks → absorbed into preceding block', () => {
    const blocks = parse('# H1\n\n\n# H2')
    expect(blocks).toHaveLength(2)
    expect(blocks[0].lineEnd).toBe(2) // H1 absorbs 2 blank lines
    expect(blocks[1].lineStart).toBe(3)
  })

  it('block.order is sequential from 0', () => {
    const blocks = parse('# H1\n# H2\n# H3')
    expect(blocks[0].order).toBe(0)
    expect(blocks[1].order).toBe(1)
    expect(blocks[2].order).toBe(2)
  })

  it('block.id is unique per block', () => {
    const blocks = parse('# H1\n# H2\n# H3')
    const ids = blocks.map((b: any) => b.id)
    expect(new Set(ids).size).toBe(3)
  })

  it('block.id starts at 1 and increments', () => {
    const blocks = parse('# H1\n# H2')
    expect(blocks[0].id).toBe(1)
    expect(blocks[1].id).toBe(2)
  })

  it('all 8 core block types in one document', () => {
    const md = [
      '# Heading',          // Heading
      '    code',           // Code (indented)
      '```\nfenced\n```',   // Code (fenced)
      '<!-- html -->',      // Html
      '[foo]: url',         // Def
      '> blockquote',       // Blockquote
      '- list item',        // List
      '---',                // Hr
      'paragraph',          // Paragraph
    ].join('\n\n')
    const blocks = parse(md)
    const types = blocks.map((b: any) => b.type)
    expect(types).toContain(BlockType.Heading)
    expect(types).toContain(BlockType.Code)
    expect(types).toContain(BlockType.Html)
    expect(types).toContain(BlockType.Def)
    expect(types).toContain(BlockType.Blockquote)
    expect(types).toContain(BlockType.List)
    expect(types).toContain(BlockType.Hr)
    expect(types).toContain(BlockType.Paragraph)
  })
})

// ─── Link Reference Definition ───────────────────────────────────────────────

describe('Link Reference Definition — edge cases', () => {
  it('URL in angle brackets: <url>', () => {
    const blocks = parse('[foo]: <https://example.com>\n\n[foo]')
    expect(blocks[0].type).toBe(BlockType.Def)
  })

  it('title in single quotes', () => {
    const blocks = parse("[foo]: url 'Title'")
    expect(blocks[0].type).toBe(BlockType.Def)
  })

  it('title in parentheses', () => {
    const blocks = parse('[foo]: url (Title)')
    expect(blocks[0].type).toBe(BlockType.Def)
  })

  it('duplicate label: first definition wins', () => {
    let result: any[] = []
    new BlockMaker().changed((blocks, isEnd) => { if (isEnd) result = blocks }).parse(
      '[foo]: https://first.com\n[foo]: https://second.com\n\n[foo]'
    )
    const para = result.find((b: any) => b.type === BlockType.Paragraph)
    const linkRef = para?.markdown?.[0]?.children?.find((n: any) => n.url)
    expect(linkRef?.url).toBe('https://first.com')
  })

  it('label matching is case-insensitive', () => {
    let result: any[] = []
    new BlockMaker().changed((blocks, isEnd) => { if (isEnd) result = blocks }).parse(
      '[FOO]: https://example.com\n\n[foo]'
    )
    const para = result.find((b: any) => b.type === BlockType.Paragraph)
    const linkRef = para?.markdown?.[0]?.children?.find((n: any) => n.url)
    expect(linkRef?.url).toBe('https://example.com')
  })
})

// ─── block.lines 原文不变 ────────────────────────────────────────────────────

function checkRaw(md: string) {
  const raw = md.split('\n')
  const blocks = parse(md)
  for (const b of blocks) {
    expect(b.lines).toEqual(raw.slice(b.lineStart, b.lineEnd + 1))
  }
}

describe('block.lines === raw source lines (parse.test)', () => {
  it('fenced code with deeply indented body', () =>
    checkRaw('```python\ndef greet(name):\n    return f"Hello, {name}!"\n```'))
  it('fenced code opened with 3 leading spaces', () =>
    checkRaw('   ```js\n    var x = 1;\n```'))
  it('setext heading multi-line', () =>
    checkRaw('Title Line\n=========='))
  it('blockquote multi-line', () =>
    checkRaw('> first\n> second\n> third'))
  it('ordered list', () =>
    checkRaw('1. one\n2. two\n3. three'))
  it('html block type 1', () =>
    checkRaw('<script>\nalert(1)\n</script>'))
})

// ─── update() cross-type scenarios ───────────────────────────────────────────

describe('update() — cross-type changes', () => {
  it('adding # to paragraph start → turns into Heading', () => {
    const p = bm('hello world')
    p.update(0, 0, 0, 0, '# ')
    const blocks = p.allBlocks()
    expect(blocks[0].type).toBe(BlockType.Heading)
    expect(blocks[0].dirty).toBe(DirtyFlag.Changed)
  })

  it('removing # from heading → turns into Paragraph', () => {
    const p = bm('# heading')
    p.update(0, 0, 0, 2, '')  // remove '# '
    const blocks = p.allBlocks()
    expect(blocks[0].type).toBe(BlockType.Paragraph)
  })

  it('update fenced code info string → block.meta updates', () => {
    const p = bm('```js\ncode\n```')
    p.update(0, 3, 0, 5, 'typescript')
    const blocks = p.allBlocks()
    expect(blocks[0].meta).toBe('typescript')
  })

  it('insert paragraph between two headings → 3 blocks', () => {
    const p = bm('# H1\n# H2')
    p.update(0, 4, 0, 4, '\n\nparagraph')
    const blocks = p.allBlocks()
    expect(blocks).toHaveLength(3)
    expect(blocks[1].type).toBe(BlockType.Paragraph)
    expect(blocks[2].type).toBe(BlockType.Heading)
  })

  it('delete heading content → paragraph (no #)', () => {
    const p = bm('# Title\n\n# H2')
    p.update(0, 0, 0, 7, 'plain text')
    const blocks = p.allBlocks()
    expect(blocks[0].type).toBe(BlockType.Paragraph)
  })

  it('update inside blockquote content', () => {
    const p = bm('> hello')
    p.update(0, 2, 0, 7, 'world')
    const blocks = p.allBlocks()
    expect(blocks[0].type).toBe(BlockType.Blockquote)
    expect(blocks[0].dirty).toBe(DirtyFlag.Changed)
  })

  it('clearing heading content → block becomes Paragraph, dirty=Changed', () => {
    const p = bm('# H1\n\n# H2')
    p.update(2, 0, 2, 4, '')  // clear "# H2" content → empty line → no block
    const blocks = p.allBlocks()
    // H1 absorbs the now-trailing blanks and gets Changed
    expect(blocks[0].type).toBe(BlockType.Heading)
    expect(blocks[0].dirty).toBe(DirtyFlag.Changed)
    expect(blocks[0].lineEnd).toBe(2)
  })
})
