# BlockMaker

渐进式 Markdown 解析器，插件化架构，支持 CommonMark + GFM。

---

## 特性

- **渐进式解析**：大文档边解析边通知，无需等待全部完成
- **增量更新**：字符级 `update()` 精确重解析受影响块，最小化重渲染
- **插件化**：核心只解析 CommonMark，GFM / HTML 渲染均为可选插件
- **可扩展**：用 `BlockMakerPlugin` 接口编写自定义语法（见[插件开发指南](docs/plugin-api.md)）
- **零依赖**，TypeScript 实现，同时输出 ESM / CJS / `.d.ts`

---

## 安装

```bash
npm install blockmark
```

---

## 快速上手

### 基础用法（CommonMark）

```typescript
import { BlockMaker } from 'blockmark'

const bm = new BlockMaker()
  .changed((blocks, isEnd) => {
    for (const block of blocks) {
      console.log(block.type, block.lines)
    }
    if (isEnd) console.log('解析完成')
  })
  .parse('# Hello\n\nWorld')
```

### GFM + HTML 渲染

```typescript
import { BlockMaker } from 'blockmark'
import { blockMakerGFM } from 'blockmark/plugins/gfm'
import { blockMakerHtml } from 'blockmark/plugins/html'

const bm = new BlockMaker()
  .use(blockMakerGFM)    // 启用 GFM：表格、删除线、Task List、脚注等
  .use(blockMakerHtml)   // 启用 HTML 渲染：block.html 字段
  .changed((blocks, isEnd) => {
    for (const block of blocks) {
      console.log(block.html)
    }
  })
  .parse(`
# Title

| Name | Age |
|------|-----|
| Alice | 30 |

- [x] done
- [ ] todo

~~deleted~~
  `)
```

### 从文件渐进式读取

```typescript
const bm = new BlockMaker()
  .use(blockMakerGFM)
  .use(blockMakerHtml)
  .changed((blocks, isEnd) => { /* ... */ })
  .parseFile('./document.md')   // 同步分批读取，边读边通知
```

### 增量更新

```typescript
const bm = new BlockMaker()
  .use(blockMakerGFM)
  .use(blockMakerHtml)
  .changed((dirtyBlocks, isEnd) => {
    // 只收到内容或位置有变化的块
    for (const block of dirtyBlocks) {
      console.log(block.dirty, block.html)
    }
  })

bm.parse(initialContent)

// 用户编辑：将 row=2, col=5 到 row=2, col=10 替换为 'new text'
bm.update(2, 5, 2, 10, 'new text')
```

### debug 模式（查看类型名）

```typescript
const bm = new BlockMaker({ showTypeName: true })
  .use(blockMakerGFM)
  .changed((blocks) => {
    for (const b of blocks) {
      console.log(b.typeName)    // 'Heading' | 'Paragraph' | 'Table' | ...
      for (const node of b.markdown ?? []) {
        console.log('  ', node.typeName)  // 'Em' | 'Strong' | 'Link' | ...
      }
    }
  })
  .parse('# Hello *world*')
```

---

## Block 结构

```typescript
interface Block {
  type: number         // BlockType 或插件 enum 值
  typeName?: string    // showTypeName:true 时写入，如 'Heading'
  lines: string[]      // 原始行，空行保留为 ""
  index: number        // 0-based 块序号
  lineStart: number    // 在文档中的起始行号（0-based）
  lineEnd: number
  dirty: DirtyFlag     // 0=干净 1=位置偏移 2=内容变化
  depth?: number       // Heading 专用，1–6
  meta?: string        // 插件扩展字段（如 code lang、alert kind）
  markdown?: Node[]    // 行内 AST（parse-inline 后写入）
  html?: string        // HTML 字符串（blockMakerHtml 插件写入）
}
```

---

## 核心类型（BlockType / NodeType）

```typescript
enum BlockType {
  Heading = 1, Paragraph, List, Code, Blockquote, Hr, Html, Def
}

enum NodeType {
  Text = 1, Em, Strong, Del, Codespan, Link, LinkRef, Image,
  Br, Hr, Heading, Paragraph, Blockquote, List, ListItem,
  Code, Table, TableRow, TableCell, Checkbox, Ref, Escape, Tag, Html
}

enum DirtyFlag {
  Clean = 0, Shifted = 1, Changed = 2
}
```

GFM 类型编号从 100 起，用户自定义从 200 起。

---

## 自定义插件

```typescript
import type { BlockMakerPlugin } from 'blockmark'

// 示例：解析 :::warning ... ::: 告警块
const blockMakerAlert: BlockMakerPlugin = {
  name: 'alert',
  typeNames: { 200: 'Alert' },

  blockRules: [{
    name: 'alert',
    priority: 28,
    tryCollect(lines, at, ctx) {
      const m = lines[at]?.match(/^:{3}(\w+)\s*$/)
      if (!m) return null
      const kind = m[1]
      const body: string[] = []
      let i = at + 1
      while (i < lines.length && lines[i] !== ':::') body.push(lines[i++])
      const allLines = [lines[at], ...body, ...(lines[i] === ':::' ? [':::'] : [])]
      return { type: 200, lines: allLines, meta: kind,
               index: 0, lineStart: ctx.lineStart, lineEnd: 0, dirty: 2 }
    }
  }],

  htmlBlock: {
    200: (block, ctx) =>
      `<div class="bmk-alert bmk-alert-${ctx.escape(block.meta ?? 'info')}">`
      + ctx.renderLines(block.lines.slice(1, -1))
      + `</div>`
  }
}

new BlockMaker()
  .use(blockMakerAlert)
  .use(blockMakerHtml)
  .changed(...)
  .parse(':::warning\n注意！\n:::')
```

详见 [Plugin API 开发指南](docs/plugin-api.md)。

---

## 文档索引

| 文档 | 内容 |
|------|------|
| [docs/commonmark.md](docs/commonmark.md) | CommonMark 语法规范（逐条） |
| [docs/gfm.md](docs/gfm.md) | GFM 扩展规范（逐条） |
| [docs/plugin-api.md](docs/plugin-api.md) | 插件开发指南 + 完整示例 |
| [docs/architecture.md](docs/architecture.md) | 内部架构与设计决策 |

---

## 命令

```bash
npm run build    # tsup → dist/
npm test         # vitest run
```
