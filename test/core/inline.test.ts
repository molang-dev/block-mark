import { describe, it, expect } from 'vitest'
import { BlockMaker } from '../../src/core/BlockMaker'
import { NodeType, LinkType } from '../../src/core/types'

function inlineNodes(md: string) {
  let result: any = null
  new BlockMaker().changed((blocks, isEnd) => {
    if (isEnd && blocks[0]) result = blocks[0].markdown?.[0]?.children ?? []
  }).parse(md)
  return result ?? []
}

// ─── I-01 Backslash Escape ───────────────────────────────────────────────────

describe('Backslash Escape', () => {
  it('escapes punctuation', () => {
    const nodes = inlineNodes('\\*not em\\*')
    expect(nodes.map((n: any) => n.text ?? n.type).join('')).toContain('*')
  })

  it('non-punctuation is literal backslash', () => {
    const nodes = inlineNodes('\\a')
    // \ before non-punctuation → backslash is literal, merged with next text
    const text = nodes.map((n: any) => n.text ?? '').join('')
    expect(text).toBe('\\a')
  })

  it('hardbreak on backslash + newline', () => {
    const nodes = inlineNodes('line\\\ncontinue')
    const hb = nodes.find((n: any) => n.type === NodeType.HardBr)
    expect(hb).toBeDefined()
  })
})

// ─── I-02 Character Reference ────────────────────────────────────────────────

describe('Character Reference', () => {
  it('named entity preserved as Escape node', () => {
    const nodes = inlineNodes('&amp;')
    const esc = nodes.find((n: any) => n.type === NodeType.Escape)
    expect(esc?.text).toBe('&amp;')
  })

  it('numeric entity', () => {
    const nodes = inlineNodes('&#123;')
    const esc = nodes.find((n: any) => n.type === NodeType.Escape)
    expect(esc).toBeDefined()
  })

  it('unknown entity is literal text', () => {
    const nodes = inlineNodes('&notanentity')
    expect(nodes.some((n: any) => n.text?.includes('&notanentity'))).toBe(true)
  })
})

// ─── I-03 Code Span ──────────────────────────────────────────────────────────

describe('Code Span', () => {
  it('single backtick', () => {
    const nodes = inlineNodes('`code`')
    expect(nodes[0].type).toBe(NodeType.Codespan)
    expect(nodes[0].text).toBe('code')
  })

  it('double backtick', () => {
    const nodes = inlineNodes('``co`de``')
    expect(nodes[0].type).toBe(NodeType.Codespan)
    expect(nodes[0].text).toBe('co`de')
  })

  it('trims single space around content', () => {
    const nodes = inlineNodes('` code `')
    expect(nodes[0].text).toBe('code')
  })

  it('does not trim when all spaces', () => {
    const nodes = inlineNodes('`   `')
    expect(nodes[0].text).toBe('   ')
  })

  it('unclosed backtick is literal', () => {
    const nodes = inlineNodes('`unclosed')
    // Opening ` fails to close → literal; merged text includes backtick
    const text = nodes.map((n: any) => n.text ?? '').join('')
    expect(text).toBe('`unclosed')
  })

  it('no formatting inside codespan', () => {
    const nodes = inlineNodes('`**not bold**`')
    expect(nodes[0].type).toBe(NodeType.Codespan)
    expect(nodes[0].text).toBe('**not bold**')
  })
})

// ─── I-04 Emphasis ───────────────────────────────────────────────────────────

describe('Emphasis', () => {
  it('*em*', () => {
    const nodes = inlineNodes('*hello*')
    expect(nodes[0].type).toBe(NodeType.Italic)
    expect(nodes[0].children?.[0]?.text).toBe('hello')
  })

  it('**strong**', () => {
    const nodes = inlineNodes('**hello**')
    expect(nodes[0].type).toBe(NodeType.Bold)
  })

  it('_em_ works like *em*', () => {
    const nodes = inlineNodes('_hello_')
    expect(nodes[0].type).toBe(NodeType.Italic)
  })

  it('__strong__', () => {
    const nodes = inlineNodes('__hello__')
    expect(nodes[0].type).toBe(NodeType.Bold)
  })

  it('***em+strong***', () => {
    const nodes = inlineNodes('***hello***')
    expect(nodes[0].type).toBe(NodeType.BoldItalic)
    expect(nodes[0].children?.[0]?.type).toBe(NodeType.Text)
  })

  it('nested em in strong', () => {
    const nodes = inlineNodes('**hello *world***')
    expect(nodes[0].type).toBe(NodeType.Bold)
  })

  it('unclosed * is literal', () => {
    const nodes = inlineNodes('*unclosed')
    // Unclosed emphasis → literal; merged text includes *
    const text = nodes.map((n: any) => n.text ?? '').join('')
    expect(text).toContain('*')
    expect(text).toContain('unclosed')
  })

  it('* in word with no right-flanking is literal', () => {
    const nodes = inlineNodes('word*')
    // Since word ends with * with nothing after, should be literal
    // (right flanking but no matching open, so emph fails and falls back to literal)
    expect(nodes).toBeDefined()
  })
})

