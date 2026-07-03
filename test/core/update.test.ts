import { describe, it, expect } from 'vitest'
import { BlockMaker } from '../../src/core/BlockMaker'
import { BlockType, NodeType, DirtyFlag, Block } from '../../src/core/types'

// ─── helpers ──────────────────────────────────────────────────────────────────

function bm(md: string, opts?: ConstructorParameters<typeof BlockMaker>[0]) {
  const p = new BlockMaker(opts)
  p.parse(md)
  return p
}

/** Type `text` character-by-character starting at (row, col). */
function typeAt(p: BlockMaker, row: number, col: number, text: string) {
  for (const ch of text) {
    p.update(row, col, row, col, ch)
    if (ch === '\n') { row++; col = 0 } else col++
  }
}

function headings(p: BlockMaker) {
  return p.allBlocks().filter(b => b.type === BlockType.Heading)
}

function paragraphs(p: BlockMaker) {
  return p.allBlocks().filter(b => b.type === BlockType.Paragraph)
}

// ─── 1. in-place edits ────────────────────────────────────────────────────────

describe('in-place edit — content', () => {
  it('"# Hello" rename to "# World": count=1, Heading, 0-0, id preserved, Changed', () => {
    const p = bm('# Hello')
    const id1 = p.allBlocks()[0].id
    p.update(0, 2, 0, 7, 'World')
    const bs = p.allBlocks()
    expect(bs.length).toBe(1)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(0)
    expect(bs[0].id).toBe(id1);       expect(bs[0].dirty).toBe(DirtyFlag.Changed)
    expect(bs[0].lines[0]).toBe('# World')
  })

  it('"# H1\\n\\nparagraph" edit paragraph: heading Clean lineEnd=1, paragraph Changed', () => {
    const p = bm('# H1\n\nparagraph')
    const [id1, id2] = p.allBlocks().map(b => b.id)
    p.update(2, 0, 2, 9, 'new text')
    const bs = p.allBlocks()
    expect(bs.length).toBe(2)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(1)   // absorbs blank
    expect(bs[0].id).toBe(id1);       expect(bs[0].dirty).toBe(DirtyFlag.Clean)
    expect(bs[1].type).toBe(BlockType.Paragraph)
    expect(bs[1].lineStart).toBe(2);  expect(bs[1].lineEnd).toBe(2)
    expect(bs[1].id).toBe(id2);       expect(bs[1].dirty).toBe(DirtyFlag.Changed)
    expect(bs[1].lines[0]).toBe('new text')
  })

  it('"# H1" replace heading text: count=1, still Heading depth=1, id preserved, Changed', () => {
    const p = bm('# H1')
    const id1 = p.allBlocks()[0].id
    p.update(0, 2, 0, 4, 'Replaced Heading')
    const bs = p.allBlocks()
    expect(bs.length).toBe(1)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(0)
    expect(bs[0].id).toBe(id1);       expect(bs[0].dirty).toBe(DirtyFlag.Changed)
    expect(bs[0].depth).toBe(1)
  })

  it('"# H1\\n\\n# H2" edit H2 content: H1 Clean+lineEnd=1, H2 Changed+2-2', () => {
    const p = bm('# H1\n\n# H2')
    const [id1, id2] = p.allBlocks().map(b => b.id)
    p.update(2, 2, 2, 4, 'Changed')
    const bs = p.allBlocks()
    expect(bs.length).toBe(2)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(1)
    expect(bs[0].id).toBe(id1);       expect(bs[0].dirty).toBe(DirtyFlag.Clean)
    expect(bs[1].type).toBe(BlockType.Heading)
    expect(bs[1].lineStart).toBe(2);  expect(bs[1].lineEnd).toBe(2)
    expect(bs[1].id).toBe(id2);       expect(bs[1].dirty).toBe(DirtyFlag.Changed)
    expect(bs[1].lines[0]).toBe('# Changed')
  })
})

// ─── 2. line insertion (lineDelta > 0) ───────────────────────────────────────

