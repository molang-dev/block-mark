# Changelog

All notable changes to this project will be documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.0.2] - 2026-07-05

### Changed
- `update()` 重解析范围从"直接受影响的 block"扩展为前后各再纳入一个相邻 block，使跨 block 边界的内容可以合并回单个 block

### Fixed
- `update()` nextBlock 内容未变时正确复用其 id 并设置 Shifted/Clean dirty
- `update()` prevBlock 经 `_mergeTrailingBlanks` 后 lines 未变时降级为 Clean，避免无谓重渲染
- list 规则中 `l === ''` 改为 `l.trim() === ''`，whitespace-only 行（如 `   `）不再截断列表

---

## [1.0.1] - 2026-07-04

### Changed
- **`disableIndentedCode` 选项**：原 `indentedCode?: boolean`（默认 `true`）重命名为 `disableIndentedCode?: boolean`（默认 `false`），语义更直观——`true` 表示禁用 4 空格缩进代码块
- **`block.lines` 原文不变重构**：删除 `_subdivide` 的 `ruleLines` 预处理 + 事后替换；改为在各 `BlockRule.tryCollect` 内通过 `norm(line, ctx)` 剥空格做规则匹配，`block.lines` 始终直接保存原始行，不再来回倒腾
- `BlockContext` 增加 `disableIndentedCode` 字段，传递给所有 block rules
- `stripBq` 正则从 `^( {0,3})>` 改为 `^[ \t]*>` 以支持原始行含 4+ 前置空格的 blockquote

### Fixed
- `disableIndentedCode: true` 时，含 4+ 前置空格的 ATX heading 渲染为原文（`### H3` 未被识别）——heading 处理器新增 `_normLines()` 预处理
- `disableIndentedCode: true` 时，含 4+ 前置空格的 list item 解析失败——list 处理器同样使用 `_normLines()` 后再传入 `buildListNode`

### Added
- `block.lines === raw source lines` 不变式测试覆盖所有测试文件
- fenced code / HTML block 在 `disableIndentedCode` true/false 下内容一致性对比测试

---

## [1.0.0] - 2026-06

### Added
- **YAML front matter**：`blockMakerFrontMatter` 插件，`---` 围栏识别，`block.data` 存解析结果
- **`[toc]` 自动目录**：行内 `[toc]` 语法生成标题锚点目录；允许 0–3 前置空格及尾部空白
- **Mermaid 图表**：`blockMakerMermaid` 插件，输出 `<pre class="mermaid">` 容器
- **数学公式**：`blockMakerMath` 插件，`$$...$$` 块级公式 + `$...$` 行内公式
- **GFM emoji**：`:name:` 语法映射 Unicode 表情符号
- **GFM Alert 警告块**：`> [!NOTE/TIP/IMPORTANT/WARNING/CAUTION]` 语法，输出 `data-alert` 属性
- **`applyTheme` / `blockMakerThemeCss`**：运行时切换 light/dark 主题 CSS
- **`blockMakerDom`**：直接操作 DOM 的预览插件，`onChanged` 钩子增量更新
- **`block.order` / `block.id`**：稳定 id（跨 update 不变）+ 全局排序号
- **`batchSizes` 选项**：`changed()` 渐进批量通知，支持大文档分批渲染
- **trailing blank → `Br` node**：块尾空行吸收并转换为 `Br` 节点
- **`blockMakerCode`**：代码高亮插件，接受外部 highlight 函数
- **React demo**：对齐 Vue demo，支持完整插件链 + 虚拟列表

### Changed
- `update()` 升级为字符级 API：`update(row1, col1, row2, col2, content)`
- `changed()` 回调只传 `changedBlocks`（变更块），不再传全量
- HTML block 配对标签整体收集（不再在空行截断）
- 类型编号统一格式 `{模块id}{类型分类}{序号}`
- `parse()` 执行后保留 dirty 标记（不再重置为 Clean）

### Fixed
- `update()` dirty 正确性 + `_mergeTrailingBlanks` 后重跑 processor
- `update()` 复用旧 block id，避免无谓重渲染
- dirty flag 误标：def 未变时不触发引用块 dirty=2
- `_text()` 不感知插件 trigger 字符导致 `~~` 被吞
- `taskCheckbox` trigger 过宽导致普通链接 `[` 被吞
- `FootnoteDef` 渲染重构 + id 增加 `bmd-` 前缀
- `splitTableRow` 前导空格修复（消除幽灵空列）
- 裸链接 / 邮件 autolink node 补充 `text` 字段

---

## [0.x] - 早期版本

### Added
- `BlockMaker` 核心：heading 分块、`update()` 增量编辑、`onChanged` 回调、GFM 插件体系
- inline AST：`Node` 接口，支持 Em/Strong/Code/Link/Image/Autolink/LinkRef/Footnote/TaskCheckbox/Del/Math
- CommonMark 列表解析重写（支持 tight/loose、嵌套、continuation）
- 引用式链接（Reference Links）完整实现
- 脚注（Footnote）+ 引用链接增强
- HTML block type 1–6 识别
- `update(row1,col1,row2,col2,content)` 字符级编辑 API
- Vue / React demo
- light / dark 默认主题 CSS
