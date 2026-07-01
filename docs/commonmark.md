# CommonMark 语法规范

本文档按优先级顺序逐条列举 BlockMaker 核心层支持的 CommonMark 语法规则。
编码时以本文档为依据，每条规则对应至少一个正例和一个边界/反例测试。

规范参考：https://spec.commonmark.org/0.31.2/

---

## 一、块结构（Block Structure）

块按以下优先级依次检测。高优先级规则先匹配，匹配成功则不再向下检测。

---

### B-01 空行（Blank Line）

**规则**
- 仅包含空格或 Tab 的行视为空行。
- 空行不独立成块，作为块之间的分隔符处理。
- 空行合并至上一个块的 `lines` 末尾（用于 loose list 检测和段落边界）。

**正例**
```
line one

line two
```
→ 两个 Paragraph，各自 lines 末尾带 `""`。

**边界**
- 全 Tab 行视为空行。
- 连续多个空行等同一个空行，不产生多余块。

---

### B-02 ATX Heading

**规则**
- 行首 0–3 个空格，后跟 1–6 个 `#`，后跟至少一个空格（或行尾）。
- `#` 数量决定 `depth`（1–6）。
- 行尾可选闭合 `#`（前需有空格），闭合 `#` 不计入内容。
- 内容前后空格剥除。
- 7 个及以上 `#` 不识别为 Heading。

**正例**
```
# H1
## H2 ##
### H3 ###   
  #### H4
```

**反例 / 边界**
```
#no-space          → Paragraph（# 后无空格）
####### too-deep   → Paragraph（7 个 #）
    # 4-space      → 缩进代码块（前导 4 空格）
#                  → Heading depth=1，内容为空（# 后无内容合法）
```

---

### B-03 Setext Heading

**规则**
- 一行或多行普通文本（段落内容），紧接着一行全为 `=` 或 `-`（至少 1 个，可有尾随空格）。
- `=` 行 → depth=1；`-` 行 → depth=2。
- 前导空格 0–3 个合法；4 个前导空格不识别。
- Setext 下划线行不能与其他块（如列表项、块引用）混用。
- 下划线行前的内容不能为空（空内容不产生 Setext Heading）。

**正例**
```
Title
=====

Sub Title
---------
```

**反例 / 边界**
```
    ---         → 可能识别为 HR（非 Setext，因为前导 4 空格）
Foo
---bar          → Paragraph + Paragraph（下划线行含非 - 字符）

            → 空内容 + === → 不是 Heading，=== 识别为 HR
```

---

### B-04 缩进代码块（Indented Code Block）

**规则**
- 每行前导 4 个以上空格（或 1 个 Tab），剥除 4 个空格后作为代码内容。
- 不能出现在列表项内容的第一行（列表项第一行不触发缩进代码块）。
- 块内空行保留（只要下一非空行仍满足 4 空格条件）。
- 段落中途不能被缩进代码块中断（lazy continuation 优先）。

**正例**
```
    code line 1
    code line 2

    code line 3 after blank
```
→ 一个 Code 块，内容含中间空行。

**反例 / 边界**
```
   code          → 只有 3 空格，识别为 Paragraph
paragraph
    continuation → 段落懒续行，不切换为代码块
```

---

### B-05 围栏代码块（Fenced Code Block）

**规则**
- 开启行：0–3 空格前导 + 3 个以上 `` ` `` 或 `~`（两者不可混用）。
- 开启行之后可有 info string（语言标识），不含 `` ` ``。
- 关闭行：与开启符相同类型，长度 ≥ 开启行，前导 0–3 空格，无 info string。
- 文档结束前未关闭 → 到文档末尾为止。
- 围栏内空行保留；围栏本身不计入内容。
- 开启行前导空格数 N（0–3），内容每行剥除最多 N 个前导空格。

**正例**
````
```js
const x = 1
```

~~~python
def foo():
    pass
~~~
````

