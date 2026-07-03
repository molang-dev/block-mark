import { describe, it, expect } from 'vitest'
import { BlockMaker } from '../../src/core/BlockMaker'
import { blockMakerFrontMatter, FrontMatterBlockType } from '../../src/plugins/front-matter'

function parse(md: string) {
  const p = new BlockMaker().use(blockMakerFrontMatter).changed(() => {})
  p.parse(md)
  return p.allBlocks()
}
function meta(md: string) { return JSON.parse(parse(md)[0].meta!) }

describe('FrontMatter — recognition', () => {
  it('--- at line 0 → FrontMatterBlockType', () => {
    expect(parse('---\ntitle: hi\n---')[0].type).toBe(FrontMatterBlockType.FrontMatter)
  })
  it('--- NOT at line 0 → not FrontMatter', () => {
    const bs = parse('# h\n\n---')
    expect(bs.every(b => b.type !== FrontMatterBlockType.FrontMatter)).toBe(true)
  })
  it('blank line before --- → not FrontMatter', () => {
    const bs = parse('\n---\ntitle: t\n---')
    expect(bs[0].type).not.toBe(FrontMatterBlockType.FrontMatter)
  })
  it('no blockMakerFrontMatter plugin → --- is Hr', () => {
    const p = new BlockMaker().changed(() => {}); p.parse('---\ntitle: t\n---')
    expect(p.allBlocks()[0].type).not.toBe(FrontMatterBlockType.FrontMatter)
  })
  it('unclosed front matter (no closing ---) collects to end', () => {
    const bs = parse('---\ntitle: t')
    expect(bs[0].type).toBe(FrontMatterBlockType.FrontMatter)
  })
  it('closing ... also closes front matter', () => {
    expect(parse('---\ntitle: t\n...')[0].type).toBe(FrontMatterBlockType.FrontMatter)
  })
})

describe('FrontMatter — YAML parsing', () => {
  it('string value', () => { expect(meta('---\nkey: hello\n---').key).toBe('hello') })
  it('quoted string', () => { expect(meta('---\nkey: "hello world"\n---').key).toBe('hello world') })
  it('integer value', () => { expect(meta('---\nn: 42\n---').n).toBe(42) })
  it('float value', () => { expect(meta('---\nx: 3.14\n---').x).toBe(3.14) })
  it('boolean true', () => { expect(meta('---\nb: true\n---').b).toBe(true) })
  it('boolean false', () => { expect(meta('---\nb: false\n---').b).toBe(false) })
  it('null value', () => { expect(meta('---\nn: null\n---').n).toBeNull() })
  it('tilde null', () => { expect(meta('---\nn: ~\n---').n).toBeNull() })
  it('inline array', () => { expect(meta('---\ntags: [vue, md]\n---').tags).toEqual(['vue', 'md']) })
  it('block array', () => {
    expect(meta('---\ntags:\n  - vue\n  - md\n---').tags).toEqual(['vue', 'md'])
  })
  it('multiple keys', () => {
    const m = meta('---\ntitle: T\ndate: 2024-01-15\ndraft: false\n---')
    expect(m.title).toBe('T')
    expect(m.date).toBe('2024-01-15')
    expect(m.draft).toBe(false)
  })
  it('comment lines ignored', () => {
    expect(meta('---\n# comment\nkey: val\n---').key).toBe('val')
  })
})

describe('FrontMatter — block structure', () => {
  it('front matter + body → correct block count', () => {
    expect(parse('---\ntitle: t\n---\n\n# H\n\nP').length).toBe(3)
  })
  it('front matter lineStart=0', () => {
    expect(parse('---\ntitle: t\n---')[0].lineStart).toBe(0)
  })
  it('front matter has no markdown nodes', () => {
    const b = parse('---\ntitle: t\n---')[0]
    expect(b.markdown).toEqual([])
  })
  it('front matter html renders as empty string', () => {
    const b = parse('---\ntitle: t\n---')[0]
    expect(b.html).toBe('')
  })
})