describe('line insertion — lineDelta > 0', () => {
  it('"# H1\\n# H2" insert \\n after H1: H1 Changed+absorbs blank(0-1), H2 Shifted(2-2)', () => {
    const p = bm('# H1\n# H2')
    const [id1, id2] = p.allBlocks().map(b => b.id)
    p.update(0, 4, 0, 4, '\n')
    const bs = p.allBlocks()
    expect(bs.length).toBe(2)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(1)
    expect(bs[0].id).toBe(id1);       expect(bs[0].dirty).toBe(DirtyFlag.Changed)
    expect(bs[1].type).toBe(BlockType.Heading)
    expect(bs[1].lineStart).toBe(2);  expect(bs[1].lineEnd).toBe(2)
    expect(bs[1].id).toBe(id2);       expect(bs[1].dirty).toBe(DirtyFlag.Shifted)
  })

  it('"# H1\\n# H2" insert \\n before H2 (row1=1,col=0): H1 Changed+absorbs blank(0-1), H2 Shifted(2-2)', () => {
    const p = bm('# H1\n# H2')
    const [id1, id2] = p.allBlocks().map(b => b.id)
    p.update(1, 0, 1, 0, '\n')
    const bs = p.allBlocks()
    expect(bs.length).toBe(2)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(1)
    expect(bs[0].id).toBe(id1);       expect(bs[0].dirty).toBe(DirtyFlag.Changed)
    expect(bs[1].type).toBe(BlockType.Heading)
    expect(bs[1].lineStart).toBe(2);  expect(bs[1].lineEnd).toBe(2)
    expect(bs[1].id).toBe(id2);       expect(bs[1].dirty).toBe(DirtyFlag.Shifted)
  })

  it('"# H1\\n# H2\\n# H3" insert \\n after H2: H1 Clean(0-0), H2 Changed+absorbs blank(1-2), H3 Shifted(3-3)', () => {
    const p = bm('# H1\n# H2\n# H3')
    const [id1, id2, id3] = p.allBlocks().map(b => b.id)
    p.update(1, 4, 1, 4, '\n')
    const bs = p.allBlocks()
    expect(bs.length).toBe(3)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(0)
    expect(bs[0].id).toBe(id1);       expect(bs[0].dirty).toBe(DirtyFlag.Clean)
    expect(bs[1].type).toBe(BlockType.Heading)
    expect(bs[1].lineStart).toBe(1);  expect(bs[1].lineEnd).toBe(2)
    expect(bs[1].id).toBe(id2);       expect(bs[1].dirty).toBe(DirtyFlag.Changed)
    expect(bs[2].type).toBe(BlockType.Heading)
    expect(bs[2].lineStart).toBe(3);  expect(bs[2].lineEnd).toBe(3)
    expect(bs[2].id).toBe(id3);       expect(bs[2].dirty).toBe(DirtyFlag.Shifted)
  })

  it('"# H1\\n# H2" insert "# HNew\\n" before H2: 3 Headings, HNew reuses id2, H2 gets fresh id', () => {
    const p = bm('# H1\n# H2')
    const [id1, id2] = p.allBlocks().map(b => b.id)
    p.update(1, 0, 1, 0, '# HNew\n')
    const bs = p.allBlocks()
    expect(bs.length).toBe(3)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);   expect(bs[0].lineEnd).toBe(0)
    expect(bs[0].id).toBe(id1);        expect(bs[0].dirty).toBe(DirtyFlag.Clean)
    expect(bs[1].type).toBe(BlockType.Heading)
    expect(bs[1].lineStart).toBe(1);   expect(bs[1].lineEnd).toBe(1)
    expect(bs[1].id).toBe(id2);        expect(bs[1].dirty).toBe(DirtyFlag.Changed)   // HNew reused H2's id
    expect(bs[1].lines[0]).toBe('# HNew')
    expect(bs[2].type).toBe(BlockType.Heading)
    expect(bs[2].lineStart).toBe(2);   expect(bs[2].lineEnd).toBe(2)
    expect(bs[2].id).toBeGreaterThan(id2)
    expect(bs[2].dirty).toBe(DirtyFlag.Changed)
    expect(bs[2].lines[0]).toBe('# H2')
  })
})

// ─── 3. line deletion (lineDelta < 0) ────────────────────────────────────────

describe('line deletion — lineDelta < 0', () => {
  it('"# H1\\n# H2\\n# H3" delete H2: 2 blocks, H3 content moves to id2, original id3 gone', () => {
    const p = bm('# H1\n# H2\n# H3')
    const [id1, id2, id3] = p.allBlocks().map(b => b.id)
    p.update(1, 0, 2, 0, '')
    const bs = p.allBlocks()
    expect(bs.length).toBe(2)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(0)
    expect(bs[0].id).toBe(id1);       expect(bs[0].dirty).toBe(DirtyFlag.Clean)
    expect(bs[1].type).toBe(BlockType.Heading)
    expect(bs[1].lineStart).toBe(1);  expect(bs[1].lineEnd).toBe(1)
    expect(bs[1].id).toBe(id2);       expect(bs[1].dirty).toBe(DirtyFlag.Changed)
    expect(bs[1].lines[0]).toBe('# H3')            // H3 content at H2's old id
    expect(bs.every(b => b.id !== id3)).toBe(true)  // H3's original id deleted
  })

  it('"# H1\\n\\nparagraph" delete paragraph: heading absorbs trailing blanks(lineEnd=2), Changed', () => {
    const p = bm('# H1\n\nparagraph')
    const [id1, id2] = p.allBlocks().map(b => b.id)
    p.update(2, 0, 2, 9, '')
    const bs = p.allBlocks()
    expect(bs.length).toBe(1)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(2)   // absorbs trailing blanks
    expect(bs[0].id).toBe(id1);       expect(bs[0].dirty).toBe(DirtyFlag.Changed)
    expect(bs.every(b => b.id !== id2)).toBe(true)
  })

  it('"# H1\\n# H2\\n# H3" delete all → 0 blocks', () => {
    const p = bm('# H1\n# H2\n# H3')
    p.update(0, 0, 2, 4, '')
    expect(p.allBlocks().length).toBe(0)
  })
})

// ─── 4. append after last block ──────────────────────────────────────────────

