# Plugin API 开发指南

本文档描述如何为 BlockMaker 编写自定义插件。

---

## 一、插件接口

```typescript
interface BlockMakerPlugin {
  /** 插件名称（唯一标识，用于调试和错误提示） */
  name: string

  /**
   * 块检测规则列表。
   * 按 priority 从小到大排序，priority 小的先检测。
   * 插件规则与核心规则合并后统一排序。
   */
  blockRules?: BlockRule[]

  /**
   * 行内解析规则列表。
   * 按 priority 从小到大排序。
   */
  inlineRules?: InlineRule[]

  /**
   * 本插件负责的块类型 HTML 渲染函数。
   * key 为 Block.type（number）。
   * blockMakerHtml 插件收集所有注册插件的 htmlBlock 合并渲染。
   */
  htmlBlock?: Record<number, (block: Block, ctx: HtmlCtx) => string>

  /**
   * 本插件负责的行内节点 HTML 渲染函数。
   * key 为 Node.type（number）。
   */
  htmlInline?: Record<number, (node: Node, ctx: HtmlCtx) => string>

  /**
   * showTypeName 模式下的类型名映射。
   * key 为 type 数值，value 为可读名称。
   * BlockMaker 合并所有插件的 typeNames，构建 Block/Node 的 typeName 字段。
   */
  typeNames?: Record<number, string>
}
```

---

## 二、BlockRule 接口

```typescript
interface BlockRule {
  /** 规则名称（调试用） */
  name: string

  /**
   * 检测优先级，数值越小越先检测。
   * 核心规则优先级分布：
   *   10  空行（内部）
   *   20  ATX Heading
   *   25  Setext Heading
   *   30  缩进代码块
   *   35  围栏代码块
   *   40  HTML 块
   *   50  链接引用定义
   *   60  块引用
   *   70  列表
   *   80  分割线
   *   90  段落（兜底）
   *
   * GFM 规则优先级：
   *   52  脚注定义
   *   55  表格
   *
   * 用户自定义建议从 200 起，或插入合适间隙。
   */
  priority: number

  /**
   * 尝试从 lines[at] 开始收集一个块。
   * 返回 Block 表示匹配成功（消耗了若干行）。
   * 返回 null 表示不匹配，继续尝试下一个规则。
   *
   * @param lines   当前 section 的所有原始行
   * @param at      当前检测位置（行索引）
   * @param ctx     解析上下文（定义表、引用表等）
   */
  tryCollect(lines: string[], at: number, ctx: BlockContext): Block | null
}
```

### BlockContext

```typescript
interface BlockContext {
  /** 链接/脚注定义表，key 为 label 小写 */
  defs: Map<string, { url: string; blockIndex: number }>
  /** 引用节点列表（待填充 url） */
  refs: Array<{ node: Node; blockIndex: number }>
  /** 当前块序号 */
  blockIndex: number
  /** 当前块在文档中的起始行号 */
  lineStart: number
}
```

---

## 三、InlineRule 接口

```typescript
interface InlineRule {
  /** 规则名称 */
  name: string

  /** 优先级，数值越小越先检测 */
  priority: number

  /**
   * 触发检测：判断当前字符位置是否可能匹配本规则。
   * 用于快速跳过，避免每个字符都运行完整匹配。
   * 返回 true 时才调用 tryParse。
   */
  trigger(ch: string, next: string): boolean

  /**
   * 尝试从 src[pos] 开始解析一个行内节点。
   * 返回 { node, length } 表示匹配成功，length 为消耗的字符数。
   * 返回 null 表示不匹配。
   *
   * @param src   行内文本
   * @param pos   当前位置
   * @param ctx   行内解析上下文
   */
  tryParse(src: string, pos: number, ctx: InlineContext): { node: Node; length: number } | null
}
```

### InlineContext

```typescript
interface InlineContext {
  defs: Map<string, { url: string; blockIndex: number }>
  refs: Array<{ node: Node; blockIndex: number }>
  blockIndex: number
  /** 递归解析子串 */
  parse(src: string): Node[]
}
```

---

## 四、HtmlCtx 接口

```typescript
interface HtmlCtx {
  /** 渲染 Node[] 为 HTML 字符串 */
  renderNodes(nodes: Node[]): string
  /** 渲染单个 Node */
  renderNode(node: Node): string
  /** 渲染若干原始行（用于自定义块内容） */
  renderLines(lines: string[]): string
  /** HTML 转义 */
  escape(s: string): string
}
```

---

## 五、className 约定

所有 HTML 输出使用 `bmk-` 前缀的 class，避免与用户 CSS 冲突：

```
bmk-{block-type-name}       块级元素
bmk-{inline-type-name}      行内元素
```

