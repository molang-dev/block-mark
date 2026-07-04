# blockmark

A progressive Markdown parser with a plugin architecture, supporting CommonMark and GFM.

- **Progressive parsing** — large documents stream blocks as they're parsed, no waiting for completion
- **Incremental updates** — character-level `update()` re-parses only the affected range, minimizing re-renders
- **Plugin-based** — the core handles CommonMark only; GFM, HTML rendering, Mermaid, etc. are opt-in plugins
- **Zero dependencies** — TypeScript, ships as ESM / CJS / `.d.ts`

[中文文档](README-zh.md)

---

## Installation

```bash
npm install blockmark
```

---

## Quick Start

```typescript
import { BlockMaker, blockMakerGFM, blockMakerHtml } from 'blockmark'

const bm = new BlockMaker()
  .use(blockMakerGFM)
  .use(blockMakerHtml)
  .changed((blocks, isEnd) => {
    for (const block of blocks) {
      console.log(block.type, block.html)
    }
  })
  .parse('# Hello\n\n> GFM blockquote')
```

---

## API

### `new BlockMaker(options?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `showTypeName` | `boolean` | `false` | Writes a human-readable type name onto every block (`block.typeName`) and node (`node.typeName`). Useful for debugging. |
| `disableIndentedCode` | `boolean` | `false` | When `true`, 4-space / tab-indented code blocks are not recognized. Only fenced code (` ``` ` / `~~~`) is treated as code. |
| `batchSizes` | `number[]` | `[400,800,1600,3200]` | Number of blocks delivered per `changed()` call. The last value repeats once the array is exhausted. |

### `.use(plugin)`

Register a plugin. Returns `this` for chaining. Plugins are applied in registration order; rules of the same kind are sorted by ascending `priority` (lower = tried first).

### `.changed(fn)`

Register a callback `(blocks: Block[], isEnd: boolean) => void`. Returns `this`.

- `blocks` — the blocks added or changed in this batch
- `isEnd` — `true` on the final batch of a `parse()` / `update()` call

### `.parse(md: string)`

Parse a full string, firing `changed()` in batches. Returns `this`.

### `.readFile(filename: string)`

Progressively read a file (Node.js, synchronous). Returns `Error | undefined` (`undefined` = success).

### `.update(row1, col1, row2, col2, content)`

Character-level incremental update: replaces the range `(row1,col1)→(row2,col2)` with `content`. Only the affected blocks are re-parsed; `changed()` receives the dirty blocks.

```typescript
// Insert a newline at the start of row 3
bm.update(3, 0, 3, 0, '\n')

// Delete columns 2–8 on row 5
bm.update(5, 2, 5, 8, '')
```

### `.allBlocks()`

Returns all current blocks as `Block[]`.

### `.findBlocks(start, end)`

Returns all blocks that overlap the line range `[start, end]`. Arguments are swapped automatically if `start > end`.

### `.applyTheme(theme: string)`

Broadcasts a theme string to every registered plugin (triggers each plugin's `applyTheme` hook). Returns `this`.

---

## Block Structure

```typescript
interface Block {
  type: number        // BlockType value or a plugin enum value
  typeName?: string   // Set when showTypeName:true, e.g. 'Heading', 'Table'
  lines: string[]     // Raw source lines; empty lines kept as ""; includes absorbed trailing blanks
  id: number          // Stable unique id (starts at 1); id is preserved across update() shifts
  order: number       // Index in allBlocks(); reassigned after every update()
  lineStart: number   // 0-based line number of lines[0] in the document
  lineEnd: number     // = lineStart + lines.length - 1
  dirty: DirtyFlag    // 0 = unchanged, 1 = position shifted, 2 = content changed
  depth?: number      // Heading only: 1–6
  meta?: string       // Plugin-specific payload: code language, table alignment JSON, alert type, etc.
  markdown?: Node[]   // Inline AST written by the block processor
  html?: string       // HTML string written by the htmlBlock renderer
}

enum DirtyFlag { Clean = 0, Shifted = 1, Changed = 2 }
```

### Core BlockType values

| Constant | Value | Description |
|----------|-------|-------------|
| `BlockType.Heading` | 101001 | ATX or Setext heading; `block.depth` = 1–6 |
| `BlockType.Paragraph` | 101002 | Paragraph |
| `BlockType.List` | 101003 | Ordered or unordered list |
| `BlockType.Code` | 101004 | Fenced or indented code block; `block.meta` = language |
| `BlockType.Blockquote` | 101005 | Block quote |
| `BlockType.Hr` | 101006 | Thematic break |
| `BlockType.Html` | 101007 | Raw HTML block |
| `BlockType.Def` | 101008 | Link reference definition `[id]: url` |
| `BlockType.Toc` | 101009 | `[toc]` table-of-contents placeholder |

---

## Inline Table of Contents — `[toc]`

Write `[toc]` (case-insensitive) alone on a line anywhere in the document. It becomes a real `BlockType.Toc` block at that position.

With `blockMakerHtml` loaded, `block.html` is automatically populated with a `<nav>` tree of anchor links to all headings. Heading elements receive `id="bmd-h-{id}"`.

```markdown
# Article Title

[toc]

## Section One
## Section Two
```

Multiple `[toc]` blocks are supported; all receive the same nav HTML.

---

## Plugins

All plugins are imported from the main package:

```typescript
import {
  blockMakerGFM, blockMakerHtml, blockMakerCode,
  blockMakerMermaid, blockMakerMath, blockMakerThemeCss,
  blockMakerDom, blockMakerFrontMatter
} from 'blockmark'
```

---

### `blockMakerGFM`

Enables GitHub Flavored Markdown extensions. **Register before other plugins.**

| Extension | Syntax | Block / Node type |
|-----------|--------|-------------------|
| Table | `\| A \| B \|` + separator row | `GFMBlockType.Table = 111001` |
| Footnote definition | `[^id]: content` | `GFMBlockType.FootnoteDef = 111002` |
| Math block | `$$\n...\n$$` | `GFMBlockType.MathBlock = 111003` |
| Alert block | `> [!NOTE/TIP/WARNING/CAUTION/IMPORTANT]` | `GFMBlockType.Alert = 111004` |
| Strikethrough | `~~text~~` | `GFMNodeType.Del = 112001` |
| Task checkbox | `- [x]` / `- [ ]` | `GFMNodeType.Checkbox = 112002` |
| Footnote reference | `[^id]` | `GFMNodeType.FootnoteRef = 112006` |
| Inline math | `$x^2$` | `GFMNodeType.MathInline = 112008` |
| Emoji | `:smile:` | `GFMNodeType.Emoji = 112010` |

```typescript
import { BlockMaker, blockMakerGFM, GFMBlockType } from 'blockmark'

const bm = new BlockMaker()
  .use(blockMakerGFM)
  .changed((blocks) => {
    const tables = blocks.filter(b => b.type === GFMBlockType.Table)
  })
  .parse('| A | B |\n|---|---|\n| 1 | 2 |')
```

---

### `blockMakerHtml`

Generates `block.html` for every block. **Requires `blockMakerGFM` to be registered first if GFM syntax should be rendered.**

```typescript
const bm = new BlockMaker()
  .use(blockMakerGFM)
  .use(blockMakerHtml)
  .changed((blocks) => {
    const html = blocks.map(b => b.html ?? '').join('')
    document.getElementById('preview')!.innerHTML = html
  })
  .parse(md)
```

---

### `blockMakerCode(highlight)`

Syntax highlighting plugin. Accepts a highlight function that returns an HTML string, or `null` to fall back to plain-text (auto-escaped).

```typescript
import hljs from 'highlight.js'
import { blockMakerCode } from 'blockmark'

const highlight = (code: string, lang: string) =>
  lang && hljs.getLanguage(lang)
    ? hljs.highlight(code, { language: lang }).value
    : null

const bm = new BlockMaker()
  .use(blockMakerGFM)
  .use(blockMakerHtml)
  .use(blockMakerCode(highlight))
  .parse(md)
```

---

### `blockMakerMermaid(config?)`

Parses ` ```mermaid ` fenced blocks into `MermaidBlockType.Diagram = 121001`. The HTML output is `<pre class="mermaid" data-source="...">` for Mermaid.js to render.

| Parameter | Type | Description |
|-----------|------|-------------|
| `config.mermaid` | Mermaid instance | When provided, `applyTheme()` calls `mermaid.initialize()` and re-renders diagrams. |

```typescript
import mermaid from 'mermaid'
import { blockMakerMermaid } from 'blockmark'

const bm = new BlockMaker()
  .use(blockMakerGFM)
  .use(blockMakerMermaid({ mermaid }))
  .use(blockMakerHtml)
  .parse(md)
```

---

### `blockMakerMath`

Wraps GFM math nodes in HTML ready for KaTeX / MathJax:
- `MathBlock` → `<div class="math-display">$$...$$</div>`
- `MathInline` → `<span class="math-inline">$...$</span>`

**Must be registered after `blockMakerGFM` and before `blockMakerHtml`.**

```typescript
import { blockMakerGFM, blockMakerMath, blockMakerHtml } from 'blockmark'
import renderMathInElement from 'katex/contrib/auto-render'

const bm = new BlockMaker()
  .use(blockMakerGFM)
  .use(blockMakerMath)
  .use(blockMakerHtml)
  .changed((_, isEnd) => {
    if (isEnd) renderMathInElement(document.getElementById('preview')!, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$',  right: '$',  display: false },
      ],
    })
  })
  .parse(md)
```

---

### `blockMakerThemeCss({ id, light, dark })`

Switches CSS themes at runtime by creating or replacing a `<link id="{id}">` element.

| Parameter | Description |
|-----------|-------------|
| `id` | The `id` of the `<link>` element. Multiple calls with the same `id` replace each other. |
| `light` | URL of the light-theme CSS file |
| `dark` | URL of the dark-theme CSS file |

```typescript
import lightUrl from './light.css?url'
import darkUrl  from './dark.css?url'
import { blockMakerThemeCss } from 'blockmark'

const bm = new BlockMaker()
  .use(blockMakerThemeCss({ id: 'blockmark-theme', light: lightUrl, dark: darkUrl }))
  .parse(md)

bm.applyTheme('dark')   // switches to dark CSS
bm.applyTheme('light')  // switches back
```

---

### `blockMakerDom({ id })`

Framework-agnostic incremental DOM renderer. Place an empty container in your HTML:

```html
<div id="bmd-preview"></div>
```

The plugin maintains the container's children via the `onChanged` hook:
- Removes DOM nodes for `deletedIds`
- Updates `innerHTML` only for `dirty=2` blocks
- Leaves `dirty=0/1` blocks untouched (preserves Mermaid SVGs, KaTeX output, etc.)
- Re-orders children to match `allBlocks()` order

```typescript
import { blockMakerDom } from 'blockmark'

const bm = new BlockMaker()
  .use(blockMakerGFM)
  .use(blockMakerHtml)
  .use(blockMakerDom({ id: 'bmd-preview' }))
  .parse(md)

// Subsequent update() calls patch the DOM incrementally
bm.update(row1, col1, row2, col2, newText)
```

---

### `blockMakerFrontMatter`

Parses a YAML front matter block at the very start of the document (between `---` delimiters, or `---` / `...`).

The parsed result is JSON-serialized into `block.meta`. The block renders as `html = ''` — nothing is output to the document.

**Built-in YAML support:** strings, quoted strings, numbers, booleans, `null` / `~`, inline arrays `[a, b]`, block sequences `- item`, comment lines (`#`).

```typescript
import { blockMakerFrontMatter, FrontMatterBlockType } from 'blockmark'

const bm = new BlockMaker()
  .use(blockMakerFrontMatter)
  .changed((_, isEnd) => {
    if (!isEnd) return
    const fm = bm.allBlocks().find(b => b.type === FrontMatterBlockType.FrontMatter)
    if (fm) {
      const meta = JSON.parse(fm.meta!)
      console.log(meta.title, meta.date, meta.tags)
    }
  })
  .parse(`---
title: My Article
date: 2024-01-15
tags: [vue, markdown]
draft: false
---

# Body
`)
```

---

## Typical Setup

### Full blog renderer

```typescript
import {
  BlockMaker,
  blockMakerFrontMatter,
  blockMakerGFM,
  blockMakerMermaid,
  blockMakerMath,
  blockMakerHtml,
  blockMakerCode,
  blockMakerThemeCss,
  blockMakerDom,
} from 'blockmark'
import mermaid from 'mermaid'
import hljs from 'highlight.js'
import lightUrl from 'blockmark/light.css?url'
import darkUrl  from 'blockmark/dark.css?url'

const bm = new BlockMaker()
  .use(blockMakerFrontMatter)
  .use(blockMakerGFM)
  .use(blockMakerMermaid({ mermaid }))
  .use(blockMakerMath)
  .use(blockMakerHtml)
  .use(blockMakerCode((code, lang) =>
    lang && hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang }).value : null
  ))
  .use(blockMakerThemeCss({ id: 'blockmark-theme', light: lightUrl, dark: darkUrl }))
  .use(blockMakerDom({ id: 'preview' }))
  .parse(md)
```

---

## Build & Test

```bash
npm run build   # tsup → dist/
npm test        # vitest run
```