describe('append after all blocks', () => {
  it('"# H1\\n## H2" append "\\n### H3": 3 Headings, H1 Clean(0-0), H2 Shifted(1-1), H3 new Changed(2-2)', () => {
    const p = bm('# H1\n## H2')
    const [id1, id2] = p.allBlocks().map(b => b.id)
    p.update(1, 5, 1, 5, '\n### H3')
    const bs = p.allBlocks()
    expect(bs.length).toBe(3)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(0)
    expect(bs[0].id).toBe(id1);       expect(bs[0].dirty).toBe(DirtyFlag.Clean)
    expect(bs[1].type).toBe(BlockType.Heading)
    expect(bs[1].lineStart).toBe(1);  expect(bs[1].lineEnd).toBe(1)
    expect(bs[1].id).toBe(id2);       expect(bs[1].dirty).toBe(DirtyFlag.Shifted)
    expect(bs[2].type).toBe(BlockType.Heading)
    expect(bs[2].lineStart).toBe(2);  expect(bs[2].lineEnd).toBe(2)
    expect(bs[2].id).toBeGreaterThan(id2)
    expect(bs[2].dirty).toBe(DirtyFlag.Changed)
    expect(bs[2].lines[0]).toBe('### H3')
  })

  it('"# H1" append "\\n\\nparagraph text": Heading absorbs blank(0-1) Changed, Paragraph at 2-2 Changed', () => {
    const p = bm('# H1')
    const id1 = p.allBlocks()[0].id
    p.update(0, 4, 0, 4, '\n\nparagraph text')
    const bs = p.allBlocks()
    expect(bs.length).toBe(2)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(1)
    expect(bs[0].id).toBe(id1);       expect(bs[0].dirty).toBe(DirtyFlag.Changed)
    expect(bs[1].type).toBe(BlockType.Paragraph)
    expect(bs[1].lineStart).toBe(2);  expect(bs[1].lineEnd).toBe(2)
    expect(bs[1].id).toBeGreaterThan(id1)
    expect(bs[1].dirty).toBe(DirtyFlag.Changed)
    expect(bs[1].lines[0]).toBe('paragraph text')
  })

  it('"# H1\\n## H2" char-by-char append "### H3": 3 Headings at 0-0, 1-1, 2-2', () => {
    const p = bm('# H1\n## H2')
    const [id1, id2] = p.allBlocks().map(b => b.id)
    p.update(1, 5, 1, 5, '\n')
    typeAt(p, 2, 0, '### H3')
    const bs = p.allBlocks()
    expect(bs.length).toBe(3)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(0)
    expect(bs[0].id).toBe(id1);       expect(bs[0].dirty).toBe(DirtyFlag.Clean)
    expect(bs[1].type).toBe(BlockType.Heading)
    expect(bs[1].lineStart).toBe(1);  expect(bs[1].lineEnd).toBe(1)
    expect(bs[1].id).toBe(id2);       expect(bs[1].dirty).toBe(DirtyFlag.Clean)  // last update only re-parsed H3
    expect(bs[2].type).toBe(BlockType.Heading)
    expect(bs[2].lineStart).toBe(2);  expect(bs[2].lineEnd).toBe(2)
    expect(bs[2].dirty).toBe(DirtyFlag.Changed)
    expect(bs[2].lines[0]).toBe('### H3')
  })

  it('"# H1\\n## H2" append then type: H1 id stable, all blocks lineEnd = lineStart + lines.length - 1', () => {
    const p = bm('# H1\n## H2')
    const id1 = p.allBlocks()[0].id
    p.update(1, 5, 1, 5, '\n')
    typeAt(p, 2, 0, '### H3')
    const bs = p.allBlocks()
    expect(p.allBlocks().find(b => b.id === id1)?.lines[0]).toBe('# H1')
    for (const bl of bs) expect(bl.lineEnd).toBe(bl.lineStart + bl.lines.length - 1)
  })
})

// ─── 5. blank line editing ────────────────────────────────────────────────────

describe('blank line editing — blank absorbed into preceding block', () => {
  it('"# H1\\n# H2\\n## H3" add blank after H2, type "## HNew" on blank line → 4 Headings', () => {
    const p = bm('# H1\n# H2\n## H3')
    const [id1, id2, id3] = p.allBlocks().map(b => b.id)
    p.update(1, 4, 1, 4, '\n')          // blank absorbed into H2 → H2 lineEnd=2
    typeAt(p, 2, 0, '## HNew')          // line 2 is inside H2's range; splits it
    const bs = p.allBlocks()
    expect(bs.length).toBe(4)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(0)
    expect(bs[0].id).toBe(id1);       expect(bs[0].dirty).toBe(DirtyFlag.Clean)
    expect(bs[1].type).toBe(BlockType.Heading)
    expect(bs[1].lineStart).toBe(1);  expect(bs[1].lineEnd).toBe(1)
    expect(bs[1].id).toBe(id2);       expect(bs[1].dirty).toBe(DirtyFlag.Clean)  // last update only re-parsed line 2
    expect(bs[1].lines[0]).toBe('# H2')
    expect(bs[2].type).toBe(BlockType.Heading)
    expect(bs[2].lineStart).toBe(2);  expect(bs[2].lineEnd).toBe(2)
    expect(bs[2].dirty).toBe(DirtyFlag.Changed)
    expect(bs[2].lines[0]).toBe('## HNew')
    expect(bs[3].type).toBe(BlockType.Heading)
    expect(bs[3].lineStart).toBe(3);  expect(bs[3].lineEnd).toBe(3)
    expect(bs[3].id).toBe(id3);       expect(bs[3].dirty).toBe(DirtyFlag.Clean)  // last update only re-parsed line 2
  })

  it('"# H1\\n# H2\\n## H3" blank-insert + type: H1 stays Clean at 0-0 throughout', () => {
    const p = bm('# H1\n# H2\n## H3')
    const id1 = p.allBlocks()[0].id
    p.update(1, 4, 1, 4, '\n')
    typeAt(p, 2, 0, '## HNew')
    const h1 = p.allBlocks().find(b => b.id === id1)!
    expect(h1.type).toBe(BlockType.Heading)
    expect(h1.lineStart).toBe(0);     expect(h1.lineEnd).toBe(0)
    expect(h1.dirty).toBe(DirtyFlag.Clean)
  })

  it('each char update: lineEnd === lineStart + lines.length - 1 holds for every block', () => {
    const p = bm('# H1\n# H2\n## H3')
    p.update(1, 4, 1, 4, '\n')
    for (let col = 0; col < '## HNew'.length; col++) {
      p.update(2, col, 2, col, '## HNew'[col])
      for (const bl of p.allBlocks()) {
        expect(bl.lineEnd).toBe(bl.lineStart + bl.lines.length - 1)
      }
    }
  })

  it('"# H1\\n# H2" insert \\n after H1, type "# HMid": order H1,HMid,H2 at lines 0,1,2', () => {
    const p = bm('# H1\n# H2')
    const [id1, id2] = p.allBlocks().map(b => b.id)
    p.update(0, 4, 0, 4, '\n')        // blank absorbed into H1 → H1 lineEnd=1; H2 Shifted to 2-2
    typeAt(p, 1, 0, '# HMid')         // line 1 is inside H1's range; splits H1
    const bs = p.allBlocks()
    expect(bs.length).toBe(3)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(0)
    expect(bs[0].id).toBe(id1);       expect(bs[0].dirty).toBe(DirtyFlag.Clean)  // last update only re-parsed line 1
    expect(bs[0].lines[0]).toBe('# H1')
    expect(bs[1].type).toBe(BlockType.Heading)
    expect(bs[1].lineStart).toBe(1);  expect(bs[1].lineEnd).toBe(1)
    expect(bs[1].dirty).toBe(DirtyFlag.Changed)
    expect(bs[1].lines[0]).toBe('# HMid')
    expect(bs[2].type).toBe(BlockType.Heading)
    expect(bs[2].lineStart).toBe(2);  expect(bs[2].lineEnd).toBe(2)
    expect(bs[2].id).toBe(id2);       expect(bs[2].dirty).toBe(DirtyFlag.Clean)  // last update only re-parsed line 1
    expect(bs[2].lines[0]).toBe('# H2')
  })
})

