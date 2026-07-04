# blockmark

渐进式 Markdown 解析器，插件化架构，支持 CommonMark + GFM。

- **渐进式解析**：大文档边解析边通知，无需等待全部完成
- **增量更新**：字符级 `update()` 精确重解析受影响块，最小化重渲染
- **插件化**：核心只解析 CommonMark，GFM / 渲染 / Mermaid 均为可选插件
- **零依赖**，TypeScript 实现，输出 ESM / CJS / `.d.ts`

---

## 安装

```bash
npm install blockmark
```

---

## 快速上手

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

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `showTypeName` | `boolean` | `false` | 为每个 block / node 写入可读类型名（`block.typeName`、`node.typeName`），便于调试 |
| `disableIndentedCode` | `boolean` | `false` | `true` 时关闭 4 空格/Tab 缩进代码块识别，仅识别 fenced code（` ``` ` / `~~~`） |
| `batchSizes` | `number[]` | `[400,800,1600,3200]` | `changed()` 每批通知多少个 block；数组耗尽后固定用最后一个值 |

### `.use(plugin)`

注册插件，返回 `this`（可链式调用）。插件按注册顺序叠加；同类规则按 `priority` 升序排列（数字越小越先尝试）。

### `.changed(fn)`

注册回调 `(blocks: Block[], isEnd: boolean) => void`，返回 `this`。

- `blocks`：本批新增/变化的 block
- `isEnd`：`true` 表示本次 `parse()` / `update()` 的最后一批

### `.parse(md: string)`

全量解析字符串，分批触发 `changed()`，返回 `this`。

### `.readFile(filename: string)`

从文件渐进式读取（Node.js 同步），返回 `Error | undefined`（`undefined` 表示成功）。

### `.update(row1, col1, row2, col2, content)`

字符级增量更新：将文档中 `(row1,col1)` 到 `(row2,col2)` 的内容替换为 `content`。只重解析受影响范围，触发 `changed()` 通知 dirty block。

```typescript
// 在第 3 行行首插入换行
bm.update(3, 0, 3, 0, '\n')

// 删除第 5 行第 2~8 列的内容
bm.update(5, 2, 5, 8, '')
```

### `.allBlocks()`

返回当前所有 block 的数组（`Block[]`）。

### `.findBlocks(start, end)`

返回与行范围 `[start, end]` 有交叉的所有 block。`start > end` 时自动对调。

### `.applyTheme(theme: string)`

广播主题给所有已注册插件（触发各插件的 `applyTheme` 钩子），返回 `this`。

---

## Block 结构

```typescript
interface Block {
  type: number        // BlockType 或插件枚举值
  typeName?: string   // showTypeName:true 时写入，如 'Heading'、'Table'
  lines: string[]     // 原始行，空行保留为 ""，含被吸收的尾部空行
  id: number          // 稳定唯一 id（1 起），update() 后位移块保持原 id
  order: number       // 在 allBlocks() 中的下标，每次 update() 重新赋值
  lineStart: number   // 在文档中的起始行号（0-based）
  lineEnd: number     // = lineStart + lines.length - 1
  dirty: DirtyFlag    // 0=未变 1=位置偏移 2=内容变化
  depth?: number      // Heading 专用，1–6
  meta?: string       // 插件扩展：code lang、table align JSON、alert 类型等
  markdown?: Node[]   // 行内 AST，由 blockProcessor 写入
  html?: string       // HTML 字符串，由 htmlBlock 渲染器写入
}

enum DirtyFlag { Clean = 0, Shifted = 1, Changed = 2 }
```

### 核心 BlockType

| 常量 | 值 | 说明 |
|------|----|------|
| `BlockType.Heading` | 101001 | ATX / Setext 标题，`block.depth` = 1–6 |
| `BlockType.Paragraph` | 101002 | 段落 |
| `BlockType.List` | 101003 | 有序 / 无序列表 |
| `BlockType.Code` | 101004 | Fenced / 缩进代码块，`block.meta` = 语言 |
| `BlockType.Blockquote` | 101005 | 引用块 |
| `BlockType.Hr` | 101006 | 分隔线 |
| `BlockType.Html` | 101007 | 原始 HTML 块 |
| `BlockType.Def` | 101008 | 链接引用定义 `[id]: url` |
| `BlockType.Toc` | 101009 | `[toc]` 目录占位块 |

---

## 内联目录 `[toc]`

在文档任意位置独占一行写 `[toc]`（忽略大小写），解析后生成 `BlockType.Toc` block。

加载 `blockMakerHtml` 后，`block.html` 自动生成包含所有标题锚点链接的 `<nav>` 目录树；标题 html 同步注入 `id="bmd-h-{id}"`。

```markdown
# 文章标题

[toc]

