# mdparser — 设计文档

## 项目定位

Markdown 多层解析器，Layer 1 按 Heading 切块，Layer 2 对每块细分类型。  
零依赖，TypeScript 实现，同时输出 ESM / CJS / .d.ts。

---

## 架构概览

```
src/
  index.ts       — 公开导出入口
  parser.ts      — Parser 主类（Layer 1 + Layer 2）
  types.ts       — 类型定义

dist/
  index.js       — ESM
  index.cjs      — CJS
  index.d.ts     — 类型声明

demo/react/      — Vite + React 18 演示应用
test/
  parser.test.ts — vitest 测试（41 个用例）
```

构建工具：`tsup`（`tsup.config.ts`）  
测试框架：`vitest`

---

## Block 结构

### TypedBlock

```typescript
interface TypedBlock {
  type: BlockType        // 块类型
  lines: string[]        // 原始行，空行保留为 ""
  depth?: number         // heading 专用，1-6
  index: number          // 块序号（0-based）
  lineStart: number      // 在原文档中的起始行号（0-based）
  lineEnd: number        // = lineStart + lines.length - 1
  dirty?: number         // 0=干净, 1=位置变化, 2=内容变化
}
```

### BlockType

```
heading | paragraph | list | code | table | blockquote | hr | html
```

---

## Layer 1 — 按 Heading 分 Section

**规则**：匹配 `/^\s*#{1,6}\s/` 的行（且不在 code fence 内、不在 HTML block 内）触发新 Section。

- 首个 heading 之前的内容 → 前导 block（无 heading 的 preamble）
- 每个 heading 连同其后内容构成一个 Section
- Sections 扁平排列，无嵌套

**跨 chunk 状态**（`_read` 调用之间保持）：
- `_inFence` — 是否在 code fence 内
- `_htmlDepth` — HTML 标签嵌套深度
- `_currentBlock` — 当前正在积累的 section
- `_sectionStart` — 当前 section 的起始全局行号
- `_globalLineNum` — 已处理的总行数

---

## Layer 2 — Section 内细分类型

在 `_subdivide(rawLines, sectionStart)` 中实现，识别顺序：

1. **heading** — 首行若匹配 `#{1,6}\s` 则独立成块
2. **html** — `<tag ...>` 开头（非闭合），跟踪 `_netTagDepth` 直到深度归零；void/自闭合标签单行块
3. **code fence** — ` ``` ` 或 `~~~` 开头，读到对应闭合行
4. **hr** — `---` / `***` / `___`（3 个以上）
5. **list** — `- ` / `* ` / `+ ` / `1. ` 开头，连续行合并
6. **blockquote** — `> ` 开头，连续行合并
7. **table** — `|...|` 行，连续行合并
8. **paragraph** — 其余行，每行独立；相邻空行段落合并到上一段尾部

---

## 公开 API

### 构造与配置

```typescript
const p = new Parser()

// 配置批量通知大小，默认 [50, 100, 200, 400, 800, 1600, 3200]
p.configUpdateCount([1, 2, 4])
```

### 解析

```typescript
// 同步解析字符串
p.read(mdContent: string): void

// 渐进式读取文件（Node.js，同步），返回 Error 或 undefined
p.readFile(filename: string): Error | undefined
```

### 回调注册

```typescript
// 批量 block 通知，isEnd=true 表示本次解析/更新的最后一批
p.onBlockUpdate((blocks: TypedBlock[], isEnd: boolean) => void): void

// 解析完成通知
p.onDone(() => void): void
```

### 查询与更新

```typescript
// 获取全部已解析 block
p.allBlocks(): TypedBlock[]

// 根据原文档行号查找所属 block
p.getBlockByRawLineNumber(lineNum: number): TypedBlock | null

// 替换指定行内容，重新细分受影响 block，通知 dirty 块
p.updateBlockLine(lineNumber: number, newWholeContent: string): TypedBlock[]
```

---

## 批量通知机制

### configUpdateCount

`_batchSizes` 数组控制每次 `onBlockUpdate` 通知多少个 block：

- 第 N 批（0-based）通知 `_batchSizes[N]` 个
- 超出数组范围后，固定用最后一个值
- 默认：`[50, 100, 200, 400, 800, 1600, 3200]`

### read / readFile 的通知流程

```
block emit → _buffer → _tryFlush（达到当前批次大小则通知 isEnd=false）
                              ↓ 全部处理完
                      _flushRemaining（剩余以 isEnd=true 通知）
                              ↓
                      _fireDone（触发 onDone）
