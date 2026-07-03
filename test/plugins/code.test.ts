import { describe, it, expect } from 'vitest'
import { BlockMaker } from '../../src/core/BlockMaker'
import { blockMakerCode } from '../../src/plugins/code'

function fakeHighlight(code: string, lang: string): string {
  return `<span class="hl-${lang}">${code}</span>`
}

function render(md: string): string {
  let html = ''
  new BlockMaker()
    .use(blockMakerCode(fakeHighlight))
    .changed((blocks, isEnd) => {
      if (isEnd) html = blocks.map(b => b.html ?? '').join('')
    })
    .parse(md)
  return html
}

describe('blockMakerCode', () => {
  it('applies highlight fn when lang is present', () => {
    const html = render('```js\nconsole.log(1)\n```')
    expect(html).toContain('<span class="hl-js">')
    expect(html).toContain('console.log(1)')
    expect(html).toContain('<code class="language-js">')
  })

  it('escapes code when no lang', () => {
    const html = render('```\n<b>raw</b>\n```')
    expect(html).toContain('&lt;b&gt;')
    expect(html).not.toContain('<b>')
  })

  it('wraps in <pre><code>', () => {
    const html = render('```ts\nlet x = 1\n```')
    expect(html).toContain('<pre>')
    expect(html).toContain('<code')
  })

  it('highlight fn receives correct code and lang', () => {
    const calls: Array<{ code: string; lang: string }> = []
    new BlockMaker()
      .use(blockMakerCode((code, lang) => { calls.push({ code, lang }); return code }))
      .changed(() => {})
      .parse('```python\nprint("hi")\n```')
    expect(calls).toHaveLength(1)
    expect(calls[0].lang).toBe('python')
    expect(calls[0].code).toBe('print("hi")')
  })
})