## 第一节
## 第二节
```

支持多个 `[toc]`，所有 Toc block 获得相同 nav html。

---

## 插件

所有插件均从主包导入：

```typescript
import {
  blockMakerGFM, blockMakerHtml, blockMakerCode,
  blockMakerMermaid, blockMakerMath, blockMakerThemeCss,
  blockMakerDom, blockMakerFrontMatter
} from 'blockmark'
```

---

### `blockMakerGFM`

启用 GitHub Flavored Markdown 扩展。**建议放在其他插件之前注册。**

| 扩展 | 语法 | BlockType / NodeType |
|------|------|----------------------|
| 表格 | `\| A \| B \|` + 分隔行 | `GFMBlockType.Table = 111001` |
| 脚注定义 | `[^id]: content` | `GFMBlockType.FootnoteDef = 111002` |
| 数学块 | `$$\n...\n$$` | `GFMBlockType.MathBlock = 111003` |
| Alert 警告块 | `> [!NOTE/TIP/WARNING/CAUTION/IMPORTANT]` | `GFMBlockType.Alert = 111004` |
| 删除线 | `~~text~~` | `GFMNodeType.Del = 112001` |
| Task 复选框 | `- [x] / - [ ]` | `GFMNodeType.Checkbox = 112002` |
| 脚注引用 | `[^id]` | `GFMNodeType.FootnoteRef = 112006` |
| 行内数学 | `$x^2$` | `GFMNodeType.MathInline = 112008` |
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

为所有 block 生成 `block.html` 字符串。**依赖 `blockMakerGFM`（如需渲染 GFM 语法，需先注册）。**

```typescript
const bm = new BlockMaker()
  .use(blockMakerGFM)
  .use(blockMakerHtml)
  .changed((blocks) => {
    const html = blocks.map(b => b.html ?? '').join('')
    document.getElementById('preview').innerHTML = html
  })
  .parse(md)
```

---

### `blockMakerCode(highlight)`

代码高亮插件。接受一个高亮函数，返回 highlighted HTML 字符串；返回 `null` 则 fallback 到纯文本（自动转义）。

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

将 ` ```mermaid ` fenced block 解析为 `MermaidBlockType.Diagram = 121001`，html 输出 `<pre class="mermaid" data-source="...">` 供 Mermaid.js 渲染。

| 参数 | 类型 | 说明 |
|------|------|------|
| `config.mermaid` | Mermaid 实例 | 传入外部 mermaid 对象，`applyTheme` 时调用 `mermaid.initialize()` 重渲染 |

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

为 GFM 数学节点生成 HTML 包装（供 KaTeX / MathJax 处理）：
- `MathBlock` → `<div class="math-display">$$...$$</div>`
- `MathInline` → `<span class="math-inline">$...$</span>`

**需要先注册 `blockMakerGFM`，后注册 `blockMakerHtml`。**

```typescript
import { blockMakerGFM, blockMakerMath, blockMakerHtml } from 'blockmark'
import renderMathInElement from 'katex/contrib/auto-render'

const bm = new BlockMaker()
  .use(blockMakerGFM)
  .use(blockMakerMath)
  .use(blockMakerHtml)
  .changed((_, isEnd) => {
    if (isEnd) renderMathInElement(document.getElementById('preview'), {
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

运行时动态切换 CSS 主题。创建 / 替换 `<link id="{id}">` 标签。

| 参数 | 说明 |
|------|------|
| `id` | link 元素 id，同 id 的调用相互覆盖 |
| `light` | 浅色主题 CSS 文件 URL |
| `dark` | 深色主题 CSS 文件 URL |

```typescript
import lightUrl from './light.css?url'
import darkUrl  from './dark.css?url'
import { blockMakerThemeCss } from 'blockmark'

const bm = new BlockMaker()
  .use(blockMakerThemeCss({ id: 'blockmark-theme', light: lightUrl, dark: darkUrl }))
  .parse(md)

// 切换主题
bm.applyTheme('dark')
bm.applyTheme('light')
```

---

### `blockMakerDom({ id })`

框架无关的增量 DOM 渲染插件。在页面放置空容器：

```html
<div id="bmd-preview"></div>
```

插件通过 `onChanged` 钩子自动维护容器内容：
- 删除 `deletedIds` 对应的 DOM 节点
- `dirty=2` 的 block 更新 `innerHTML`
- `dirty=0/1` 的 block 不触碰（mermaid / katex 渲染结果保留）
- 按 `allBlocks()` 顺序重排子元素

```typescript
import { blockMakerDom } from 'blockmark'

const bm = new BlockMaker()
  .use(blockMakerGFM)
  .use(blockMakerHtml)
  .use(blockMakerDom({ id: 'bmd-preview' }))
  .parse(md)

// 后续 update() 自动增量更新 DOM
bm.update(row1, col1, row2, col2, newText)
```

---

### `blockMakerFrontMatter`

解析文档开头的 YAML front matter（`---` 至 `---` 或 `...`）。

解析结果 JSON 序列化存入 `block.meta`，`block.html = ''`，不向文档渲染任何内容。

**内置 YAML 解析**支持：字符串、带引号字符串、数字、布尔、`null` / `~`、行内数组 `[a, b]`、块级序列 `- item`、注释行（`#`）。

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
title: 我的文章
date: 2024-01-15
tags: [vue, markdown]
draft: false
---

# 正文
`)
```

---

## 典型插件组合

### 完整博客渲染

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

## 构建 & 测试

```bash
npm run build   # tsup → dist/
npm test        # vitest run
```