// ─── 6. character-by-character ────────────────────────────────────────────────

describe('character-by-character update', () => {
  it('type "# hello world" from empty: 1 Heading at 0-0, Changed', () => {
    const p = new BlockMaker()
    p.parse('')
    typeAt(p, 0, 0, '# hello world')
    const bs = p.allBlocks()
    expect(bs.length).toBe(1)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(0)
    expect(bs[0].dirty).toBe(DirtyFlag.Changed)
    expect(bs[0].lines[0]).toBe('# hello world')
  })

  it('type "# H1\\n# H2\\n# H3" char-by-char: 3 Headings at lines 0,1,2 all Changed', () => {
    const p = new BlockMaker()
    p.parse('')
    typeAt(p, 0, 0, '# H1\n# H2\n# H3')
    const bs = p.allBlocks()
    expect(bs.length).toBe(3)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(0)
    expect(bs[0].dirty).toBe(DirtyFlag.Clean)   // only last update's block is Changed
    expect(bs[1].type).toBe(BlockType.Heading)
    expect(bs[1].lineStart).toBe(1);  expect(bs[1].lineEnd).toBe(1)
    expect(bs[1].dirty).toBe(DirtyFlag.Clean)
    expect(bs[2].type).toBe(BlockType.Heading)
    expect(bs[2].lineStart).toBe(2);  expect(bs[2].lineEnd).toBe(2)
    expect(bs[2].dirty).toBe(DirtyFlag.Changed)
  })

  it('type "# H1\\n\\nparagraph": heading absorbs blank(lineEnd=1), paragraph at 2-2', () => {
    const p = new BlockMaker()
    p.parse('')
    const mismatches: string[] = []
    p.changed((_changed, isEnd) => {
      if (!isEnd) return
      const all = p.allBlocks()
      for (const bl of all) {
        if (bl.id !== 0 && bl.order !== all.indexOf(bl)) {
          mismatches.push(`id:${bl.id} order mismatch`)
        }
      }
    })
    typeAt(p, 0, 0, '# H1\n\nparagraph')
    expect(mismatches).toHaveLength(0)
    const bs = p.allBlocks()
    expect(bs.length).toBe(2)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(1)
    expect(bs[0].dirty).toBe(DirtyFlag.Clean)   // last update only re-parsed paragraph
    expect(bs[1].type).toBe(BlockType.Paragraph)
    expect(bs[1].lineStart).toBe(2);  expect(bs[1].lineEnd).toBe(2)
    expect(bs[1].dirty).toBe(DirtyFlag.Changed)
  })

  it('type 5 headings: final 5 Headings at lines 0-4, each 0-length line range', () => {
    const p = new BlockMaker()
    p.parse('')
    typeAt(p, 0, 0, '# H1\n# H2\n# H3\n# H4\n# H5')
    const bs = p.allBlocks()
    expect(bs.length).toBe(5)
    for (let i = 0; i < 5; i++) {
      expect(bs[i].type).toBe(BlockType.Heading)
      expect(bs[i].lineStart).toBe(i)
      expect(bs[i].lineEnd).toBe(i)
    }
    // only the last update's block (H5) is Changed; others are Clean
    expect(bs[4].dirty).toBe(DirtyFlag.Changed)
    expect(bs[0].dirty).toBe(DirtyFlag.Clean)
  })

  it('each char update: lineEnd = lineStart + lines.length - 1 holds throughout', () => {
    const p = bm('# H1\n## H2')
    for (const ch of '\n### H3') {
      if (ch === '\n') p.update(1, 5, 1, 5, ch)
      else {
        const last = p.allBlocks().at(-1)!
        const row = last.lineEnd
        const col = last.lines.at(-1)!.length
        p.update(row, col, row, col, ch)
      }
      for (const bl of p.allBlocks()) {
        expect(bl.lineEnd).toBe(bl.lineStart + bl.lines.length - 1)
      }
    }
  })
})

// ─── 7. batchSizes — update() emits batches ──────────────────────────────────

