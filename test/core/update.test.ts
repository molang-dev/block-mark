import { describe, it, expect } from 'vitest'
import { BlockMaker } from '../../src/core/BlockMaker'
import { BlockType, DirtyFlag, Block } from '../../src/core/types'

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
  it('"# Hello" rename-word-only → "# World", block count stays 1', () => {
    const p = bm('# Hello')
    p.update(0, 2, 0, 7, 'World')
    expect(headings(p).length).toBe(1)
    expect(headings(p)[0].lines[0]).toBe('# World')
  })

  it('"# H1\\n\\nparagraph" edit paragraph text, heading untouched', () => {
    const p = bm('# H1\n\nparagraph')
    p.update(2, 0, 2, 9, 'new text')
    expect(headings(p)[0].lines[0]).toBe('# H1')
    expect(paragraphs(p)[0].lines[0]).toBe('new text')
  })

  it('"# H1" replace entire heading text → block still Heading type', () => {
    const p = bm('# H1')
    p.update(0, 2, 0, 4, 'Replaced Heading')
    expect(headings(p).length).toBe(1)
    expect(headings(p)[0].depth).toBe(1)
  })

  it('"# H1\\n\\n# H2" edit H2 content, H1 id unchanged', () => {
    const p = bm('# H1\n\n# H2')
    const h1Id = headings(p)[0].id
    p.update(2, 2, 2, 4, 'Changed')
    expect(headings(p)[0].id).toBe(h1Id)
  })
})

// ─── 2. line insertion (lineDelta > 0) ───────────────────────────────────────

describe('line insertion — lineDelta > 0', () => {
  it('"# H1\\n# H2" insert \\n after H1 → H2 shifts to line 2, id preserved', () => {
    const p = bm('# H1\n# H2')
    const h2Id = headings(p)[1].id
    p.update(0, 4, 0, 4, '\n')
    const h2 = p.allBlocks().find(b => b.id === h2Id)
    expect(h2?.lineStart).toBe(2)
    expect(h2?.dirty).toBe(DirtyFlag.Shifted)
  })

  it('"# H1\\n# H2\\n# H3" insert newline mid-doc → H3 Shifted, H1 Clean', () => {
    const p = bm('# H1\n# H2\n# H3')
    const h1Id = headings(p)[0].id
    const h3Id = headings(p)[2].id
    p.update(1, 4, 1, 4, '\n')
    const h1 = p.allBlocks().find(b => b.id === h1Id)
    const h3 = p.allBlocks().find(b => b.id === h3Id)
    expect(h1?.dirty).toBe(DirtyFlag.Clean)
    expect(h3?.dirty).toBe(DirtyFlag.Shifted)
  })

  it('"# H1\\n# H2" insert "# HNew\\n" between → 3 headings total', () => {
    const p = bm('# H1\n# H2')
    p.update(1, 0, 1, 0, '# HNew\n')
    expect(headings(p).length).toBe(3)
    expect(headings(p)[1].lines[0]).toBe('# HNew')
  })
})

// ─── 3. line deletion (lineDelta < 0) ────────────────────────────────────────

describe('line deletion — lineDelta < 0', () => {
  it('"# H1\\n# H2\\n# H3" delete H2 line → 2 headings remain', () => {
    const p = bm('# H1\n# H2\n# H3')
    p.update(1, 0, 2, 0, '')   // delete "# H2\n"
    expect(headings(p).length).toBe(2)
    expect(headings(p).map(b => b.lines[0])).toEqual(['# H1', '# H3'])
  })

  it('"# H1\\n# H2\\n# H3" delete H2, H3 lineStart shifts down by 1', () => {
    const p = bm('# H1\n# H2\n# H3')
    const h3Before = headings(p)[2].lineStart
    p.update(1, 0, 2, 0, '')
    expect(headings(p)[1].lineStart).toBe(h3Before - 1)
  })

  it('"# H1\\n\\nparagraph" delete paragraph → only heading left', () => {
    const p = bm('# H1\n\nparagraph')
    p.update(2, 0, 2, 9, '')
    expect(paragraphs(p).length).toBe(0)
    expect(headings(p).length).toBe(1)
  })
})

// ─── 4. append after last block (firstAffected = -1) ─────────────────────────

