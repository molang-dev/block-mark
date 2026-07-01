# BlockMaker 内部架构

---

## 一、整体流水线

```
parse(markdownContent)
        │
        ▼
  ┌─────────────────────────────────────────┐
  │  Layer 1 — Section 切分                  │
  │  按 Heading 行（/^\s*#{1,6}\s/）切 Section│
  │  每个 Section = 一个 Heading + 其后内容   │
  │  首个 Heading 前的内容 = preamble Section  │
  └───────────────────┬─────────────────────┘
                      │ rawLines[]
                      ▼
  ┌─────────────────────────────────────────┐
  │  Layer 2 — Block 细分（_subdivide）       │
  │  按已注册 blockRules 的 priority 顺序     │
  │  逐行检测，生成 Block[]                   │
  └───────────────────┬─────────────────────┘
                      │ Block[]
                      ▼
  ┌─────────────────────────────────────────┐
  │  Layer 3 — 行内解析（parseInline）        │
  │  对每个 Block 的文本内容运行 inlineRules   │
  │  生成 Node[] → Block.markdown            │
  └───────────────────┬─────────────────────┘
                      │
                      ▼
  ┌─────────────────────────────────────────┐
  │  Transform — 插件后处理                   │
  │  blockMakerHtml: 遍历所有 Block,          │
  │  用 htmlBlock/htmlInline 渲染 → block.html│
  └───────────────────┬─────────────────────┘
                      │
                      ▼
              changed(blocks, isEnd)
```

---

## 二、类结构

```
BlockMaker
  ├── _options: BlockMakerOptions
  ├── _plugins: BlockMakerPlugin[]
  ├── _blockRules: BlockRule[]        // 合并排序后的块规则
  ├── _inlineRules: InlineRule[]      // 合并排序后的行内规则
  ├── _htmlBlock: Map<number, Fn>     // 块渲染函数
  ├── _htmlInline: Map<number, Fn>    // 行内节点渲染函数
  ├── _typeNames: Map<number, string> // showTypeName 用
  ├── _blocks: Block[]               // 当前所有块
  ├── _defs: Map<string, DefEntry>   // 链接/脚注定义表
  ├── _refs: RefEntry[]              // 待填充 url 的引用节点
  ├── _callback: ChangedFn | null
  ├── _buffer: Block[]               // 待通知的 dirty 块缓冲
  └── _batchSizes: number[]          // 批次大小序列
```

---

## 三、插件注册（use()）

```typescript
use(plugin: BlockMakerPlugin): this {
  this._plugins.push(plugin)

  // 合并 blockRules，按 priority 稳定排序
  if (plugin.blockRules) {
    this._blockRules.push(...plugin.blockRules)
    this._blockRules.sort((a, b) => a.priority - b.priority)
  }

  // 合并 inlineRules
  if (plugin.inlineRules) {
    this._inlineRules.push(...plugin.inlineRules)
    this._inlineRules.sort((a, b) => a.priority - b.priority)
  }

  // 合并 htmlBlock / htmlInline（后注册覆盖先注册）
  for (const [k, fn] of Object.entries(plugin.htmlBlock ?? {}))
    this._htmlBlock.set(Number(k), fn)
  for (const [k, fn] of Object.entries(plugin.htmlInline ?? {}))
    this._htmlInline.set(Number(k), fn)

  // 合并 typeNames
  if (plugin.typeNames)
    for (const [k, v] of Object.entries(plugin.typeNames))
      this._typeNames.set(Number(k), v)

  return this
}
```

---

## 四、parse() 流程

```
parse(content: string): this

1. _reset()：清空 _blocks、_defs、_refs、_buffer、批次计数器

2. Layer 1：splitSections(content)
   - 逐行扫描，遇到 /^\s*#{1,6}\s/ 且不在代码围栏内 → 新 Section
   - 返回 Section[]（每个含 rawLines[] 和 sectionLineStart）

3. 对每个 Section：_subdivide(rawLines, sectionStart)
   - 调用 _blockRules 依次 tryCollect
   - 生成 Block[]，赋 index / lineStart / lineEnd
   - _mergeTrailingBlanks：空行追加到上一块 lines 尾部

4. 对每个 Block：_parseInline(block)
   - 运行 _inlineRules 扫描 block 文本内容
   - 写入 block.markdown: Node[]
   - 若 showTypeName：写入每个 node.typeName

5. 若有 transform 插件（blockMakerHtml）：
   - 遍历 Block[]，调用 transform(block)
   - 写入 block.html

6. 若 showTypeName：写入每个 block.typeName

7. _notify(blocks, isEnd=true)：调用 changed 回调
```