describe('batchSizes [1,2,3] — update() dirty batch emission', () => {
  it('update 10 headings at once → changed batch sizes are [1,2,3,3,1]', () => {
    const p = bm('# placeholder', { batchSizes: [1, 2, 3] })
    const sizes: number[] = []
    p.changed((blocks) => { sizes.push(blocks.length) })
    p.update(0, 0, 0, 13, '# H1\n# H2\n# H3\n# H4\n# H5\n# H6\n# H7\n# H8\n# H9\n# H10')
    expect(sizes).toEqual([1, 2, 3, 3, 1])
  })

  it('update 10 headings → last changed call has isEnd=true', () => {
    const p = bm('# placeholder', { batchSizes: [1, 2, 3] })
    let lastIsEnd = false
    p.changed((_blocks, isEnd) => { lastIsEnd = isEnd })
    p.update(0, 0, 0, 13, '# H1\n# H2\n# H3\n# H4\n# H5\n# H6\n# H7\n# H8\n# H9\n# H10')
    expect(lastIsEnd).toBe(true)
  })

  it('update 10 headings → only last changed call has isEnd=true', () => {
    const p = bm('# placeholder', { batchSizes: [1, 2, 3] })
    const endFlags: boolean[] = []
    p.changed((_blocks, isEnd) => { endFlags.push(isEnd) })
    p.update(0, 0, 0, 13, '# H1\n# H2\n# H3\n# H4\n# H5\n# H6\n# H7\n# H8\n# H9\n# H10')
    expect(endFlags.filter(Boolean).length).toBe(1)
    expect(endFlags.at(-1)).toBe(true)
  })

  it('update 7 dirty blocks with batchSizes [2] → sizes [2,2,2,1]', () => {
    const p = bm('# placeholder', { batchSizes: [2] })
    const sizes: number[] = []
    p.changed(blocks => { sizes.push(blocks.length) })
    p.update(0, 0, 0, 13, '# H1\n# H2\n# H3\n# H4\n# H5\n# H6\n# H7')
    expect(sizes).toEqual([2, 2, 2, 1])
  })

  it('single-char update (1 dirty block) with batchSizes [1,2,3] → exactly 1 changed call', () => {
    const p = bm('# Hello', { batchSizes: [1, 2, 3] })
    let calls = 0
    p.changed(() => { calls++ })
    p.update(0, 2, 0, 7, 'World')
    expect(calls).toBe(1)
  })

  it('identical-content update → changed fires with isEnd=true', () => {
    const p = bm('# H1', { batchSizes: [1, 2, 3] })
    let lastIsEnd = false
    p.changed((_b, isEnd) => { lastIsEnd = isEnd })
    p.update(0, 2, 0, 4, 'H1')   // same text → block re-processed as Changed
    expect(lastIsEnd).toBe(true)
  })

  it('all batches together contain every dirty block id', () => {
    const p = bm('# placeholder', { batchSizes: [1, 2, 3] })
    const allReceived: number[] = []
    p.changed(blocks => { allReceived.push(...blocks.map(b => b.id)) })
    p.update(0, 0, 0, 13, '# H1\n# H2\n# H3\n# H4\n# H5\n# H6\n# H7\n# H8\n# H9\n# H10')
    const finalIds = headings(p).map(b => b.id)
    expect(allReceived.sort()).toEqual(finalIds.sort())
  })

  it('default batchSizes: update 3 headings → single changed call', () => {
    const p = bm('# placeholder')
    const sizes: number[] = []
    p.changed(blocks => { sizes.push(blocks.length) })
    p.update(0, 0, 0, 13, '# H1\n# H2\n# H3')
    expect(sizes).toEqual([3])
  })
})

// ─── 8. block id stability ────────────────────────────────────────────────────

describe('block id stability across updates', () => {
  it('"# H1\\n# H2\\n# H3" edit H2 content: H1 and H3 ids unchanged, H2 Changed at 1-1', () => {
    const p = bm('# H1\n# H2\n# H3')
    const [id1, id2, id3] = p.allBlocks().map(b => b.id)
    p.update(1, 2, 1, 4, 'Changed')
    const bs = p.allBlocks()
    expect(bs.length).toBe(3)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(0)
    expect(bs[0].id).toBe(id1);       expect(bs[0].dirty).toBe(DirtyFlag.Clean)
    expect(bs[1].type).toBe(BlockType.Heading)
    expect(bs[1].lineStart).toBe(1);  expect(bs[1].lineEnd).toBe(1)
    expect(bs[1].id).toBe(id2);       expect(bs[1].dirty).toBe(DirtyFlag.Changed)
    expect(bs[2].type).toBe(BlockType.Heading)
    expect(bs[2].lineStart).toBe(2);  expect(bs[2].lineEnd).toBe(2)
    expect(bs[2].id).toBe(id3);       expect(bs[2].dirty).toBe(DirtyFlag.Clean)
  })

  it('"# H1\\n# H2\\n# H3" insert \\n after H2: H2 Changed(1-2), H3 Shifted to 3-3, id3 preserved', () => {
    const p = bm('# H1\n# H2\n# H3')
    const [id1, id2, id3] = p.allBlocks().map(b => b.id)
    p.update(1, 4, 1, 4, '\n')
    const bs = p.allBlocks()
    expect(bs.length).toBe(3)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(0)
    expect(bs[0].id).toBe(id1);       expect(bs[0].dirty).toBe(DirtyFlag.Clean)
    expect(bs[1].type).toBe(BlockType.Heading)
    expect(bs[1].lineStart).toBe(1);  expect(bs[1].lineEnd).toBe(2)
    expect(bs[1].id).toBe(id2);       expect(bs[1].dirty).toBe(DirtyFlag.Changed)
    expect(bs[2].type).toBe(BlockType.Heading)
    expect(bs[2].lineStart).toBe(3);  expect(bs[2].lineEnd).toBe(3)
    expect(bs[2].id).toBe(id3);       expect(bs[2].dirty).toBe(DirtyFlag.Shifted)
  })

  it('"# H1\\n## H2" append "\\n# H3": H1 Clean, H2 Shifted, H3 fresh id > H2', () => {
    const p = bm('# H1\n## H2')
    const [id1, id2] = p.allBlocks().map(b => b.id)
    p.update(1, 5, 1, 5, '\n# H3')
    const bs = p.allBlocks()
    expect(bs.length).toBe(3)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(0)
    expect(bs[0].id).toBe(id1);       expect(bs[0].dirty).toBe(DirtyFlag.Clean)
    expect(bs[1].type).toBe(BlockType.Heading)
    expect(bs[1].lineStart).toBe(1);  expect(bs[1].lineEnd).toBe(1)
    expect(bs[1].id).toBe(id2);       expect(bs[1].dirty).toBe(DirtyFlag.Shifted)
    expect(bs[2].type).toBe(BlockType.Heading)
    expect(bs[2].lineStart).toBe(2);  expect(bs[2].lineEnd).toBe(2)
    expect(bs[2].id).toBeGreaterThan(id2)
    expect(bs[2].dirty).toBe(DirtyFlag.Changed)
    expect(p.allBlocks().find(b => b.id === id1)?.lines[0]).toBe('# H1')
  })
})

