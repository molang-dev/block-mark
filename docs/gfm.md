# GFM 扩展语法规范

本文档列举 `blockMakerGFM` 插件在 CommonMark 基础上新增的语法规则。
编码时以本文档为依据，每条规则对应至少一个正例和一个边界/反例测试。

规范参考：https://github.github.com/gfm/

---

## 一、块结构扩展

### G-B-01 表格（Table）

**插入优先级**：55（在链接引用定义之后、块引用之前）

**规则**

1. 首行为表头行：`| col1 | col2 |`（首尾 `|` 可选）。
2. 第二行为分隔行：每列为 `---`、`:---`、`---:`、`:---:`，前后 `-` 至少 1 个。
3. 第三行起为数据行，格式同表头。
4. 列数以表头列数为准；数据行列数不足时补空单元格，超出时截断。
5. 单元格内容做 inline 解析。
6. 表格不能中断段落（必须前有空行或块开头）。
7. 分隔行缺失 → 不识别为表格（退为段落）。

**对齐规则**

| 分隔列格式 | 对齐 |
|-----------|------|
| `---`     | 无（默认左对齐） |
| `:---`    | 左对齐 |
| `---:`    | 右对齐 |
| `:---:`   | 居中对齐 |

**正例**
```
| Header 1 | Header 2 | Header 3 |
|----------|:--------:|---------:|
| cell     | center   | right    |
| a        | b        | c        |
```

无首尾 `|` 的简洁格式：
```
Header 1 | Header 2
---------|----------
cell 1   | cell 2
```

**反例 / 边界**
```
| no | separator |
| row |              → 识别为段落（缺分隔行）

| a | b |
|---|
| c |               → 列数不足，c 对应第一列，第二列空

paragraph
| a | b |
|---|---|
| c | d |           → 不能中断段落，识别为段落

| a | b |
|---|---|
| c | `code \| pipe` | d |  → 单元格内 \| 转义为字面 |
```

---

### G-B-02 脚注定义（Footnote Definition）

**插入优先级**：52（在链接引用定义之后、表格之前）

**规则**

1. 格式：`[^id]: content`（冒号后恰好一个空格）。
2. `id` 可含字母、数字、`-`、`_`；大小写不敏感。
3. 续行规则：定义行之后，空行或以 Tab / 4 个以上空格开头的行均属于本脚注内容。
4. 连续两个空行或遇到不满足续行条件的行 → 终止收集。
5. 尾部空行剥除。
6. 脚注定义本身不产生可见 HTML 输出（由脚注引用决定渲染位置）。
7. 同一 `id` 多次定义，第一个生效。

**Node 结构**
```
Block { type: GFMBlockType.FootnoteDef, meta: 'id', lines: [...] }
```

**正例**
```
[^1]: 这是第一个脚注

[^note]: 脚注内容
    这是续行内容（4 空格）
    
    空行后的续行（也是 4 空格）
```

**反例 / 边界**
```
[^]: /empty        → 不识别（id 为空）
[^1]:no-space      → 不识别（冒号后无空格）
[^ 1]: content     → 不识别（id 含空格）

[^1]: first
[^1]: second       → 第一个生效，第二个忽略
```

---

## 二、行内结构扩展

### G-I-01 删除线（Strikethrough）

**规则**

1. `~~text~~`：两个 `~` 开启，两个 `~` 关闭。
2. 单个 `~` 不触发（字面输出）。
3. 不可跨段落。
4. 内部可嵌套其他行内元素（em、strong、code span 等）。

**Node**：`{ type: GFMNodeType.Del, children: [...] }`

**正例**
```
~~deleted text~~
~~**bold del**~~
```

**反例 / 边界**
```
~single~           → 字面 ~single~
~~not
closed~~           → 不跨段落（换行截断）
~~~~               → 两对空 ~~，内容为空（视实现可字面输出）
```

---

### G-I-02 Task List Item

**规则**

