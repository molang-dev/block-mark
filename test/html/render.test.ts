import { describe, it, expect } from 'vitest'
import { BlockMaker } from '../../src/core/BlockMaker'
import { blockMakerGFM } from '../../src/plugins/gfm'
import { blockMakerHtml } from '../../src/plugins/html'

function render(md: string): string {
  let html = ''
  new BlockMaker().use(blockMakerHtml).changed((blocks, isEnd) => {
    if (isEnd) html = blocks.map(b => b.html ?? '').join('')
  }).parse(md)
  return html
}

function renderGfm(md: string): string {
  let html = ''
  new BlockMaker().use(blockMakerGFM).use(blockMakerHtml).changed((blocks, isEnd) => {
    if (isEnd) html = blocks.map(b => b.html ?? '').join('')
  }).parse(md)
  return html
}

// ─── Headings ────────────────────────────────────────────────────────────────

describe('render heading', () => {
  it('h1', () => expect(render('# Hello')).toContain('<h1>'))
  it('h2', () => expect(render('## Sub')).toContain('<h2>'))
  it('h6', () => expect(render('###### Deep')).toContain('<h6>'))
  it('setext h1', () => expect(render('Title\n=====')).toContain('<h1>'))
  it('content inside', () => expect(render('# Hello *world*')).toContain('<em>world</em>'))
})

// ─── Paragraph ───────────────────────────────────────────────────────────────

describe('render paragraph', () => {
  it('wraps in <p>', () => expect(render('hello')).toBe('<p>hello</p>'))
  it('multiple paragraphs', () => {
    const html = render('para1\n\npara2')
    expect(html).toContain('<p>para1</p>')
    expect(html).toContain('<p>para2</p>')
  })
  it('inline HTML passes through', () => expect(render('<b>text</b>')).toContain('<b>'))
})

// ─── Emphasis ────────────────────────────────────────────────────────────────

describe('render inline emphasis', () => {
  it('*em*', () => expect(render('*em*')).toContain('<em>em</em>'))
  it('**strong**', () => expect(render('**strong**')).toContain('<strong>strong</strong>'))
  it('`code`', () => expect(render('`code`')).toContain('<code>code</code>'))
})

// ─── Code Block ──────────────────────────────────────────────────────────────

describe('render code', () => {
  it('fenced code with lang', () => {
    const html = render('```js\nconsole.log(1)\n```')
    expect(html).toContain('<pre>')
    expect(html).toContain('<code class="language-js">')
    expect(html).toContain('console.log(1)')
  })

  it('escapes code content', () => {
    const html = render('```\n<script>alert(1)</script>\n```')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('indented code', () => {
    const html = render('    code here')
    expect(html).toContain('<pre>')
    expect(html).toContain('code here')
  })
})

// ─── Blockquote ──────────────────────────────────────────────────────────────

describe('render blockquote', () => {
  it('wraps in <blockquote>', () => {
    expect(render('> quote')).toContain('<blockquote>')
  })

  it('nested paragraph inside', () => {
    const html = render('> paragraph text')
    expect(html).toContain('<p>')
  })
})

// ─── Lists ───────────────────────────────────────────────────────────────────

describe('render list', () => {
  it('unordered list', () => {
    const html = render('- a\n- b')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
  })

  it('ordered list', () => {
    const html = render('1. first\n2. second')
    expect(html).toContain('<ol>')
  })

  it('tight list: no <p> inside items', () => {
    const html = render('- a\n- b')
    expect(html).not.toMatch(/<li><p/)
  })

  it('loose list: <p> inside items', () => {
    const html = render('- a\n\n- b')
    expect(html).toMatch(/<li><p/)
  })
})

// ─── HR ──────────────────────────────────────────────────────────────────────

describe('render hr', () => {
  it('---', () => expect(render('---')).toContain('<hr>'))
  it('***', () => expect(render('***')).toContain('<hr>'))
})

// ─── Links ───────────────────────────────────────────────────────────────────

describe('render link', () => {
  it('inline link', () => {
    const html = render('[text](https://example.com)')
    expect(html).toContain('<a href="https://example.com">')
    expect(html).toContain('text</a>')
  })

  it('image', () => {
    const html = render('![alt](img.png)')
    expect(html).toContain('<img src="img.png" alt="alt">')
  })

  it('autolink <url>', () => {
    const html = render('<https://example.com>')
    expect(html).toContain('href="https://example.com"')
  })

  it('email autolink', () => {
    const html = render('<user@example.com>')
    expect(html).toContain('mailto:user@example.com')
  })
})

// ─── HTML passthrough ────────────────────────────────────────────────────────

describe('render HTML block', () => {
  it('<div> block passthrough', () => {
    const html = render('<div>\ncontent\n</div>')
    expect(html).toContain('<div>')
    expect(html).toContain('content')
  })

  it('inline <b> tag passthrough', () => {
    const html = render('text <b>bold</b> text')
    expect(html).toContain('<b>')
    expect(html).toContain('</b>')
  })
})

// ─── GFM rendering ───────────────────────────────────────────────────────────

describe('GFM HTML rendering', () => {
  it('renders table', () => {
    const html = renderGfm(`| A | B |
|---|---|
| 1 | 2 |`)
    expect(html).toContain('<table>')
    expect(html).toContain('<th')
    expect(html).toContain('<td')
  })

  it('renders strikethrough', () => {
    const html = renderGfm('~~del~~')
    expect(html).toContain('<del>')
  })

  it('renders footnote ref', () => {
    const html = renderGfm('[^1]')
    expect(html).toContain('footnote-ref')
  })

  it('renders task checkbox checked', () => {
    const html = renderGfm('- [x] done')
    expect(html).toContain('<input')
    expect(html).toContain('checked')
  })

  it('renders task checkbox unchecked', () => {
    const html = renderGfm('- [ ] todo')
    expect(html).toContain('<input')
    expect(html).not.toContain('checked disabled')
  })

  it('renders footnote def', () => {
    // FootnoteDef block.html stores inner content only; wrapper assembled by caller
    let blocks: any[] = []
    new BlockMaker().use(blockMakerGFM).use(blockMakerHtml)
      .changed((b, isEnd) => { if (isEnd) blocks = b }).parse('[^1]: My footnote')
    const fn = blocks.find((b: any) => b.type === 111002)
    expect(fn).toBeTruthy()
    expect(fn.meta).toBe('1')
    expect(fn.html).toContain('My footnote')
  })
})

// ─── XSS safety ──────────────────────────────────────────────────────────────

describe('XSS safety', () => {
  it('escapes < > in plain text paragraphs', () => {
    const html = render('a < b > c')
    expect(html).toContain('&lt;')
    expect(html).not.toContain('< b')
  })

  it('escapes content inside code block', () => {
    const html = render('```\n<img src=x onerror=alert(1)>\n```')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it('HTML blocks pass through as-is (CommonMark spec)', () => {
    const html = render('<script>alert(1)</script>')
    expect(html).toContain('<script>')
  })

  it('link href passes through — consumers should sanitize if needed', () => {
    const html = render('[click](javascript:alert(1))')
    expect(html).toContain('href="javascript:alert(1)"')
  })
})