// ─── 9. dirty flags ───────────────────────────────────────────────────────────

describe('dirty flags per update', () => {
  it('"# H1\\n# H2\\n# H3" update H2: H2 Changed, H1 and H3 Clean at their original lines', () => {
    const p = bm('# H1\n# H2\n# H3')
    const [id1, id2, id3] = p.allBlocks().map(b => b.id)
    p.update(1, 2, 1, 4, 'New')
    const bs = p.allBlocks()
    expect(bs.length).toBe(3)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(0)
    expect(bs[0].id).toBe(id1);       expect(bs[0].dirty).toBe(DirtyFlag.Clean)
    expect(bs[1].type).toBe(BlockType.Heading)
    expect(bs[1].lineStart).toBe(1);  expect(bs[1].lineEnd).toBe(1)
    expect(bs[1].id).toBe(id2);       expect(bs[1].dirty).toBe(DirtyFlag.Changed)
    expect(bs[2].type).toBe(BlockType.Heading)
    expect(bs[2].lineStart).toBe(2);  expect(bs[2].lineEnd).toBe(2)
    expect(bs[2].id).toBe(id3);       expect(bs[2].dirty).toBe(DirtyFlag.Clean)
  })

  it('"# H1\\n# H2\\n# H3" insert \\n after H1: H1 Changed+absorbs blank(0-1), H2+H3 Shifted', () => {
    const p = bm('# H1\n# H2\n# H3')
    const [id1, id2, id3] = p.allBlocks().map(b => b.id)
    p.update(0, 4, 0, 4, '\n')
    const bs = p.allBlocks()
    expect(bs.length).toBe(3)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(1)
    expect(bs[0].id).toBe(id1);       expect(bs[0].dirty).toBe(DirtyFlag.Changed)
    expect(bs[1].type).toBe(BlockType.Heading)
    expect(bs[1].lineStart).toBe(2);  expect(bs[1].lineEnd).toBe(2)
    expect(bs[1].id).toBe(id2);       expect(bs[1].dirty).toBe(DirtyFlag.Shifted)
    expect(bs[2].type).toBe(BlockType.Heading)
    expect(bs[2].lineStart).toBe(3);  expect(bs[2].lineEnd).toBe(3)
    expect(bs[2].id).toBe(id3);       expect(bs[2].dirty).toBe(DirtyFlag.Shifted)
  })

  it('successive updates on H1: H2 stays Clean both times', () => {
    const p = bm('# H1\n# H2')
    const [id1, id2] = p.allBlocks().map(b => b.id)
    p.update(0, 2, 0, 4, 'New1')
    p.update(0, 2, 0, 6, 'New2')
    const bs = p.allBlocks()
    expect(bs.length).toBe(2)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(0)
    expect(bs[0].id).toBe(id1);       expect(bs[0].dirty).toBe(DirtyFlag.Changed)
    expect(bs[1].type).toBe(BlockType.Heading)
    expect(bs[1].lineStart).toBe(1);  expect(bs[1].lineEnd).toBe(1)
    expect(bs[1].id).toBe(id2);       expect(bs[1].dirty).toBe(DirtyFlag.Clean)
  })
})

// ─── 10. line range integrity ─────────────────────────────────────────────────

describe('line range integrity', () => {
  it('"# H1\\n# H2\\n# H3" insert blank then type: 4 Headings, all lineEnd = lineStart + lines.length - 1', () => {
    const p = bm('# H1\n# H2\n## H3')
    const [id1, id2, id3] = p.allBlocks().map(b => b.id)
    p.update(1, 4, 1, 4, '\n')
    typeAt(p, 2, 0, '## HNew')
    const bs = p.allBlocks()
    expect(bs.length).toBe(4)
    for (const bl of bs) expect(bl.lineEnd).toBe(bl.lineStart + bl.lines.length - 1)
    expect(bs[0].id).toBe(id1)
    expect(bs[1].id).toBe(id2)
    expect(bs[3].id).toBe(id3)
  })

  it('"# H1\\n# H2\\n# H3" multiple updates: blocks sorted, no lineStart/lineEnd overlap', () => {
    const p = bm('# H1\n# H2\n# H3')
    p.update(1, 4, 1, 4, '\n')
    typeAt(p, 2, 0, '## HNew')
    p.update(0, 2, 0, 4, 'Updated')
    const bs = p.allBlocks()
    expect(bs.length).toBe(4)
    for (let i = 1; i < bs.length; i++) {
      expect(bs[i].lineStart).toBeGreaterThan(bs[i - 1].lineEnd)
    }
  })

  it('"# H1\\n\\nparagraph" insert heading line: H1 Changed(0-0), new Heading Changed(1-2), Para Shifted(3-3)', () => {
    const p = bm('# H1\n\nparagraph')
    const [id1, id2] = p.allBlocks().map(b => b.id)
    p.update(1, 0, 1, 0, '# H1b\n')
    const bs = p.allBlocks()
    expect(bs.length).toBe(3)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(0)
    expect(bs[0].id).toBe(id1);       expect(bs[0].dirty).toBe(DirtyFlag.Changed)
    expect(bs[1].type).toBe(BlockType.Heading)
    expect(bs[1].lineStart).toBe(1);  expect(bs[1].lineEnd).toBe(2)   // absorbs blank
    expect(bs[1].dirty).toBe(DirtyFlag.Changed)
    expect(bs[1].lines[0]).toBe('# H1b')
    expect(bs[2].type).toBe(BlockType.Paragraph)
    expect(bs[2].lineStart).toBe(3);  expect(bs[2].lineEnd).toBe(3)
    expect(bs[2].id).toBe(id2);       expect(bs[2].dirty).toBe(DirtyFlag.Shifted)
  })
})

// ─── 11. multi-block spanning edit ───────────────────────────────────────────

