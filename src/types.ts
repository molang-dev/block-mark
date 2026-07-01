export enum BlockType {
  Heading    = 1,
  Paragraph,
  List,
  Code,
  Table,
  Blockquote,
  Hr,
  Html,
  Def,
}

export enum NodeType {
  Blockquote = 1,
  Br,
  Checkbox,
  Code,
  Codespan,
  Def,
  Del,
  Em,
  Escape,
  Generic,
  Heading,
  Hr,
  HTML,
  Image,
  Link,
  List,
  ListItem,
  Paragraph,
  Space,
  Strong,
  Table,
  TableCell,
  TableRow,
  Tag,
  Text,
}

export enum LinkType {
  URL   = 1,
  Email,
  Ref,
  Sup,
}

export interface Node {
  type: NodeType
  text?: string
  children?: Node[]
  depth?: number
  lang?: string
  linkType?: LinkType
  defId?: string
  href?: string
}

export interface ParseContext {
  defs: Map<string, { url: string, blockIndex: number }>
  refs: Array<{ node: Node, blockIndex: number }>
  blockIndex: number
}

export interface TypedBlock {
  type: BlockType
  lines: string[]
  depth?: number
  index: number
  lineStart: number
  lineEnd: number
  dirty: number
  markdown: Node[]
}

export type BlockCallback = (blocks: TypedBlock[], isEnd: boolean) => void