**反例 / 边界**
````
```js
no closing fence   → 到文档末尾，lang=js
``` extra           → 有效（关闭行后的内容忽略）
~~~ not closed
with backtick ```  → 不关闭（类型不同）
~~~
````

---

### B-06 HTML 块（HTML Block）

CommonMark 定义 7 种 HTML 块类型，按优先级匹配：

| 类型 | 开启条件 | 关闭条件 |
|------|----------|----------|
| 1 | `<script`、`<pre`、`<style`（大小写不敏感） | 对应 `</script>`、`</pre>`、`</style>` |
| 2 | `<!--` | `-->` |
| 3 | `<?` | `?>` |
| 4 | `<!` + 大写字母 | `>` |
| 5 | `<![CDATA[` | `]]>` |
| 6 | `<` 或 `</` + 特定块级标签（div、p、table 等） | 空行 |
| 7 | 完整开标签或闭标签（非 type 6 标签）| 空行 |

**规则**
- Type 1–5：关闭符在同行也合法；未关闭则持续到文档末尾。
- Type 6–7：空行关闭。
- Type 7 不能中断段落。
- HTML 块内容原样保留，不做 inline 解析。

**正例**
```html
<div>
  raw html
</div>

<!-- comment -->

<table>
  <tr><td>cell</td></tr>
</table>
```

**反例 / 边界**
```
<div>inline</div>   → 仍是 HTML 块（type 6 或 7）
<Div>               → 大小写不敏感，type 6
<div
  multi-line>       → 开标签未在首行闭合，type 7 不识别，fallback Paragraph
```

---

### B-07 链接引用定义（Link Reference Definition）

**规则**
- 格式：`[label]: url` 或 `[label]: url "title"`（title 可在下一行）。
- label 大小写不敏感，规范化后作为 key。
- label 不能为空，不能含未转义的 `[` 或 `]`。
- url 可以用 `<>` 包裹（允许空格）；不包裹时不含空格。
- title 可用 `""`、`''`、`()` 包裹。
- 定义本身不产生输出（`html` 为空字符串）。
- 同一 label 多次定义，第一个生效。

**正例**
```
[foo]: /url "title"
[bar]: <https://example.com>
  "optional title on next line"
```

**反例 / 边界**
```
[]: /empty-label     → 不识别（label 为空）
[foo]: /url title    → url=/url，title 未被引号包裹则忽略
[foo]: /url
  bad-title          → 仅当 bad-title 被引号包裹才识别为 title
```

---

### B-08 块引用（Block Quote）

**规则**
- 每行以 `>` 开头（前导 0–3 空格），`>` 后可选一个空格。
- 连续的块引用行合并为一个 Block Quote 块。
- 块引用内部递归识别块结构（heading、list、code fence 等）。
- 懒续行：段落的续行不需要 `>`（但 code fence、list 等块不支持懒续行）。
- 嵌套：`>>` 为二级引用。

**正例**
```
> # Heading in quote
> paragraph
> continuation
>
> second paragraph

> > nested
```

**反例 / 边界**
```
> line one
lazy continuation   → 合法懒续行（属于同一 blockquote 内的段落）

> line one

not quoted          → 引用已结束（空行断开），new Paragraph
```

---

### B-09 列表（List）

列表由一个或多个**列表项（List Item）**组成。

#### B-09-1 列表项标记

- **无序**：前导 0–3 空格 + `- ` / `* ` / `+ `（标记后至少一个空格）
- **有序**：前导 0–3 空格 + 1–9 位数字 + `.` 或 `)` + 至少一个空格
- 同一列表内标记符必须一致（`-` 和 `*` 不合并）；`.` 和 `)` 不合并。

#### B-09-2 W 值（内容缩进阈值）

```
W = 前导空格数 + 标记长度 + min(实际空格数, 4)
```
- 实际空格数 ≥ 5 时，eff = 1，多余空格计入内容。
- 续行缩进 ≥ W 才属于本 item 内容，否则终止 item。

#### B-09-3 续行与子列表

- item 内容行：缩进 ≥ W，剥除 W 个字符后递归解析。
- 子列表：内容行本身又是列表标记 → 递归 `buildList`。
- item 内空行：合法，标记 `itemEndedWithBlank=true`。

#### B-09-4 Loose vs Tight

- 列表项之间有空行 → 整个列表标记为 **loose**。
- item 内容含子段落（由空行分隔）→ loose。
- loose 列表：每个 item 的段落用 `<p>` 包裹。
- tight 列表：段落内容直接渲染，不加 `<p>`。

#### B-09-5 列表边界

以下情况终止列表收集：
- 2 个连续空行
- 0 前导空格的非标记行（段落等）
- 块级中断：ATX Heading、HR、围栏代码块、HTML 块、块引用

**正例**
```
- item 1
- item 2
  - sub item
  - sub item 2