describe('edit spanning multiple blocks', () => {
  it('"# H1\\n# H2\\n# H3" replace H1+H2 with "# HMerged": 2 Headings, H3 Shifted, id2 deleted', () => {
    const p = bm('# H1\n# H2\n# H3')
    const [id1, id2, id3] = p.allBlocks().map(b => b.id)
    p.update(0, 0, 1, 4, '# HMerged')
    const bs = p.allBlocks()
    expect(bs.length).toBe(2)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(0)
    expect(bs[0].id).toBe(id1);       expect(bs[0].dirty).toBe(DirtyFlag.Changed)
    expect(bs[0].lines[0]).toBe('# HMerged')
    expect(bs[1].type).toBe(BlockType.Heading)
    expect(bs[1].lineStart).toBe(1);  expect(bs[1].lineEnd).toBe(1)
    expect(bs[1].id).toBe(id3);       expect(bs[1].dirty).toBe(DirtyFlag.Shifted)
    expect(bs[1].lines[0]).toBe('# H3')
    expect(bs.every(b => b.id !== id2)).toBe(true)
  })

  it('"# H1\\n# H2\\n# H3" delete all → 0 blocks', () => {
    const p = bm('# H1\n# H2\n# H3')
    p.update(0, 0, 2, 4, '')
    expect(p.allBlocks().length).toBe(0)
  })
})

// ─── 12. changed callback content matches allBlocks() ─────────────────────────

describe('changed callback content vs allBlocks()', () => {
  it('"# H1\\n# H2" char-by-char append: changed blocks always valid ids in allBlocks()', () => {
    const p = bm('# H1\n# H2')
    const mismatches: string[] = []
    p.changed((blocks) => {
      const allIds = new Set(p.allBlocks().map(b => b.id))
      for (const bl of blocks) {
        if (!allIds.has(bl.id) && bl.id !== 0) {
          mismatches.push(`id ${bl.id} not in allBlocks()`)
        }
      }
    })
    typeAt(p, 1, 4, '\n# H3')
    const bs = p.allBlocks()
    expect(mismatches).toHaveLength(0)
    expect(bs.length).toBe(3)
    expect(bs[2].type).toBe(BlockType.Heading)
    expect(bs[2].lineStart).toBe(2);  expect(bs[2].lineEnd).toBe(2)
    expect(bs[2].dirty).toBe(DirtyFlag.Changed)
  })

  it('"# H1" update → allBlocks() reflects new state inside isEnd callback', () => {
    const p = bm('# H1')
    const id1 = p.allBlocks()[0].id
    p.changed((_blocks, isEnd) => {
      if (isEnd) {
        const bs = p.allBlocks()
        expect(bs.length).toBe(1)
        expect(bs[0].type).toBe(BlockType.Heading)
        expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(0)
        expect(bs[0].id).toBe(id1);       expect(bs[0].dirty).toBe(DirtyFlag.Changed)
        expect(bs[0].lines[0]).toBe('# Updated')
      }
    })
    p.update(0, 2, 0, 4, 'Updated')
  })
})

// ─── 13. trailing blank absorbed into preceding block ─────────────────────────

describe('trailing blank → absorbed into preceding block (ALL types)', () => {
  it("'# h1\\n\\n# h2': h1 absorbs blank(0-1) Changed, h2 at 2-2 Changed", () => {
    const bs = bm('# h1\n\n# h2').allBlocks()
    expect(bs.length).toBe(2)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(1)
    expect(bs[0].dirty).toBe(DirtyFlag.Changed)
    expect(bs[1].type).toBe(BlockType.Heading)
    expect(bs[1].lineStart).toBe(2);  expect(bs[1].lineEnd).toBe(2)
    expect(bs[1].dirty).toBe(DirtyFlag.Changed)
  })

  it("'# h1\\n\\n\\n# h2': h1 absorbs 2 blanks(0-2) Changed, h2 at 3-3 Changed", () => {
    const bs = bm('# h1\n\n\n# h2').allBlocks()
    expect(bs.length).toBe(2)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(2)
    expect(bs[0].dirty).toBe(DirtyFlag.Changed)
    expect(bs[1].type).toBe(BlockType.Heading)
    expect(bs[1].lineStart).toBe(3);  expect(bs[1].lineEnd).toBe(3)
    expect(bs[1].dirty).toBe(DirtyFlag.Changed)
  })

  it("'# h1\\n': count=1, Heading 0-1, Changed", () => {
    const bs = bm('# h1\n').allBlocks()
    expect(bs.length).toBe(1)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(1)
    expect(bs[0].dirty).toBe(DirtyFlag.Changed)
  })

  it("'<div>\\n</div>\\n\\n# h2': Html absorbs blank(0-2) Changed, h2 Heading 3-3 Changed", () => {
    const bs = bm('<div>\n</div>\n\n# h2').allBlocks()
    expect(bs.length).toBe(2)
    expect(bs[0].type).toBe(BlockType.Html)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(2)
    expect(bs[0].dirty).toBe(DirtyFlag.Changed)
    expect(bs[1].type).toBe(BlockType.Heading)
    expect(bs[1].lineStart).toBe(3);  expect(bs[1].lineEnd).toBe(3)
    expect(bs[1].dirty).toBe(DirtyFlag.Changed)
  })

  it("'# h1\\n# h2' insert \\n at (1,0): h1 gap-filled Changed(0-1), h2 Shifted(2-2), ids preserved", () => {
    const p = bm('# h1\n# h2')
    const [h1B, h2B] = p.allBlocks()
    p.update(1, 0, 1, 0, '\n')
    const bs = p.allBlocks()
    expect(bs.length).toBe(2)
    expect(bs[0].type).toBe(BlockType.Heading)
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(1)
    expect(bs[0].id).toBe(h1B.id);   expect(bs[0].dirty).toBe(DirtyFlag.Changed)
    expect(bs[1].type).toBe(BlockType.Heading)
    expect(bs[1].lineStart).toBe(2);  expect(bs[1].lineEnd).toBe(2)
    expect(bs[1].id).toBe(h2B.id);   expect(bs[1].dirty).toBe(DirtyFlag.Shifted)
  })

  it("'# h1\\n# h2' insert \\n at (1,0): h1.markdown ends with Br node", () => {
    const p = bm('# h1\n# h2')
    p.update(1, 0, 1, 0, '\n')
    const h1 = p.allBlocks()[0]
    const md = h1.markdown ?? []
    expect(md.length).toBe(2)
    expect(md[0].type).toBe(NodeType.Heading)
    expect(md[1].type).toBe(NodeType.Br)
  })
})

