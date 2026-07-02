// ─── Dirty flag ───────────────────────────────────────────────────────────────

export enum DirtyFlag {
  Clean   = 0,
  Shifted = 1,
  Changed = 2,
}

// ─── Core block types (module 10, block=1) ───────────────────────────────────

export enum BlockType {
  Heading    = 101001,
  Paragraph  = 101002,
  List       = 101003,
  Code       = 101004,
  Blockquote = 101005,
  Hr         = 101006,
  Html       = 101007,
  Def        = 101008,
  Toc        = 101009,
}

// ─── Core node types (module 10, node=2) ─────────────────────────────────────

export enum NodeType {
  Text       = 102001,
  Em         = 102002,
  Strong     = 102003,
  Codespan   = 102004,
  Link       = 102005,
  LinkRef    = 102006,
  Image      = 102007,
  Br         = 102008,
  HardBr     = 102009,
  Escape     = 102010,
  Tag        = 102011,
  Heading    = 102012,
  Paragraph  = 102013,
  Blockquote = 102014,
  List       = 102015,
  ListItem   = 102016,
  Code       = 102017,
  Hr         = 102018,
  Html       = 102019,
  Def        = 102020,
}

export enum LinkType {
  Url   = 1,
  Email = 2,
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
  index: number
  lineStart: number
  lineEnd: number
  dirty: DirtyFlag
  depth?: number
  meta?: string
  markdown?: Node[]
  html?: string
}

// ─── Parsing contexts ─────────────────────────────────────────────────────────

export interface BlockContext {
  defs: Map<string, { url: string; blockIndex: number }>
  refs: Array<{ node: Node; blockIndex: number }>
  blockIndex: number
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
}

export interface BlockMakerOptions {
  showTypeName?: boolean
  batchSizes?: number[]
  /** When false, only fenced code (``` / ~~~) is recognized; ≥4-space indent is not code. Default: true */
  indentedCode?: boolean
  /** When true, inserts a TOC block after the first heading. Default: false */
  toc?: boolean
}

export type ChangedCallback = (blocks: Block[], isEnd: boolean) => void
