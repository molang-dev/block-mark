import { describe, it, expect } from 'vitest'
import { BlockMaker } from '../../src/core/BlockMaker'
import { BlockType, NodeType } from '../../src/core/types'
import { blockMakerGFM, GFMBlockType, GFMNodeType } from '../../src/plugins/gfm'
import { blockMakerMermaid, MermaidBlockType } from '../../src/plugins/mermaid'

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

function parseMermaid(md: string) {
  let result: any[] = []
  new BlockMaker().use(blockMakerMermaid()).changed((blocks, isEnd) => { if (isEnd) result = blocks }).parse(md)
  return result
}

function lastNode(block: any): any {
  const md: any[] = block.markdown ?? []
  return md[md.length - 1]
}

// ─── Trailing blank → Br ─────────────────────────────────────────────────────

describe('Trailing blank → Br node in block.markdown', () => {

  // ─── ATX Heading ─────────────────────────────────────────────────────────────

  describe('ATX Heading', () => {
    it('trailing blank absorbed → # stripped, last node Br', () => {
      const [h1, h2] = parse('# H1\n\n# H2')
      expect(h1.type).toBe(BlockType.Heading)
      expect(h1.lineStart).toBe(0);  expect(h1.lineEnd).toBe(1)
      expect(h1.markdown.length).toBe(2)
      expect(h1.markdown[0].type).toBe(NodeType.Heading)
      expect(h1.markdown[0].children[0].text).toBe('H1')
      expect(lastNode(h1).type).toBe(NodeType.Br)
    })

    it('no trailing blank → single Heading node, no Br', () => {
      const [h1] = parse('# H1\n# H2')
      expect(h1.type).toBe(BlockType.Heading)
      expect(h1.lineStart).toBe(0);  expect(h1.lineEnd).toBe(0)
      expect(h1.markdown.length).toBe(1)
      expect(h1.markdown[0].type).toBe(NodeType.Heading)
      expect(h1.markdown[0].children[0].text).toBe('H1')
    })
  })

  // ─── Setext Heading ──────────────────────────────────────────────────────────

  describe('Setext Heading', () => {
    it('trailing blank absorbed → text correct, last node Br', () => {
      const [h1, h2] = parse('Title\n=====\n\n# H2')
      expect(h1.type).toBe(BlockType.Heading)
      expect(h1.lineStart).toBe(0);  expect(h1.lineEnd).toBe(2)  // "Title"(0) "====="(1) ""(2)
      expect(h1.markdown.length).toBe(2)
      expect(h1.markdown[0].type).toBe(NodeType.Heading)
      expect(h1.markdown[0].depth).toBe(1)
      expect(h1.markdown[0].children[0].text).toBe('Title')
      expect(lastNode(h1).type).toBe(NodeType.Br)
    })

    it('no trailing blank → single Heading node, no Br', () => {
      const [h1] = parse('Title\n=====')
      expect(h1.type).toBe(BlockType.Heading)
      expect(h1.lineStart).toBe(0);  expect(h1.lineEnd).toBe(1)
      expect(h1.markdown.length).toBe(1)
      expect(h1.markdown[0].type).toBe(NodeType.Heading)
      expect(h1.markdown[0].children[0].text).toBe('Title')
    })
  })

  // ─── Paragraph ───────────────────────────────────────────────────────────────

  describe('Paragraph', () => {
    it('trailing blank absorbed → text correct, last node Br', () => {
      const [para, h2] = parse('hello\n\n# H2')
      expect(para.type).toBe(BlockType.Paragraph)
      expect(para.lineStart).toBe(0);  expect(para.lineEnd).toBe(1)  // "hello"(0) ""(1)
      expect(para.markdown.length).toBe(2)
      expect(para.markdown[0].type).toBe(NodeType.Paragraph)
      expect(para.markdown[0].children[0].text).toBe('hello')
      expect(lastNode(para).type).toBe(NodeType.Br)
    })

    it('no trailing blank → single Paragraph node, no Br', () => {
      const [para] = parse('hello')
      expect(para.type).toBe(BlockType.Paragraph)
      expect(para.lineStart).toBe(0);  expect(para.lineEnd).toBe(0)
      expect(para.markdown.length).toBe(1)
      expect(para.markdown[0].type).toBe(NodeType.Paragraph)
      expect(para.markdown[0].children[0].text).toBe('hello')
    })
  })

  // ─── Fenced Code ─────────────────────────────────────────────────────────────

  describe('Fenced Code', () => {
    it('trailing blank absorbed → text/lang correct, closing fence excluded, last node Br', () => {
      const [code, h2] = parse('```js\nfoo\n```\n\n# H2')
      expect(code.type).toBe(BlockType.Code)
      expect(code.lineStart).toBe(0);  expect(code.lineEnd).toBe(3)  // "```js"(0) "foo"(1) "```"(2) ""(3)
      expect(code.markdown.length).toBe(2)
      expect(code.markdown[0].type).toBe(NodeType.Code)
      expect(code.markdown[0].text).toBe('foo')
      expect(code.markdown[0].lang).toBe('js')
      expect(lastNode(code).type).toBe(NodeType.Br)
    })

    it('no trailing blank → single Code node, closing fence excluded, no Br', () => {
      const [code] = parse('```js\nfoo\n```')
      expect(code.type).toBe(BlockType.Code)
      expect(code.lineStart).toBe(0);  expect(code.lineEnd).toBe(2)
      expect(code.markdown.length).toBe(1)
      expect(code.markdown[0].type).toBe(NodeType.Code)
      expect(code.markdown[0].text).toBe('foo')
      expect(code.markdown[0].lang).toBe('js')
    })
  })

  // ─── Indented Code ───────────────────────────────────────────────────────────

  describe('Indented Code', () => {
    it('trailing blank absorbed → indent stripped, last node Br', () => {
      const [code, h2] = parse('    foo\n\n# H2')
      expect(code.type).toBe(BlockType.Code)
      expect(code.lineStart).toBe(0);  expect(code.lineEnd).toBe(1)  // "    foo"(0) ""(1)
      expect(code.markdown.length).toBe(2)
      expect(code.markdown[0].type).toBe(NodeType.Code)
      expect(code.markdown[0].text).toBe('foo')
      expect(lastNode(code).type).toBe(NodeType.Br)
    })

    it('no trailing blank → single Code node, no Br', () => {
      const [code] = parse('    foo')
      expect(code.type).toBe(BlockType.Code)
      expect(code.lineStart).toBe(0);  expect(code.lineEnd).toBe(0)
      expect(code.markdown.length).toBe(1)
      expect(code.markdown[0].type).toBe(NodeType.Code)
      expect(code.markdown[0].text).toBe('foo')
    })
  })

  // ─── Blockquote ──────────────────────────────────────────────────────────────

  describe('Blockquote', () => {
    it('trailing blank absorbed → Blockquote content correct, last node Br', () => {
      const [bq, h2] = parse('> text\n\n# H2')
      expect(bq.type).toBe(BlockType.Blockquote)
      expect(bq.lineStart).toBe(0);  expect(bq.lineEnd).toBe(1)  // "> text"(0) ""(1)
      expect(bq.markdown.length).toBe(2)
      expect(bq.markdown[0].type).toBe(NodeType.Blockquote)
      expect(lastNode(bq).type).toBe(NodeType.Br)
    })

    it('no trailing blank → single Blockquote node, no Br', () => {
      const [bq] = parse('> text')
      expect(bq.type).toBe(BlockType.Blockquote)
      expect(bq.lineStart).toBe(0);  expect(bq.lineEnd).toBe(0)
      expect(bq.markdown.length).toBe(1)
      expect(bq.markdown[0].type).toBe(NodeType.Blockquote)
    })
  })

  // ─── List ────────────────────────────────────────────────────────────────────

  describe('List', () => {
    it('trailing blank absorbed (via list collector) → List content correct, last node Br', () => {
      const [list, h2] = parse('- item\n\n# H2')
      expect(list.type).toBe(BlockType.List)
      expect(list.lineStart).toBe(0);  expect(list.lineEnd).toBe(1)  // "- item"(0) ""(1)
      expect(list.markdown.length).toBe(2)
      expect(list.markdown[0].type).toBe(NodeType.List)
      expect(lastNode(list).type).toBe(NodeType.Br)
    })

    it('no trailing blank → single List node, no Br', () => {
      const [list] = parse('- item\n- item2')
      expect(list.type).toBe(BlockType.List)
      expect(list.lineStart).toBe(0)
      expect(list.markdown.length).toBe(1)
      expect(list.markdown[0].type).toBe(NodeType.List)
    })
  })

  // ─── Hr ──────────────────────────────────────────────────────────────────────

  describe('Hr', () => {
    it('trailing blank absorbed → Hr node + Br', () => {
      const [hr, h2] = parse('---\n\n# H2')
      expect(hr.type).toBe(BlockType.Hr)
      expect(hr.lineStart).toBe(0);  expect(hr.lineEnd).toBe(1)  // "---"(0) ""(1)
      expect(hr.markdown.length).toBe(2)
      expect(hr.markdown[0].type).toBe(NodeType.Hr)
      expect(lastNode(hr).type).toBe(NodeType.Br)
    })

    it('no trailing blank → single Hr node, no Br', () => {
      const [hr] = parse('---')
      expect(hr.type).toBe(BlockType.Hr)
      expect(hr.lineStart).toBe(0);  expect(hr.lineEnd).toBe(0)
      expect(hr.markdown.length).toBe(1)
      expect(hr.markdown[0].type).toBe(NodeType.Hr)
    })
  })

  // ─── Html Block ──────────────────────────────────────────────────────────────

  describe('Html Block', () => {
    it('trailing blank absorbed → Html text excludes blank, last node Br', () => {
      const [html, h2] = parse('<div></div>\n\n# H2')
      expect(html.type).toBe(BlockType.Html)
      expect(html.lineStart).toBe(0);  expect(html.lineEnd).toBe(1)  // "<div></div>"(0) ""(1)
      expect(html.markdown.length).toBe(2)
      expect(html.markdown[0].type).toBe(NodeType.Html)
      expect(html.markdown[0].text).toBe('<div></div>')
      expect(lastNode(html).type).toBe(NodeType.Br)
    })

    it('no trailing blank → single Html node, no Br', () => {
      const [html] = parse('<div></div>')
      expect(html.type).toBe(BlockType.Html)
      expect(html.lineStart).toBe(0);  expect(html.lineEnd).toBe(0)
      expect(html.markdown.length).toBe(1)
      expect(html.markdown[0].type).toBe(NodeType.Html)
      expect(html.markdown[0].text).toBe('<div></div>')
    })
  })

  // ─── GFM Table ───────────────────────────────────────────────────────────────

  describe('GFM Table', () => {
    const TABLE = '| A | B |\n|---|---|\n| 1 | 2 |'

    it('trailing blank absorbed → Table content correct, last node Br', () => {
      const [table, h2] = parseGFM(TABLE + '\n\n# H2')
      expect(table.type).toBe(GFMBlockType.Table)
      expect(table.lineStart).toBe(0);  expect(table.lineEnd).toBe(3)  // 3 table lines(0-2) + ""(3)
      expect(table.markdown.length).toBe(2)
      expect(table.markdown[0].type).toBe(GFMNodeType.Table)
      expect(table.markdown[0].children.length).toBe(2)  // header row + 1 body row
      expect(lastNode(table).type).toBe(NodeType.Br)
    })

    it('no trailing blank → single Table node, no Br', () => {
      const [table] = parseGFM(TABLE)
      expect(table.type).toBe(GFMBlockType.Table)
      expect(table.lineStart).toBe(0);  expect(table.lineEnd).toBe(2)
      expect(table.markdown.length).toBe(1)
      expect(table.markdown[0].type).toBe(GFMNodeType.Table)
      expect(table.markdown[0].children.length).toBe(2)
    })
  })

  // ─── Link Reference Def ──────────────────────────────────────────────────────

  describe('Link Reference Def', () => {
    it('trailing blank absorbed → Def node + Br', () => {
      const [def, h2] = parse('[ref]: https://example.com\n\n# H2')
      expect(def.type).toBe(BlockType.Def)
      expect(def.lineStart).toBe(0);  expect(def.lineEnd).toBe(1)  // "[ref]:..."(0) ""(1)
      expect(def.markdown.length).toBe(2)
      expect(def.markdown[0].type).toBe(NodeType.Def)
      expect(lastNode(def).type).toBe(NodeType.Br)
    })

    it('no trailing blank → single Def node, no Br', () => {
      const [def] = parse('[ref]: https://example.com')
      expect(def.type).toBe(BlockType.Def)
      expect(def.lineStart).toBe(0);  expect(def.lineEnd).toBe(0)
      expect(def.markdown.length).toBe(1)
      expect(def.markdown[0].type).toBe(NodeType.Def)
    })
  })

  // ─── GFM Footnote Definition ─────────────────────────────────────────────────

  describe('GFM FootnoteDef', () => {
    it('trailing blank absorbed → FootnoteDef node + Br', () => {
      const [fn, h2] = parseGFM('[^1]: hello\n\n# H2')
      expect(fn.type).toBe(GFMBlockType.FootnoteDef)
      expect(fn.lineStart).toBe(0);  expect(fn.lineEnd).toBe(1)  // "[^1]:..."(0) ""(1)
      expect(fn.markdown.length).toBe(2)
      expect(fn.markdown[0].type).toBe(GFMNodeType.FootnoteDef)
      expect(lastNode(fn).type).toBe(NodeType.Br)
    })

    it('no trailing blank → single FootnoteDef node, no Br', () => {
      const [fn] = parseGFM('[^1]: hello')
      expect(fn.type).toBe(GFMBlockType.FootnoteDef)
      expect(fn.lineStart).toBe(0);  expect(fn.lineEnd).toBe(0)
      expect(fn.markdown.length).toBe(1)
      expect(fn.markdown[0].type).toBe(GFMNodeType.FootnoteDef)
    })
  })

  // ─── GFM MathBlock ───────────────────────────────────────────────────────────

  describe('GFM MathBlock', () => {
    it('trailing blank absorbed → formula correct (no closing $$), last node Br', () => {
      const [math, h2] = parseGFM('$$\nE=mc^2\n$$\n\n# H2')
      expect(math.type).toBe(GFMBlockType.MathBlock)
      expect(math.lineStart).toBe(0);  expect(math.lineEnd).toBe(3)  // "$$"(0) "E=mc^2"(1) "$$"(2) ""(3)
      expect(math.markdown.length).toBe(2)
      expect(math.markdown[0].type).toBe(GFMNodeType.MathBlock)
      expect(math.markdown[0].text).toBe('E=mc^2')
      expect(lastNode(math).type).toBe(NodeType.Br)
    })

    it('no trailing blank → single MathBlock node, formula correct, no Br', () => {
      const [math] = parseGFM('$$\nE=mc^2\n$$')
      expect(math.type).toBe(GFMBlockType.MathBlock)
      expect(math.lineStart).toBe(0);  expect(math.lineEnd).toBe(2)
      expect(math.markdown.length).toBe(1)
      expect(math.markdown[0].type).toBe(GFMNodeType.MathBlock)
      expect(math.markdown[0].text).toBe('E=mc^2')
    })
  })

  // ─── GFM Alert ───────────────────────────────────────────────────────────────

  describe('GFM Alert', () => {
    it('trailing blank absorbed → Alert node correct (no blank in content), last node Br', () => {
      const [alert, h2] = parseGFM('> [!NOTE]\n> text\n\n# H2')
      expect(alert.type).toBe(GFMBlockType.Alert)
      expect(alert.lineStart).toBe(0);  expect(alert.lineEnd).toBe(2)  // "[!NOTE]"(0) "> text"(1) ""(2)
      expect(alert.markdown.length).toBe(2)
      expect(alert.markdown[0].type).toBe(GFMNodeType.Alert)
      expect(alert.markdown[0].meta).toBe('note')
      expect(alert.markdown[0].children[0].type).toBe(GFMNodeType.AlertTitle)
      expect(lastNode(alert).type).toBe(NodeType.Br)
    })

    it('no trailing blank → single Alert node, no Br', () => {
      const [alert] = parseGFM('> [!NOTE]\n> text')
      expect(alert.type).toBe(GFMBlockType.Alert)
      expect(alert.lineStart).toBe(0);  expect(alert.lineEnd).toBe(1)
      expect(alert.markdown.length).toBe(1)
      expect(alert.markdown[0].type).toBe(GFMNodeType.Alert)
    })
  })

  // ─── Mermaid Diagram ─────────────────────────────────────────────────────────

  describe('Mermaid Diagram', () => {
    it('trailing blank absorbed → html correct (no closing fence), lineEnd includes blank', () => {
      const [mermaid, h2] = parseMermaid('```mermaid\ngraph TD\nA-->B\n```\n\n# H2')
      expect(mermaid.type).toBe(MermaidBlockType.Diagram)
      expect(mermaid.lineStart).toBe(0);  expect(mermaid.lineEnd).toBe(4)  // "```mermaid"(0) "graph TD"(1) "A-->B"(2) "```"(3) ""(4)
      expect(mermaid.markdown).toBeUndefined()
      expect(mermaid.html).toContain('graph TD')
      expect(mermaid.html).toContain('A--&gt;B')
      expect(mermaid.html).not.toContain('```')
    })

    it('no trailing blank → html correct, no closing fence', () => {
      const [mermaid] = parseMermaid('```mermaid\ngraph TD\nA-->B\n```')
      expect(mermaid.type).toBe(MermaidBlockType.Diagram)
      expect(mermaid.lineStart).toBe(0);  expect(mermaid.lineEnd).toBe(3)
      expect(mermaid.html).toContain('graph TD')
      expect(mermaid.html).not.toContain('```')
    })
  })

})