1. 仅在列表项内容的**最开头**有效：`[ ]`（未选中）或 `[x]` / `[X]`（已选中）+ 空格。
2. 必须是列表项第一行的第一个内容。
3. 其余内容正常做 inline 解析。
4. 不在列表项开头时，视为普通文本。

**Node**：ListItem 的 children 第一个节点为 `{ type: NodeType.Checkbox, checked: boolean }`

**正例**
```
- [x] completed task
- [ ] incomplete task
- [X] also completed
```

**反例 / 边界**
```
- text [x] not task        → [ x ] 不在行首，字面输出
- [x]no-space              → 无空格，字面 [x]no-space
1. [x] ordered task list   → 合法（有序列表也支持）
  - [ ] nested task        → 合法（嵌套列表）
```

---

### G-I-03 裸 URL Autolink（GFM 扩展）

**规则**

CommonMark 的 autolink 需要 `<>`。GFM 额外支持无 `<>` 的裸 URL：

1. `http://`、`https://`、`ftp://` 开头。
2. URL 字符：非空白、非 `<`、非 `>`；末尾标点（`.`、`,`、`:`、`!`、`?`、`)`、`'`、`"`）自动剥除。
3. `www.` 开头：自动补 `http://` 前缀。
4. Email：`word@domain.tld` 格式（无需 `<>`）。

**正例**
```
https://example.com
http://foo.bar/baz?q=1#anchor
www.example.com
user@example.com
Visit https://example.com, more info there.
```

**反例 / 边界**
```
ftp://           → 无主机部分，字面
not-a-url        → 字面
example.com      → 无协议头，字面（www. 开头才识别）
a@b              → 不含 tld，字面
https://example.com.   → 末尾 . 剥除，url=https://example.com
```

---

### G-I-04 脚注引用（Footnote Reference）

**规则**

1. 格式：`[^id]`。
2. `id` 大小写不敏感，规范化后查找脚注定义。
3. 若定义存在 → 渲染为上标链接；定义不存在 → 字面输出 `[^id]`。
4. 同一 `id` 可多次引用（上标编号按首次出现顺序分配）。
5. 脚注定义渲染到文档末尾（或指定容器）。

**HTML 输出示例**
```html
<!-- 引用处 -->
<sup id="fnref-1"><a href="#fn-1" class="bmk-footnote-ref">[1]</a></sup>

<!-- 脚注定义区 -->
<section class="bmk-footnotes">
  <p id="fn-1" class="bmk-footnote-def">
    <a href="#fnref-1" class="bmk-footnote-back">↩</a> 脚注内容
  </p>
</section>
```

**正例**
```
正文引用脚注[^1]，另一处[^note]。

[^1]: 第一个脚注
[^note]: 另一个脚注
```

**反例 / 边界**
```
[^undefined]       → 字面 [^undefined]（无对应定义）
[^1][^1]           → 两次引用同一脚注，编号相同，上标重复出现
[^ 1]              → id 含空格，字面输出
```

---

## 三、GFM 与 CommonMark 的差异说明

| 特性 | CommonMark | GFM |
|------|-----------|-----|
| 表格 | 不支持 | 支持 |
| 删除线 | 不支持 | 支持 `~~` |
| Task List | 不支持 | 支持 `[ ]`/`[x]` |
| 裸 URL Autolink | 不支持 | 支持 |
| 脚注 | 不支持 | 支持 `[^id]` |
| Disallowed Raw HTML | 允许所有 | 过滤部分危险标签（`<script>`、`<style>` 等输出为字面）|

---

## 四、GFM 类型编号约定

```typescript
enum GFMBlockType {
  Table       = 100,
  FootnoteDef = 101,
}

enum GFMNodeType {
  Del          = 100,   // ~~strikethrough~~
  FootnoteRef  = 101,   // [^id] 引用
}
```

核心类型编号 1–99，GFM 100–199，用户自定义从 200 起。