describe('append after all blocks — firstAffected = -1', () => {
  it('"# H1\\n## H2" append "\\n### H3" → 3 headings', () => {
    const p = bm('# H1\n## H2')
    p.update(1, 5, 1, 5, '\n### H3')   // "## H2".length === 5
    expect(headings(p).length).toBe(3)
    expect(headings(p)[2].lines[0]).toBe('### H3')
  })

  it('"# H1" append "\\n\\nparagraph text" → heading + paragraph', () => {
    const p = bm('# H1')
    p.update(0, 4, 0, 4, '\n\nparagraph text')
    expect(headings(p).length).toBe(1)
    expect(paragraphs(p).length).toBe(1)
    expect(paragraphs(p)[0].lines[0]).toBe('paragraph text')
  })

  it('"# H1\\n## H2" no trailing newline: type "### H3" char-by-char → 3 headings', () => {
    const p = bm('# H1\n## H2')
    p.update(1, 5, 1, 5, '\n')          // "## H2".length === 5, create line 2
    typeAt(p, 2, 0, '### H3')
    expect(headings(p).length).toBe(3)
    expect(headings(p)[2].lines[0]).toBe('### H3')
  })

  it('"# H1\\n## H2" append then type more: H1 id stays stable throughout', () => {
    const p = bm('# H1\n## H2')
    const h1Id = headings(p)[0].id
    p.update(1, 4, 1, 4, '\n')
    typeAt(p, 2, 0, '### H3')
    expect(p.allBlocks().find(b => b.id === h1Id)?.lines[0]).toBe('# H1')
  })
})

// ─── 5. edit in gap between blocks (lo > hi) ─────────────────────────────────

describe('insert in gap between blocks — lo > hi', () => {
  it('"# H1\\n# H2\\n## H3" add blank after H2 then type "## HNew" in gap → 4 headings', () => {
    const p = bm('# H1\n# H2\n## H3')
    p.update(1, 4, 1, 4, '\n')          // gap at line 2, ## H3 → line 3
    typeAt(p, 2, 0, '## HNew')
    expect(headings(p).length).toBe(4)
    expect(headings(p)[2].lines[0]).toBe('## HNew')
    expect(headings(p)[3].lines[0]).toBe('## H3')
  })

  it('"# H1\\n# H2\\n## H3" gap edit: H1 (line 0) stays Clean', () => {
    const p = bm('# H1\n# H2\n## H3')
    p.update(1, 4, 1, 4, '\n')
    let dirtyLines: string[] = []
    p.changed(blocks => { dirtyLines = blocks.map(b => b.lines[0]) })
    typeAt(p, 2, 0, '## HNew')
    expect(dirtyLines).not.toContain('# H1')
  })

  it('"# H1\\n# H2\\n## H3" char-by-char in gap: each step allBlocks() lineStart consistent', () => {
    const p = bm('# H1\n# H2\n## H3')
    p.update(1, 4, 1, 4, '\n')
    for (let col = 0; col < '## HNew'.length; col++) {
      p.update(2, col, 2, col, '## HNew'[col])
      const blocks = p.allBlocks().filter(b => b.id !== 0)
      for (const bl of blocks) {
        expect(bl.lineEnd - bl.lineStart + 1).toBe(bl.lines.length)
      }
    }
  })

  it('"# H1\\n# H2" gap before H2: press Enter after H1, type "# HMid" in gap → order H1,HMid,H2', () => {
    const p = bm('# H1\n# H2')
    p.update(0, 4, 0, 4, '\n')          // gap at line 1, # H2 → line 2
    typeAt(p, 1, 0, '# HMid')
    const lines = headings(p).map(h => h.lines[0])
    expect(lines).toEqual(['# H1', '# HMid', '# H2'])
  })
})

// ─── 6. character-by-character for-loop ──────────────────────────────────────