```

### updateBlockLine 的通知流程

- `_batchIndex` 重置为 0（每次从头开始批次序列）
- 收集所有 `dirty > 0` 的 block → 按 `_batchSizes` 手动分批
- 最后一批 `isEnd=true`

---

## 渐进式文件读取（readFile）

使用 `fs.openSync` + `fs.readSync`，64KB 为一个 I/O 块：

```
while (readSync > 0):
  chunk → split('\n') → pending lines
  leftover（最后一个不完整行）跨 chunk 保留
  当 pending.length >= batchSizes[batchIdx]:
    _read(batchLines)  →  emit blocks  →  通知
```

- 行数维度（读多少行/批）和块通知维度（通知多少块/批）均使用同一 `_batchSizes`

---

## dirty 标志

| 值 | 含义 |
|----|------|
| 0  | 干净 |
| 1  | 行号位置发生偏移（内容未变） |
| 2  | 内容已变化 |

`updateBlockLine` 设置 dirty：
- 被替换/重新细分的 block → `dirty = 2`
- 若 `lineDelta !== 0`，后续所有 block → `dirty = 1`

---

## updateBlockLine 执行流程

```
1. 找到包含 lineNumber 的 block（blockIndex）
2. 记录 oldLineCount
3. splice 替换该行（支持多行展开）
4. _subdivide → _mergeEmptyParas → 标记 dirty=2
5. _blocks.splice 替换原 block
6. 若 lineDelta ≠ 0：修正后续 block lineStart/lineEnd，dirty=1
7. 重建所有 block 的 index、lineEnd
8. 收集 dirty block，按 batchSizes 分批通知
```

---

## React Demo 架构

```
App.jsx
  ├── parserRef        — Parser 实例（跨渲染复用）
  ├── mdContent        — textarea 内容状态
  ├── blocks           — allBlocks() 快照
  ├── dirtyMap         — { [index]: 1|2 }（独立 state，不存在 block 对象上）
  ├── prevContentRef   — 上一次内容，用于 diff 判断
  └── cursorLine       — 当前光标行号

onChange 逻辑：
  - 与 prevContent diff → 若单行变化 → updateBlockLine
  - 多行变化或行数差 > 1 → 全量 p.read()
  - dirty 1500ms 后自动清除

BlockCard.jsx
  - 接收 block + dirty（分离传入，避免 react-window 不刷新）
  - dirty=2 → border: red；dirty=1 → border: yellow
  - 始终显示 dirty: N 文字

VariableSizeList（react-window）
  - itemData={ blocks, dirtyMap } 传递给 Row
  - 高度估算：44 + lines.length * 22
