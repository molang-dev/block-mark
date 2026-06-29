export type BlockType =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'code'
  | 'table'
  | 'blockquote'
  | 'hr'
  | 'html'

export interface TypedBlock {
  type: BlockType
  lines: string[]
  depth?: number
  index: number
  lineStart: number
  lineEnd: number
  dirty?: number
}

export type BlockCallback = (blocks: TypedBlock[], isEnd: boolean) => void
