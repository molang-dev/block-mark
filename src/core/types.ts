// ─── Dirty flag ───────────────────────────────────────────────────────────────

export enum DirtyFlag {
  Clean   = 0, // content and position unchanged
  Shifted = 1, // position changed (line numbers shifted), content unchanged
  Changed = 2, // content changed, needs re-render
}

// ─── Core block types (module 10, block=1) ───────────────────────────────────

export enum BlockType {
  Heading    = 101001, // ATX heading (# … ######) or setext heading
  Paragraph  = 101002, // plain text paragraph
  List       = 101003, // ordered or unordered list
  Code       = 101004, // fenced (``` … ```) or indented code block
  Blockquote = 101005, // block quote (> …)
  Hr         = 101006, // thematic break (---, ***, ___)
  Html       = 101007, // raw HTML block (stands alone on its own lines)
  Def        = 101008, // link reference definition ([label]: url)
  Toc        = 101009, // table-of-contents placeholder ([toc])
}

// ─── Core node types (module 10, node=2) ─────────────────────────────────────

export enum NodeType {
  Text       = 102001, // plain text run
  Italic     = 102002, // emphasis (* or _)
  Bold       = 102003, // strong emphasis (** or __)
  Codespan   = 102004, // inline code (` … `)
  Link       = 102005, // inline or autolink ([text](url) or <url>)
  LinkRef    = 102006, // reference-style link ([text][label])
  Image      = 102007, // image (![alt](url))
  Br         = 102008, // soft line break (newline within a paragraph)
  HardBr     = 102009, // hard line break (two trailing spaces or backslash + newline)
  Escape     = 102010, // backslash escape or HTML entity (\*, &amp;)
  Tag        = 102011, // inline raw HTML tag (<span>, <!-- -->, etc.)
  Heading    = 102012, // heading node inside a block's markdown tree
  Paragraph  = 102013, // paragraph node inside a block's markdown tree
  Blockquote = 102014, // blockquote node inside a block's markdown tree
  List       = 102015, // list node inside a block's markdown tree
  ListItem   = 102016, // individual list item
  Code       = 102017, // code block node inside a block's markdown tree
  Hr         = 102018, // thematic break node inside a block's markdown tree
  Html       = 102019, // raw HTML node inside a block's markdown tree
  Def        = 102020, // link definition node inside a block's markdown tree
  BoldItalic = 102021, // bold + italic combined (*** or ___)
}

export enum LinkType {
  Url   = 1, // URL autolink or inline link
  Email = 2, // email autolink (<user@example.com>)
}

// ─── AST node ─────────────────────────────────────────────────────────────────

export interface Node {
  type: number
  typeName?: string
  text?: string
  children?: Node[]
  url?: string
  defId?: string
  depth?: number
  lang?: string
  loose?: boolean
  ordered?: boolean
  start?: number
  linkType?: LinkType
  align?: Array<'left' | 'right' | 'center' | null>
  meta?: string
}

// ─── Block ────────────────────────────────────────────────────────────────────

export interface Block {
  type: number
  typeName?: string
  lines: string[]
  id: number      // stable unique id, monotonically increasing from 1; 0 = unassigned
  order: number   // position in blocks array, reassigned on every update
  lineStart: number
  lineEnd: number
  dirty: DirtyFlag
  depth?: number
  meta?: string
  markdown?: Node[]
  html?: string
  skip?: boolean
}

// ─── Parsing contexts ─────────────────────────────────────────────────────────

export interface BlockContext {
  defs: Map<string, { url: string; blockIndex: number }>
  refs: Array<{ node: Node; blockIndex: number }>
  blockIndex: number
  docLineStart: number  // absolute line number of lines[0] in _subdivide
  disableIndentedCode?: boolean
}

export interface InlineContext {
  defs: Map<string, { url: string; blockIndex: number }>
  refs: Array<{ node: Node; blockIndex: number }>
  blockIndex: number
  parse(src: string): Node[]
}

export interface BlockProcessorCtx {
  parseInline(src: string): Node[]
  subdivide(lines: string[], lineStart: number): Block[]
  defs: Map<string, { url: string; blockIndex: number }>
  refs: Array<{ node: Node; blockIndex: number }>
  blockIndex: number
}

export interface HtmlCtx {
  renderNodes(nodes: Node[]): string
  renderNode(node: Node): string
  renderLines(lines: string[]): string
  escape(s: string): string
}

// ─── Plugin interfaces ────────────────────────────────────────────────────────

export interface BlockRule {
  name: string
  priority: number
  tryCollect(lines: string[], at: number, ctx: BlockContext): Block | null
}

export interface InlineRule {
  name: string
  priority: number
  trigger(ch: string, next: string): boolean
  tryParse(src: string, pos: number, ctx: InlineContext): { node: Node; length: number } | null
}

export interface BlockMakerPlugin {
  name: string
  blockRules?: BlockRule[]
  inlineRules?: InlineRule[]
  blockProcessors?: Record<number, (block: Block, ctx: BlockProcessorCtx) => Node[]>
  htmlBlock?: Record<number, (block: Block, ctx: HtmlCtx) => string>
  htmlNode?: Record<number, (node: Node, ctx: HtmlCtx) => string>
  // Separate maps avoid numeric collision between BlockType and NodeType
  blockTypeNames?: Record<number, string>
  nodeTypeNames?: Record<number, string>
  applyTheme?: (theme: string) => void
  onChanged?: (changedBlocks: Block[], deletedIds: number[], allBlocks: Block[], isEnd: boolean) => void
}

export interface BlockMakerOptions {
  showTypeName?: boolean
  batchSizes?: number[]
  /** When true, ≥4-space indent is NOT treated as code; only fenced code (``` / ~~~) is recognized. Default: false */
  disableIndentedCode?: boolean
}

export type ChangedCallback = (blocks: Block[], isEnd: boolean) => void