```

---

## 已知问题（待修）

1. **`updateBlockLine` dirty 不预清理**  
   每次调用前未将所有 block dirty 重置为 0，导致上次调用残留的 dirty 块被重复通知。

2. **`isEnd=true` 边界缺失**  
   当 block 数恰好整除 batchSize 时，`_tryFlush` 发出最后一批后 buffer 为空，`_flushRemaining` 不触发，没有 `isEnd=true` 通知。

3. **`_read` 死参数 `_linesCount`**  
   `_read(content, _linesCount?)` 第二参数从未被读取，为死代码。

4. **App.jsx — `onDone` 回调累积**  
   `parse()` 每次调用都 push 新 `onDone` 到同一 parser 实例，`_reset()` 不清回调，导致第 N 次解析触发 N 个回调。

5. **App.jsx — textarea 删行未正确处理**  
   删除一整行时 diff 逻辑仍走单行路径，用 `updateBlockLine` 将该行改为 `''` 而非真正删行。

---

## 构建 & 测试命令

```sh
npm run build    # tsup → dist/
npm test         # vitest run（41 个测试用例）
```

`demo/react/vite.config.js` 中 `mdparser` alias 指向 `../../src/index.ts`，开发时直接使用源码。


* 插入或者删除时，需要标记dirty
* dirty=2表示内容更新了，需要重新解析md内容，重新计算布局
* dirty=1表示顺序变了，需要重新计算高度？
* RawBlock, MDBlock, MDBlock记录 layout之后的宽高

---

## Feature Log

### API 重设计

- `onBlockUpdate` + `onDone` → **`onUpdate(callback: BlockCallback)`**，签名 `(blocks: TypedBlock[], isEnd: boolean) => void`
- `getBlockByLineNumber(n)` → **`findBlocks(start, end): TypedBlock[]`**，返回与 `[start, end]` 有交叉的所有 block；`start > end` 时内部自动对调
- `updateBlockLine(lineNumber, newContent)` → **`updateLine(startLine, endLine, newContent): void`**，支持行范围替换
- `setBatchSize(sizes)` 默认值改为 `[400, 800, 1600, 3200]`
- `readFile` 返回 `Error | null`（null 表示成功，不再返回 undefined）

### updateLine 增强

- 支持行范围替换（`startLine ~ endLine`），`endLine - startLine + 1` 行被替换为 `newContent`
- `newContent = ''` 表示真删除：不插入任何行（原来会插入一个空行）
- 内部自动处理跨 block 范围：通过 `findBlocks` 收集所有受影响 block，合并 prefix / newLines / suffix 后重新 subdivide，无需调用方判断 block 边界
- 最后一个 block 被删尽时发送 `_notify([], true)` 兜底通知

### React Demo

- `onUpdate` 只注册一次（`useEffect` mount），统一驱动 `setBlocks` + `setDirtyMap`，消除多次 `parse()` 时回调累积问题
- `handleTextareaChange` 改用首尾双向 diff（从头扫 + 从尾扫）精确算出 `startLine / endLine`，调用 `updateLine` 增量更新；跨 block 时自动 fallback 到 `p.read()`
- 空行渲染为 `↵`（灰色，`user-select: none`）
- dirty 高亮在最后一次编辑 5 秒后自动清除

### 字符级增量更新 update()

- `updateLine(startLine, endLine, newContent)` → **`update(row1, col1, row2, col2, content)`**，精确到字符坐标
- `content = ''` 表示删除，无哨兵值
- 内部将字符范围拼接为 `charPrefix + content + charSuffix`，split('\n') 得到 middleLines
- 始终无条件扩展到 prevBlock + nextBlock，使相邻同类块（如两段 Table）在删除分隔 Heading 后能重新合并
- Demo（React / Vue）改用字符级 diff：`charToRowCol(text, charPos)` 将字符偏移转换为 `{ row, col }`，调用 `p.update()`

### update() prevBlock/nextBlock 脏标记优化

- re-parse 后对比 `merged[0].lines` vs `prevSnap.lines`：相同则 `dirty=0`，复用旧 markdown，跳过重新解析
- 对比 `merged[last].lines` vs `nextSnap.lines`：相同则 `dirty = lineDelta !== 0 ? 1 : 0`，复用旧 markdown
- 两者均在 splice 前判断，避免对未变化的扩展块触发不必要的 UI 重渲染

### Inline 解析增强

- **嵌套列表**：递归 `buildList(lines, start)` 按缩进层级构建子列表，ListItem.children 中嵌套 List 节点
- **嵌套引用块**：递归 `parseBlockquote(lines)` 剥一层 `>`，内层 `>` 再次递归，支持任意深度
- **引用块内块级元素**：`parseBlockquote` 剥 `>` 后先识别 code fence → Code 节点、list → List 节点，再降级 `parseInline`

### GFM Autolink 扩展

- 裸 URL 自动识别：`http://`、`https://`、`ftp://` 开头 + `www.` 开头，末尾标点自动剥离
- 裸 Email 自动识别：`word@domain.tld` 模式
- `<url>` / `<email>` 角括号 autolink 保留并标注 linkType

### LinkType 枚举

- `types.ts` 新增 `enum LinkType { URL = 1, Email, Ref }`
- `Node.linkType?: LinkType` — 所有 Link 节点携带类型标注
- `render_html`：`Email` → href 加 `mailto:` 前缀；`URL` + `www.` 开头 → href 加 `http://` 前缀
- `node2str` 输出 `linkType` 名称（如 `URL`、`Email`）
- `LinkType` 从 `index.ts` 公开导出

### 引用式链接（Reference Links）

- `BlockType.Def`（=9）：`_subdivide` 识别 `[id]: url`，独立成块，`render_html` 返回 `''`
- `Node.defId?: string`：Def 节点和 Link(Ref) 节点均携带定义 id（lowercase）
- `ParseContext`：`{ defs, refs, blockIndex }`，贯穿 `parseBlock` / `parseInline` / `Scanner` 全链路
- `Parser._defs`：`Map<string, { url, blockIndex }>`，全局定义表，key 大小写不敏感
- `Parser._refs`：`Array<{ node, blockIndex }>`，所有引用节点索引
- 三种引用形式：`[text][id]`（完整）、`[text][]`（折叠，id=text）、`[id]`（快捷）
- 遇到 Def 块时立即遍历 `_refs` 补填 url，支持先用后定义，无需后置处理，不触发额外 `onUpdate`
- `update()` 中：替换区块前捕获 oldDefs / 清理 _refs，re-parse 后对比新旧 def，受影响的引用节点直接更新 text 并标 dirty