- item 3

1. first
2. second
   continuation of second
3. third
```

**反例 / 边界**
```
-no-space           → Paragraph（标记后无空格）
1234567890. item    → Paragraph（数字超过 9 位）
- item
    4space          → item 内容（4 空格 ≥ W=2，continuation）

- a

- b                 → loose 列表（中间有空行）
```

---

### B-10 分割线（Thematic Break）

**规则**
- 前导 0–3 空格 + 3 个以上 `-`、`*` 或 `_`，各符号间可有空格/Tab，行尾可有空格。
- 三种符号不可混用。
- 可以中断段落。
- `---` 与 Setext Heading 的 `---` 优先级：若上方有段落内容则识别为 Setext Heading，否则识别为 HR。

**正例**
```
---
***
___
- - -
* * * *
```

**反例 / 边界**
```
--           → Paragraph（不足 3 个）
- - -x       → Paragraph（含非空白字符）
```

---

### B-11 段落（Paragraph）

**规则**
- 所有不符合以上规则的行归入 Paragraph。
- 连续非空行合并为一个 Paragraph。
- 懒续行：块引用内的段落续行无需 `>` 前缀。
- 段落不能被缩进代码块、列表（当段落已开始时列表可中断）中断，但可被 ATX Heading、HR、围栏代码块、HTML 块中断。
- 段落内容做 inline 解析。

**正例**
```
This is a paragraph.
Still the same paragraph.

New paragraph.
```

**边界**
```
Paragraph
## Heading      → Heading 中断段落（ATX 合法）

Paragraph
---             → 识别为 Setext Heading（不是段落 + HR）
```

---

## 二、行内结构（Inline Structure）

行内解析在段落、heading、list item 内容等块的文本内容上运行。

---

### I-01 反斜杠转义（Backslash Escape）

**规则**
- `\` 后跟 ASCII 标点字符 → 转义为字面字符，不触发特殊语法。
- `\` 后跟非标点 → `\` 字面输出。
- 支持转义的标点：`` !"#$%&'()*+,-./:;<=>?@[\]^_`{|}~ ``

**正例**
```
\*not em\*     → *not em*
\\ backslash   → \ backslash
```

**反例**
```
\a             → \a（a 不是标点，不转义）
```

---

### I-02 字符引用（Character Reference）

**规则**
- 具名引用：`&name;`（如 `&amp;`、`&lt;`）
- 十进制数字引用：`&#NNN;`（1–7 位）
- 十六进制数字引用：`&#xHHH;`（1–6 位，大小写不敏感）
- 无效引用原样输出。

**正例**
```
&amp; &lt; &gt; &quot;
&#42; &#x2A;
```

---

### I-03 Code Span

