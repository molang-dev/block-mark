export enum BlockType {
  Heading    = 1,
  Paragraph,
  List,
  Code,
  Table,
  Blockquote,
  Hr,
  Html,
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

export interface Node {
  type: NodeType
  text?: string
  children?: Node[]
  depth?: number
  lang?: string
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