// ─── 14. rapid Enter key — hold Enter at start of ### h3 ─────────────────────

describe('rapid Enter at start of ### h3 (20×)', () => {
  it('3 blocks throughout, lineEnd === lineStart + lines.length - 1 for all', () => {
    const p = bm('# H1\n## H2\n### h3')
    let row = 2
    for (let i = 0; i < 20; i++) {
      p.update(row, 0, row, 0, '\n')
      row++
    }
    const bs = p.allBlocks()
    expect(bs).toHaveLength(3)
    for (const b of bs) {
      expect(b.lineEnd).toBe(b.lineStart + b.lines.length - 1)
    }
  })

  it('H1 stays at line 0, H3 is at line 22 after 20 inserts', () => {
    const p = bm('# H1\n## H2\n### h3')
    let row = 2
    for (let i = 0; i < 20; i++) {
      p.update(row, 0, row, 0, '\n')
      row++
    }
    const bs = p.allBlocks()
    expect(bs[0].lineStart).toBe(0);  expect(bs[0].lineEnd).toBe(0)
    expect(bs[2].lineStart).toBe(22); expect(bs[2].lineEnd).toBe(22)
  })

  it('H2 absorbs all 20 blank lines: lineStart=1 lineEnd=21, lines.length=21', () => {
    const p = bm('# H1\n## H2\n### h3')
    let row = 2
    for (let i = 0; i < 20; i++) {
      p.update(row, 0, row, 0, '\n')
      row++
    }
    const h2 = p.allBlocks()[1]
    expect(h2.lineStart).toBe(1)
    expect(h2.lineEnd).toBe(21)
    expect(h2.lines.length).toBe(21)
    expect(h2.lines[0]).toBe('## H2')
    expect(h2.lines.slice(1).every((l: string) => l === '')).toBe(true)
  })

  it('H2.markdown ends with 20 Br nodes after 20 inserts', () => {
    const p = bm('# H1\n## H2\n### h3')
    let row = 2
    for (let i = 0; i < 20; i++) {
      p.update(row, 0, row, 0, '\n')
      row++
    }
    const h2 = p.allBlocks()[1]
    const md = h2.markdown ?? []
    expect(md[0].type).toBe(NodeType.Heading)
    expect(md.length).toBe(21) // 1 Heading + 20 Br
    expect(md.slice(1).every((n: any) => n.type === NodeType.Br)).toBe(true)
  })

  it('blocks are contiguous: each block.lineStart = prev.lineEnd + 1', () => {
    const p = bm('# H1\n## H2\n### h3')
    let row = 2
    for (let i = 0; i < 20; i++) {
      p.update(row, 0, row, 0, '\n')
      row++
    }
    const bs = p.allBlocks()
    for (let i = 1; i < bs.length; i++) {
      expect(bs[i].lineStart).toBe(bs[i - 1].lineEnd + 1)
    }
  })
})

// ─── 15. rapid Enter in multi-block document ─────────────────────────────────

describe('rapid Enter in multi-block document (20×)', () => {
  // Closer to the real scenario: preamble + multi-item list + heading + another list
  const DOC = [
    '# Title',          // 0
    '',                 // 1
    '## Section',       // 2
    '',                 // 3
    '1. step one',      // 4
    '2. step two',      // 5
    '   1. sub 2.1',    // 6
    '   2. sub 2.2',    // 7
    '',                 // 8  ← absorbed into list
    '3. step three',    // 9
    '',                 // 10 ← absorbed into list
    '### Sub heading',  // 11
    '',                 // 12
    '- task A',         // 13
    '- task B',         // 14
  ].join('\n')

  it('all blocks contiguous after 20 rapid Enters at start of line 9', () => {
    const p = bm(DOC)
    let row = 9   // start of "3. step three"
    for (let i = 0; i < 20; i++) {
      p.update(row, 0, row, 0, '\n')
      row++
    }
    const bs = p.allBlocks()
    for (let i = 1; i < bs.length; i++) {
      expect(bs[i].lineStart).toBe(bs[i - 1].lineEnd + 1)
    }
  })

  it('lineEnd === lineStart + lines.length - 1 for every block after 20 Enters', () => {
    const p = bm(DOC)
    let row = 9
    for (let i = 0; i < 20; i++) {
      p.update(row, 0, row, 0, '\n')
      row++
    }
    for (const b of p.allBlocks()) {
      expect(b.lineEnd).toBe(b.lineStart + b.lines.length - 1)
    }
  })

  it('no block has lineStart > lineEnd', () => {
    const p = bm(DOC)
    let row = 9
    for (let i = 0; i < 20; i++) {
      p.update(row, 0, row, 0, '\n')
      row++
    }
    for (const b of p.allBlocks()) {
      expect(b.lineStart).toBeLessThanOrEqual(b.lineEnd)
    }
  })

  it('block lineStart values are strictly increasing', () => {
    const p = bm(DOC)
    let row = 9
    for (let i = 0; i < 20; i++) {
      p.update(row, 0, row, 0, '\n')
      row++
    }
    const bs = p.allBlocks()
    for (let i = 1; i < bs.length; i++) {
      expect(bs[i].lineStart).toBeGreaterThan(bs[i - 1].lineStart)
    }
  })
})