---

## 五、增量更新 update()

```
update(row1, col1, row2, col2, newContent)

1. 将字符坐标转换为行内容修改：
   - 找到 row1 / row2 对应的行
   - prefix = line[row1].slice(0, col1)
   - suffix = line[row2].slice(col2)
   - middleLines = (prefix + newContent + suffix).split('\n')

2. 确定受影响范围：
   - 找到 row1 所在 Block（prevBlock）和 row2 所在 Block（nextBlock）
   - 扩展到 prevBlock 前一块和 nextBlock 后一块（保证跨块合并正确）

3. 快照扩展块内容（prevSnap / nextSnap）

4. 替换 _blocks 中的行内容

5. 重新 _subdivide 受影响区域 → 新 Block[]

6. 对比边界块内容：
   - 新首块 lines === prevSnap.lines → dirty=0，复用旧 markdown
   - 新尾块 lines === nextSnap.lines → dirty = lineDelta ? 1 : 0，复用旧 markdown

7. 对内容变化的 Block 重新执行 _parseInline + transform

8. 修正后续 Block 的 lineStart / lineEnd（若行数差 lineDelta ≠ 0，dirty=1）

9. 重建所有 Block.index

10. 收集 dirty > 0 的 Block → _notify(dirtyBlocks, isEnd=true)
```

---

## 六、DirtyFlag 语义

```typescript
enum DirtyFlag {
  Clean   = 0,   // 无变化，UI 无需重渲染
  Shifted = 1,   // 行号位置偏移，内容未变（UI 可只更新位置）
  Changed = 2,   // 内容变化，需重新渲染
}
```

`changed` 回调只通知 `dirty > 0` 的块。

---

## 七、批量通知机制

`_batchSizes` 数组控制每次回调通知多少块：

```
默认：[400, 800, 1600, 3200]

第 0 批：通知前 400 块
第 1 批：通知下 800 块
第 2 批：通知下 1600 块
第 3+ 批：每批 3200 块
```

`parse()` 和 `update()` 共用同一批次序列（每次 parse/update 重置批次计数器）。

---

## 八、定义与引用解析

### 前向引用（Forward Reference）

`[text][id]` 出现在 `[id]: url` 定义之前时：

1. `_makeLinkRef` 创建 `{ type: LinkRef, defId: 'id', url: undefined }` 节点，加入 `_refs`。
2. 遇到 Def 块时，遍历 `_refs`，为 `defId === id` 的节点填充 `url`。
3. `update()` 中定义变更时，重新扫描 `_refs` 更新 `url`，受影响块标 `dirty=2`。

### 脚注编号

脚注引用编号按**首次出现顺序**分配（渲染阶段由 blockMakerHtml 管理 `fnRefMap`）。

---

## 九、showTypeName 工作原理

```typescript
if (this._options.showTypeName) {
  block.typeName = this._typeNames.get(block.type) ?? `Unknown(${block.type})`
  for (const node of block.markdown ?? [])
    node.typeName = this._typeNames.get(node.type) ?? `Unknown(${node.type})`
}
```

核心插件在构建时已将 `BlockType` / `NodeType` 所有 enum 值注册到 `typeNames`。

---

## 十、文件结构

```
src/
  index.ts                   — 公开导出
  core/
    BlockMaker.ts            — 主类
    types.ts                 — 所有类型定义（接口 + enum）
    parse-blocks.ts          — CommonMark 块规则（作为内置插件集合）
    parse-inline.ts          — CommonMark 行内规则
  plugins/
    gfm.ts                   — blockMakerGFM（自包含：块规则 + 行内规则 + HTML 渲染）
    html.ts                  — blockMakerHtml（元渲染插件）

test/
  core/
    blocks.test.ts
    inline.test.ts
    update.test.ts
  gfm/
    blocks.test.ts
    inline.test.ts
  html/
    render.test.ts

docs/
  commonmark.md
  gfm.md
  plugin-api.md
  architecture.md
  (this file)
```
