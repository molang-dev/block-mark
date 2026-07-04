import { describe, it, expect } from 'vitest'
import { BlockMaker } from '../../src/core/BlockMaker'
import { blockMakerMermaid, MermaidBlockType } from '../../src/plugins/mermaid'

function parse(md: string) {
  let result: any[] = []
  new BlockMaker().use(blockMakerMermaid()).changed((blocks, isEnd) => { if (isEnd) result = blocks }).parse(md)
  return result
}

describe('Mermaid — block recognition', () => {
  it('```mermaid block → MermaidBlockType.Diagram', () => {
    const blocks = parse('```mermaid\ngraph TD\nA --> B\n```')
    expect(blocks[0].type).toBe(MermaidBlockType.Diagram)
  })

  it('~~~mermaid tilde fence also recognized', () => {
    const blocks = parse('~~~mermaid\ngraph TD\n~~~')
    expect(blocks[0].type).toBe(MermaidBlockType.Diagram)
  })

  it('mermaid is case-insensitive (MERMAID)', () => {
    const blocks = parse('```MERMAID\ngraph\n```')
    expect(blocks[0].type).toBe(MermaidBlockType.Diagram)
  })

  it('non-mermaid fenced code is not Mermaid', () => {
    const blocks = parse('```typescript\nconst x = 1\n```')
    expect(blocks[0].type).not.toBe(MermaidBlockType.Diagram)
  })
})

describe('Mermaid — block.markdown and block.html', () => {
  it('mermaid block has no block.markdown (html only)', () => {
    const blocks = parse('```mermaid\ngraph\n```')
    expect(blocks[0].markdown).toBeUndefined()
  })

  it('block.html contains <pre class="mermaid">', () => {
    const blocks = parse('```mermaid\ngraph\n```')
    expect(blocks[0].html).toContain('<pre class="mermaid"')
  })

  it('diagram code appears in data-source attribute', () => {
    const blocks = parse('```mermaid\ngraph TD\nA --> B\n```')
    expect(blocks[0].html).toContain('graph TD')
    expect(blocks[0].html).toContain('A --&gt; B')
  })

  it('closing fence ``` not included in diagram code', () => {
    const blocks = parse('```mermaid\ngraph\n```')
    expect(blocks[0].html).not.toContain('```')
  })

  it('trailing blank after closing fence: code still correct', () => {
    const blocks = parse('```mermaid\ngraph TD\n```\n\n# next')
    expect(blocks[0].html).not.toContain('```')
    expect(blocks[0].html).toContain('graph TD')
  })

  it('opening fence info word not in diagram code content', () => {
    const blocks = parse('```mermaid\ngraph\n```')
    // "mermaid" only appears in class="mermaid", not as code content
    expect(blocks[0].html).toContain('class="mermaid"')
    // data-source should only contain the diagram content, not the fence line
    const src = blocks[0].html?.match(/data-source="([^"]*)"/)?.[1] ?? ''
    expect(src).not.toContain('mermaid')
  })
})

// ─── block.lines 原文不变 ────────────────────────────────────────────────────

describe('block.lines === raw source lines (mermaid)', () => {
  it('mermaid block lines match raw', () => {
    const md = '```mermaid\ngraph TD\n    A --> B\n```'
    const raw = md.split('\n')
    const blocks = parse(md)
    for (const b of blocks) {
      expect(b.lines).toEqual(raw.slice(b.lineStart, b.lineEnd + 1))
    }
  })
})
