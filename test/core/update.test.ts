import { describe, it, expect } from 'vitest'
import { BlockMaker } from '../../src/core/BlockMaker'
import { BlockType, DirtyFlag } from '../../src/core/types'

function makeBm(md: string) {
  const bm = new BlockMaker()
  bm.parse(md)
  return bm
}

describe('update()', () => {
  it('updates a single line in place', () => {
    const bm = makeBm('# Hello\n\nParagraph')
    bm.update(0, 2, 0, 7, 'World')  // replace "Hello" in "# Hello"
    const blocks = bm.allBlocks()
    const heading = blocks.find(b => b.type === BlockType.Heading)
    expect(heading?.lines[0]).toContain('World')
  })

  it('dirty flag set to Changed on edited block', () => {
    const bm = makeBm('# Hello\n\nParagraph')
    let dirtyBlocks: any[] = []
    bm.changed((blocks) => { dirtyBlocks = blocks })
    bm.update(0, 2, 0, 7, 'World')
    const changed = dirtyBlocks.find(b => b.dirty === DirtyFlag.Changed)
    expect(changed).toBeDefined()
  })

  it('inserts a new line', () => {
    const bm = makeBm('# Heading\n\nPara1')
    bm.update(4, 0, 4, 0, 'Para0\n\n')
    const blocks = bm.allBlocks()
    expect(blocks.some(b => b.type === BlockType.Paragraph)).toBe(true)
  })

  it('deletes content', () => {
    const bm = makeBm('# Title\n\nKeep this\n\nDelete this')
    const before = bm.allBlocks().length
    // Delete "Delete this" block lines
    const allLines = bm.allBlocks().flatMap(b => b.lines)
    const lastPara = bm.allBlocks().filter(b => b.type === BlockType.Paragraph).at(-1)
    if (lastPara) {
      bm.update(lastPara.lineStart, 0, lastPara.lineEnd, 999, '')
      const after = bm.allBlocks().length
      expect(after).toBeLessThanOrEqual(before)
    }
  })

  it('subsequent blocks get Shifted dirty flag on line shift', () => {
    const bm = makeBm('# H1\n\nPara1\n\nPara2')
    let dirtyBlocks: any[] = []
    bm.changed((blocks) => { dirtyBlocks = [...blocks] })
    // Insert a new line before Para1
    bm.update(2, 0, 2, 0, 'new line\n')
    const shifted = dirtyBlocks.find(b => b.dirty === DirtyFlag.Shifted)
    expect(shifted).toBeDefined()
  })

  it('allBlocks() returns updated list', () => {
    const bm = makeBm('# H1\n\nPara')
    const before = bm.allBlocks().length
    bm.parse('# H1\n\nPara\n\nNewPara')
    const after = bm.allBlocks().length
    expect(after).toBeGreaterThan(before)
  })

  it('findBlocks finds by line range', () => {
    const bm = makeBm('# Title\n\nParagraph')
    const found = bm.findBlocks(0, 0)
    expect(found.length).toBeGreaterThan(0)
    expect(found[0].type).toBe(BlockType.Heading)
  })
})