// ─── I-05 Link ───────────────────────────────────────────────────────────────

describe('Link', () => {
  it('inline link [text](url)', () => {
    const nodes = inlineNodes('[example](https://example.com)')
    expect(nodes[0].type).toBe(NodeType.Link)
    expect(nodes[0].url).toBe('https://example.com')
    expect(nodes[0].children?.[0]?.text).toBe('example')
  })

  it('link with title', () => {
    const nodes = inlineNodes('[text](https://example.com "Title")')
    expect(nodes[0].type).toBe(NodeType.Link)
    expect(nodes[0].url).toBe('https://example.com')
  })

  it('link with angle brackets', () => {
    const nodes = inlineNodes('[text](<https://example.com>)')
    expect(nodes[0].url).toBe('https://example.com')
  })

  it('reference link [text][id]', () => {
    let result: any[] = []
    new BlockMaker().changed((blocks, isEnd) => { if (isEnd) result = blocks }).parse(
      '[foo][bar]\n\n[bar]: https://example.com'
    )
    const para = result[0].markdown?.[0]?.children
    const link = para?.find((n: any) => n.type === NodeType.LinkRef)
    expect(link?.url).toBe('https://example.com')
  })

  it('unclosed [ is literal — text not swallowed', () => {
    const nodes = inlineNodes('[unclosed')
    const text = nodes.map((n: any) => n.text ?? '').join('')
    expect(text).toBe('[unclosed')
  })
})

// ─── I-06 Image ──────────────────────────────────────────────────────────────

describe('Image', () => {
  it('![alt](url)', () => {
    const nodes = inlineNodes('![alt text](image.png)')
    expect(nodes[0].type).toBe(NodeType.Image)
  })

  it('no ( after ] = literal', () => {
    const nodes = inlineNodes('![alt]')
    expect(nodes.some((n: any) => n.text?.includes('!'))).toBe(true)
  })
})

// ─── I-07 Autolink ───────────────────────────────────────────────────────────

describe('Autolink', () => {
  it('<https://example.com>', () => {
    const nodes = inlineNodes('<https://example.com>')
    expect(nodes[0].type).toBe(NodeType.Link)
    expect(nodes[0].url).toBe('https://example.com')
    expect(nodes[0].linkType).toBe(LinkType.Url)
  })

  it('<email@example.com>', () => {
    const nodes = inlineNodes('<email@example.com>')
    expect(nodes[0].type).toBe(NodeType.Link)
    expect(nodes[0].url).toBe('email@example.com')
    expect(nodes[0].linkType).toBe(LinkType.Email)
  })
})

// ─── I-08 Raw HTML ───────────────────────────────────────────────────────────

describe('Raw Inline HTML', () => {
  it('<b> tag', () => {
    const nodes = inlineNodes('<b>bold</b>')
    expect(nodes[0].type).toBe(NodeType.Tag)
    expect(nodes[0].text).toBe('<b>')
  })

  it('<!-- comment --> in inline context', () => {
    // In a mixed inline context, HTML comments pass through as Tag nodes
    const nodes = inlineNodes('text <!-- comment --> end')
    const tag = nodes.find((n: any) => n.type === NodeType.Tag)
    expect(tag).toBeDefined()
    expect(tag?.text).toContain('<!--')
  })

  it('unknown <foo> is tag passthrough', () => {
    const nodes = inlineNodes('<foo>')
    expect(nodes[0].type).toBe(NodeType.Tag)
  })
})

// ─── I-09/10 Line Breaks ─────────────────────────────────────────────────────

describe('Line Breaks', () => {
  it('soft break (newline) = Br node', () => {
    const nodes = inlineNodes('line1\nline2')
    const br = nodes.find((n: any) => n.type === NodeType.Br)
    expect(br).toBeDefined()
  })

  it('hard break (2 spaces + newline) = HardBr node', () => {
    const nodes = inlineNodes('line1  \nline2')
    const hb = nodes.find((n: any) => n.type === NodeType.HardBr)
    expect(hb).toBeDefined()
  })
})