describe('character-by-character update — for loop', () => {
  it('type "# hello world" from empty → single H1 with correct text', () => {
    const p = new BlockMaker()
    p.parse('')
    typeAt(p, 0, 0, '# hello world')
    expect(headings(p).length).toBe(1)
    expect(headings(p)[0].lines[0]).toBe('# hello world')
  })

  it('type "# H1\\n# H2\\n# H3" char-by-char → 3 headings at correct lines', () => {
    const p = new BlockMaker()
    p.parse('')
    typeAt(p, 0, 0, '# H1\n# H2\n# H3')
    expect(headings(p).length).toBe(3)
    expect(headings(p)[0].lineStart).toBe(0)
    expect(headings(p)[1].lineStart).toBe(1)
    expect(headings(p)[2].lineStart).toBe(2)
  })

  it('type "# H1\\n\\nparagraph" char-by-char → changed callback content matches allBlocks()', () => {
    const p = new BlockMaker()
    p.parse('')
    const mismatches: string[] = []
    p.changed((_changed, isEnd) => {
      if (!isEnd) return
      const all = p.allBlocks()
      for (const bl of all) {
        if (bl.id !== 0 && bl.order !== p.allBlocks().indexOf(bl)) {
          mismatches.push(`id:${bl.id} order mismatch`)
        }
      }
    })
    typeAt(p, 0, 0, '# H1\n\nparagraph')
    expect(mismatches).toHaveLength(0)
    expect(headings(p).length).toBe(1)
    expect(paragraphs(p).length).toBe(1)
  })

  it('type 5 headings char-by-char → after each \\n block count increases by 1', () => {
    const p = new BlockMaker()
    p.parse('')
    const countAfterNewline: number[] = []
    p.changed((_ch, isEnd) => {
      if (isEnd) countAfterNewline.push(headings(p).length)
    })
    typeAt(p, 0, 0, '# H1\n# H2\n# H3\n# H4\n# H5')
    expect(headings(p).length).toBe(5)
  })

  it('each char update: lineEnd = lineStart + lines.length - 1 for all blocks', () => {
    const p = bm('# H1\n## H2')
    for (const ch of '\n### H3') {
      if (ch === '\n') p.update(1, 4, 1, 4, ch)
      else {
        const row = p.allBlocks().filter(b => b.id !== 0).at(-1)?.lineEnd ?? 0
        const col = p.allBlocks().filter(b => b.id !== 0).at(-1)?.lines.at(-1)?.length ?? 0
        p.update(row, col, row, col, ch)
      }
      const blocks = p.allBlocks().filter(b => b.id !== 0)
      for (const bl of blocks) {
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

  it('update with 0 dirty blocks → changed fires once with isEnd=true', () => {
    const p = bm('# H1', { batchSizes: [1, 2, 3] })
    let calls = 0; let lastIsEnd = false
    p.changed((_b, isEnd) => { calls++; lastIsEnd = isEnd })
    // update to identical content
    p.update(0, 2, 0, 4, 'H1')   // same text, block still Changed due to re-process
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

  it('default batchSizes [400,800,...]: update 3 headings → single changed call', () => {
    const p = bm('# placeholder')    // default batchSizes starts at 400
    const sizes: number[] = []
    p.changed(blocks => { sizes.push(blocks.length) })
    p.update(0, 0, 0, 13, '# H1\n# H2\n# H3')
    expect(sizes).toEqual([3])
  })
})

// ─── 8. block id stability ────────────────────────────────────────────────────

describe('block id stability across updates', () => {
  it('"# H1\\n# H2\\n# H3" edit H2 content → H1 and H3 ids unchanged', () => {
    const p = bm('# H1\n# H2\n# H3')
    const [h1Id, , h3Id] = headings(p).map(b => b.id)
    p.update(1, 2, 1, 4, 'Changed')
    const ids = headings(p).map(b => b.id)
    expect(ids[0]).toBe(h1Id)
    expect(ids[2]).toBe(h3Id)
  })

  it('"# H1\\n# H2\\n# H3" shift H3 by inserting line → H3 id preserved', () => {
    const p = bm('# H1\n# H2\n# H3')
    const h3Id = headings(p)[2].id
    p.update(1, 4, 1, 4, '\n')
    expect(p.allBlocks().find(b => b.id === h3Id)?.lineStart).toBe(3)
  })

  it('"# H1\\n# H2" new heading appended → gets monotonically higher id', () => {
    const p = bm('# H1\n# H2')
    const maxIdBefore = Math.max(...headings(p).map(b => b.id))
    p.update(1, 4, 1, 4, '\n# H3')
    const h3Id = headings(p).find(h => h.lines[0] === '# H3')?.id ?? 0
    expect(h3Id).toBeGreaterThan(maxIdBefore)
  })
})

// ─── 9. dirty flags ───────────────────────────────────────────────────────────

describe('dirty flags per update', () => {
  it('"# H1\\n# H2\\n# H3" update H2 → H2 is Changed, H1 and H3 are Clean', () => {
    const p = bm('# H1\n# H2\n# H3')
    let received: Block[] = []
    p.changed((blocks, isEnd) => { if (isEnd) received = p.allBlocks() })
    p.update(1, 2, 1, 4, 'New')
    const [h1, h2, h3] = received
    expect(h2.dirty).toBe(DirtyFlag.Changed)
    expect(h1.dirty).toBe(DirtyFlag.Clean)
    expect(h3.dirty).toBe(DirtyFlag.Clean)
  })

  it('"# H1\\n# H2\\n# H3" insert \\n after H1 → H2 Shifted, H3 Shifted, H1 Changed', () => {
    const p = bm('# H1\n# H2\n# H3')
    let received: Block[] = []
    p.changed((_b, isEnd) => { if (isEnd) received = p.allBlocks() })
    p.update(0, 4, 0, 4, '\n')
    const h1 = received.find(b => b.lines[0] === '# H1')
    const h2 = received.find(b => b.lines[0] === '# H2')
    const h3 = received.find(b => b.lines[0] === '# H3')
    expect(h1?.dirty).toBe(DirtyFlag.Changed)  // re-subdivided
    expect(h2?.dirty).toBe(DirtyFlag.Shifted)
    expect(h3?.dirty).toBe(DirtyFlag.Shifted)
  })

  it('successive updates: dirty flags cleared between updates', () => {
    const p = bm('# H1\n# H2')
    p.update(0, 2, 0, 4, 'New1')
    // after first update, do second: H2 should be Clean (not leftover Changed)
    let h2Dirty: DirtyFlag | undefined
    p.changed((_b, isEnd) => {
      if (isEnd) h2Dirty = p.allBlocks().find(b => b.lines[0] === '# H2')?.dirty
    })
    p.update(0, 2, 0, 6, 'New2')
    expect(h2Dirty).toBe(DirtyFlag.Clean)
  })
})

// ─── 10. line range integrity ─────────────────────────────────────────────────

describe('line range integrity', () => {
  it('"# H1\\n# H2\\n# H3" after insert in gap: lineEnd = lineStart + lines.length - 1', () => {
    const p = bm('# H1\n# H2\n# H3')
    p.update(1, 4, 1, 4, '\n')
    typeAt(p, 2, 0, '## HNew')
    for (const bl of p.allBlocks().filter(b => b.id !== 0)) {
      expect(bl.lineEnd).toBe(bl.lineStart + bl.lines.length - 1)
    }
  })

  it('"# H1\\n# H2\\n# H3" after multiple updates: blocks sorted by lineStart', () => {
    const p = bm('# H1\n# H2\n# H3')
    p.update(1, 4, 1, 4, '\n')
    typeAt(p, 2, 0, '## HNew')
    p.update(0, 2, 0, 4, 'Updated')
    const blocks = p.allBlocks().filter(b => b.id !== 0)
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i].lineStart).toBeGreaterThanOrEqual(blocks[i - 1].lineEnd)
    }
  })

  it('"# H1\\n\\nparagraph" insert line: block count and line coverage consistent', () => {
    const p = bm('# H1\n\nparagraph')
    p.update(1, 0, 1, 0, '# H1b\n')
    const blocks = p.allBlocks().filter(b => b.id !== 0)
    const maxLine = Math.max(...blocks.map(b => b.lineEnd))
    expect(maxLine).toBe(3)   // 4 lines: # H1, # H1b, blank, paragraph
    expect(blocks.length).toBe(3)
  })
})

// ─── 11. multi-block spanning edit ───────────────────────────────────────────

describe('edit spanning multiple blocks', () => {
  it('"# H1\\n# H2\\n# H3" replace H1+H2 range with "# HMerged" → 2 headings', () => {
    const p = bm('# H1\n# H2\n# H3')
    p.update(0, 0, 1, 4, '# HMerged')
    expect(headings(p).length).toBe(2)
    expect(headings(p)[0].lines[0]).toBe('# HMerged')
    expect(headings(p)[1].lines[0]).toBe('# H3')
  })

  it('"# H1\\n# H2\\n# H3" delete all content → 0 blocks', () => {
    const p = bm('# H1\n# H2\n# H3')
    p.update(0, 0, 2, 4, '')
    expect(p.allBlocks().length).toBe(0)
  })
})

// ─── 12. changed callback content matches allBlocks() ────────────────────────

describe('changed callback content vs allBlocks()', () => {
  it('"# H1\\n# H2\\n# H3" on every char-by-char update: changed blocks subset of allBlocks()', () => {
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
    expect(mismatches).toHaveLength(0)
  })

  it('"# H1" update → allBlocks() immediately reflects new content', () => {
    const p = bm('# H1')
    p.changed((_blocks, isEnd) => {
      if (isEnd) {
        expect(p.allBlocks()[0].lines[0]).toBe('# Updated')
      }
    })
    p.update(0, 2, 0, 4, 'Updated')
  })
})