**规则**
- 用等数量的 `` ` `` 包裹（1 个或多个）。
- 开闭反引号数量必须相同。
- 内容前后各有一个空格时，剥除该空格（仅当内容不是全空格时）。
- 不做进一步 inline 解析。
- 跨行：换行符替换为空格。

**正例**
```
`code`
``code with `backtick` inside``
` code with spaces `
```

**反例 / 边界**
```
`unclosed      → 字面 `unclosed
`  `           → 全空格，不剥除（保留两空格）
```

---

### I-04 强调（Emphasis & Strong）

**规则**
- `*` 或 `_` 包裹。
- 单个 → em；双 → strong；三个 → strong + em。
- **Left-flanking**：紧接非空白，前一字符为空白或标点（或行首）。
- **Right-flanking**：前紧接非空白，后一字符为空白或标点（或行尾）。
- `*` 系列：left-flanking 可开启，right-flanking 可关闭。
- `_` 系列：额外要求前后不能是 Unicode 字母/数字（防止词内 `_`）。
- 嵌套合法（em 内 strong 等）。

**正例**
```
*em* **strong** ***both***
_em_ __strong__
**nested *em* inside**
```

**反例 / 边界**
```
_ not em _      → 字面（空白相邻）
foo_bar_baz     → 字面（_ 在词内）
*unclosed       → 字面
```

---

### I-05 链接（Link）

#### I-05-1 Inline Link
```
[text](url)
[text](url "title")
[text](<url with spaces>)
```

#### I-05-2 Reference Link
```
[text][id]      完整形式
[text][]        折叠形式（id = text）
[id]            快捷形式
```
- label 大小写不敏感。
- 引用未定义的 label → 字面输出。

**规则**
- 链接不可嵌套（`[link [nested]]` 不合法）。
- title 可用 `""`、`''`、`()` 包裹。
- url 中 `(` 和 `)` 需平衡或转义。

**正例**
```
[link](https://example.com)
[link](https://example.com "title")
[ref][id]
[id]

[id]: https://example.com
```

**反例 / 边界**
```
[link]()           → url 为空（合法，href=""）
[link](url (bad)   → 未平衡括号，可能截断
[[nested]](url)    → 内层 [ 不合法
```

---

### I-06 图片（Image）

**规则**
- 语法同 Inline Link，前加 `!`：`![alt](url)` / `![alt][ref]`。
- `alt` 文本做 inline 解析但仅取文本值（去除标记）。

**正例**
```
![alt text](image.png)
![alt text](image.png "title")
![alt][ref]
```

---

### I-07 Autolink（角括号）

**规则**
- `<scheme://...>`：scheme 为 2–32 个字母/数字/`+`/`-`/`.`，后跟 `://` + 非空白非 `<>` 字符。
- `<email>`：满足 RFC 5322 简化格式的 email。
- 内容不做进一步解析。

**正例**
```
<https://example.com>
<user@example.com>
<ftp://file.txt>
```

**反例**
```
<not a url>     → Raw HTML 标签或字面
<>              → 字面
```

---

### I-08 Raw HTML（行内）

**规则**
- 开标签：`<tagname attr="val">`
- 闭标签：`</tagname>`
- 自闭合：`<tagname />`
- 注释：`<!-- ... -->`
- 处理指令：`<? ... ?>`
- 声明：`<! ... >`
- CDATA：`<![CDATA[...]]>`
- 原样保留，不转义。

---

### I-09 硬换行（Hard Line Break）

**规则**
- 行尾 2 个以上空格 + 换行 → `<br>`。
- 行尾 `\` + 换行 → `<br>`。
- code span、HTML 块内不适用。

**正例**
```
line one  
line two

line one\
line two
```

---

### I-10 软换行（Soft Line Break）

**规则**
- 普通换行（非硬换行）→ 空格（HTML 渲染时）或保留 `\n`（AST 中为 `Br` 节点，类型标记为 soft）。
- 段落内连续行之间默认为软换行。

---

## 三、优先级总结

块结构优先于行内结构。块识别顺序：

```
B-01 空行 → B-02 ATX Heading → B-03 Setext Heading →
B-04 缩进代码块 → B-05 围栏代码块 → B-06 HTML块 →
B-07 链接引用定义 → B-08 块引用 → B-09 列表 →
B-10 分割线 → B-11 段落
```

行内识别顺序（同一位置多规则冲突时）：
```
转义 → code span → raw HTML / autolink → 强调开启符 →
链接/图片 → 字符引用 → 普通文本
```