自定义插件同样遵循此约定（使用自己的前缀或 `bmk-` 前缀加插件名）：

```
bmk-alert           自定义告警块
bmk-alert-warning   告警类型修饰
```

---

## 六、类型编号分段

| 段位 | 用途 |
|------|------|
| 1–99   | BlockMaker 核心（CommonMark） |
| 100–199 | blockMakerGFM 插件 |
| 200+   | 用户自定义插件 |

**注意**：同一 `type` 数值只能被一个插件使用。如有冲突，后注册的插件覆盖前者的渲染规则。

---

## 七、完整示例：`blockMakerAlert` 插件

### 语法定义

```
:::warning
这是一个警告框。
支持 **markdown** 内容。
:::
```

支持的告警类型：`info`、`warning`、`danger`、`tip`

### 实现

```typescript
import type { BlockMakerPlugin, Block, Node, BlockContext } from 'blockmaker'

// 自定义类型编号（从 200 起）
const AlertBlockType = {
  Alert: 200,
} as const

// 自定义 Node 类型（若告警内容需要特殊行内节点，此处暂不需要）

export const blockMakerAlert: BlockMakerPlugin = {
  name: 'alert',

  // showTypeName 模式下显示 'Alert'
  typeNames: {
    [AlertBlockType.Alert]: 'Alert',
  },

  blockRules: [
    {
      name: 'alert',
      priority: 28,   // 在围栏代码块(35)之前，Setext(25)之后

      tryCollect(lines, at, ctx) {
        const openMatch = lines[at]?.match(/^:{3}(\w+)\s*$/)
        if (!openMatch) return null

        const kind = openMatch[1]   // 'warning' | 'info' | 'danger' | 'tip'
        const bodyLines: string[] = []
        let i = at + 1
        let closed = false

        while (i < lines.length) {
          if (lines[i] === ':::') { closed = true; i++; break }
          bodyLines.push(lines[i])
          i++
        }

        // 未关闭也合法，收集到末尾
        const allLines = [lines[at], ...bodyLines, ...(closed ? [':::'] : [])]

        return {
          type: AlertBlockType.Alert,
          lines: allLines,
          meta: kind,
          index: 0,            // 由 BlockMaker 重新赋值
          lineStart: ctx.lineStart,
          lineEnd: ctx.lineStart + allLines.length - 1,
          dirty: 2,
        }
      },
    },
  ],

  htmlBlock: {
    [AlertBlockType.Alert]: (block, ctx) => {
      const kind = block.meta ?? 'info'
      // 去除开启行和关闭行，渲染内容
      const contentLines = block.lines.slice(1, block.lines[block.lines.length - 1] === ':::' ? -1 : undefined)
      const inner = ctx.renderLines(contentLines)
      return `<div class="bmk-alert bmk-alert-${ctx.escape(kind)}">${inner}</div>`
    },
  },
}
```

### 使用

```typescript
import { BlockMaker } from 'blockmaker'
import { blockMakerGFM } from 'blockmaker/plugins/gfm'
import { blockMakerHtml } from 'blockmaker/plugins/html'
import { blockMakerAlert } from './my-plugins/alert'

const bm = new BlockMaker({ showTypeName: false })
  .use(blockMakerGFM)
  .use(blockMakerAlert)
  .use(blockMakerHtml)
  .changed((blocks, isEnd) => {
    for (const block of blocks) {
      console.log(block.type, block.html)
    }
  })
  .parse(`
:::warning
注意事项内容
:::

普通段落
  `)
```

### 输出

```html
<div class="bmk-alert bmk-alert-warning"><p class="bmk-paragraph">注意事项内容</p></div>
<p class="bmk-paragraph">普通段落</p>
```

---

## 八、插件注册顺序

1. `use()` 按调用顺序注册插件。
2. `blockRules` 合并后按 `priority` 排序（稳定排序，同优先级保持注册顺序）。
3. `inlineRules` 同上。
4. `htmlBlock` / `htmlInline`：同 `type` 时后注册的覆盖先注册的。
5. `blockMakerHtml` 必须**最后** `use()`，它在其他插件完成解析后执行 `transform`。

---

## 九、调试

```typescript
const bm = new BlockMaker({ showTypeName: true })
  .use(blockMakerGFM)
  .use(blockMakerAlert)
  .use(blockMakerHtml)
  .changed((blocks) => {
    for (const b of blocks) {
      // b.typeName 在 showTypeName:true 时由 BlockMaker 自动写入
      console.log(b.typeName, b.lines)
      for (const node of b.markdown ?? []) {
        console.log('  ', node.typeName, node.text)
      }
    }
  })
```
