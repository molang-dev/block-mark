import { describe, it, expect } from 'vitest'
import { BlockMaker } from '../../src/core/BlockMaker'
import { BlockType } from '../../src/core/types'
import { blockMakerHtml } from '../../src/plugins/html'

function parse(md: string) {
  const p = new BlockMaker()
  p.parse(md)
  return p.allBlocks()
}

function parseHtml(md: string) {
  const p = new BlockMaker().use(blockMakerHtml)
  p.parse(md)
  return p.allBlocks()
}

describe('TOC — recognition', () => {
  it('[toc] alone on a line → Toc block', () => {
    const blocks = parse('# H1\n\n[toc]\n\n## H2')
    expect(blocks.some(b => b.type === BlockType.Toc)).toBe(true)
  })

  it('[TOC] uppercase also recognized', () => {
    const blocks = parse('[TOC]\n\n# H1')
    expect(blocks[0].type).toBe(BlockType.Toc)
  })

  it('[Toc] mixed case recognized', () => {
    const blocks = parse('[Toc]\n\n# H1')
    expect(blocks[0].type).toBe(BlockType.Toc)
  })

  it('[toc] inline in paragraph — not a Toc block', () => {
    const blocks = parse('text [toc] text')
    expect(blocks.every(b => b.type !== BlockType.Toc)).toBe(true)
  })

  it('[toc] with leading spaces — not a Toc block', () => {
    const blocks = parse('  [toc]')
    expect(blocks.every(b => b.type !== BlockType.Toc)).toBe(true)
  })

  it('[toc] with trailing text — not a Toc block', () => {
    const blocks = parse('[toc] extra')
    expect(blocks.every(b => b.type !== BlockType.Toc)).toBe(true)
  })

  it('[toc] lines array starts with the [toc] line', () => {
    const blocks = parse('[toc]\n\n# H1')
    const toc = blocks.find(b => b.type === BlockType.Toc)!
    expect(toc.lines[0]).toBe('[toc]')
    expect(toc.lineStart).toBe(0)
  })
})

describe('TOC — position in document', () => {
  it('Toc block appears before headings when [toc] is first', () => {
    const blocks = parse('[toc]\n\n# H1\n\n## H2')
    expect(blocks[0].type).toBe(BlockType.Toc)
    expect(blocks[1].type).toBe(BlockType.Heading)
  })

  it('Toc block appears between headings at its document position', () => {
    const blocks = parse('# H1\n\n[toc]\n\n## H2')
    const idx = blocks.findIndex(b => b.type === BlockType.Toc)
    expect(idx).toBeGreaterThan(0)
    expect(blocks[idx - 1].type).toBe(BlockType.Heading)
    expect(blocks[idx + 1].type).toBe(BlockType.Heading)
  })

  it('Toc block at end of document', () => {
    const blocks = parse('# H1\n\n## H2\n\n[toc]')
    expect(blocks[blocks.length - 1].type).toBe(BlockType.Toc)
  })

  it('multiple [toc] blocks allowed', () => {
    const blocks = parse('[toc]\n\n# H1\n\n[toc]')
    const tocs = blocks.filter(b => b.type === BlockType.Toc)
    expect(tocs).toHaveLength(2)
  })

  it('Toc block has stable id (not 0)', () => {
    const blocks = parse('[toc]\n\n# H1')
    const toc = blocks.find(b => b.type === BlockType.Toc)!
    expect(toc.id).toBeGreaterThan(0)
  })

  it('Toc block lineStart is contiguous with surrounding blocks', () => {
    const blocks = parse('# H1\n\n[toc]\n\n## H2')
    const idx = blocks.findIndex(b => b.type === BlockType.Toc)
    const prev = blocks[idx - 1]
    const toc  = blocks[idx]
    const next = blocks[idx + 1]
    expect(toc.lineStart).toBe(prev.lineEnd + 1)
    expect(next.lineStart).toBe(toc.lineEnd + 1)
  })
})

describe('TOC — HTML rendering', () => {
  it('Toc block html is <nav>...</nav> containing heading links', () => {
    const blocks = parseHtml('# Hello\n\n[toc]')
    const toc = blocks.find(b => b.type === BlockType.Toc)!
    expect(toc.html).toMatch(/^<nav>/)
    expect(toc.html).toMatch(/<\/nav>$/)
    expect(toc.html).toContain('Hello')
  })

  it('heading html gets id attribute injected', () => {
    const blocks = parseHtml('# Title\n\n[toc]')
    const h = blocks.find(b => b.type === BlockType.Heading)!
    expect(h.html).toMatch(/id="bmd-h-\d+"/)
  })

  it('Toc html links use bmd-h-{id} hrefs', () => {
    const blocks = parseHtml('# Title\n\n[toc]')
    const h   = blocks.find(b => b.type === BlockType.Heading)!
    const toc = blocks.find(b => b.type === BlockType.Toc)!
    expect(toc.html).toContain(`href="#bmd-h-${h.id}"`)
  })

  it('no headings → Toc html is empty string', () => {
    const blocks = parseHtml('just text\n\n[toc]')
    const toc = blocks.find(b => b.type === BlockType.Toc)!
    expect(toc.html).toBe('')
  })

  it('without html plugin Toc html is undefined', () => {
    const blocks = parse('# H1\n\n[toc]')
    const toc = blocks.find(b => b.type === BlockType.Toc)!
    expect(toc.html).toBeUndefined()
  })

  it('multiple [toc] blocks all get the same nav html', () => {
    const blocks = parseHtml('[toc]\n\n# H1\n\n[toc]')
    const tocs = blocks.filter(b => b.type === BlockType.Toc)
    expect(tocs[0].html).toBe(tocs[1].html)
    expect(tocs[0].html).toContain('H1')
  })
})

describe('TOC — update()', () => {
  it('inserting [toc] mid-edit creates a Toc block', () => {
    const p = new BlockMaker().use(blockMakerHtml)
    p.parse('# H1\n\nparagraph')
    expect(p.allBlocks().some(b => b.type === BlockType.Toc)).toBe(false)

    p.update(2, 0, 2, 9, '[toc]')
    expect(p.allBlocks().some(b => b.type === BlockType.Toc)).toBe(true)
  })

  it('deleting [toc] line removes the Toc block', () => {
    const p = new BlockMaker().use(blockMakerHtml)
    p.parse('# H1\n\n[toc]')
    expect(p.allBlocks().some(b => b.type === BlockType.Toc)).toBe(true)

    p.update(2, 0, 2, 5, '')
    expect(p.allBlocks().some(b => b.type === BlockType.Toc)).toBe(false)
  })

  it('Toc html updates when a new heading is added', () => {
    const p = new BlockMaker().use(blockMakerHtml)
    p.parse('# H1\n\n[toc]')
    const before = p.allBlocks().find(b => b.type === BlockType.Toc)!.html

    p.update(2, 5, 2, 5, '\n\n## H2')
    const after = p.allBlocks().find(b => b.type === BlockType.Toc)!.html
    expect(after).toContain('H2')
    expect(after).not.toBe(before)
  })
})
