/** TypedBlock 类型标签 */
export type BlockType =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'code'
  | 'table'
  | 'blockquote'
  | 'hr'
  | 'html'

/** Parser 产出的一级 block 单元 */
export interface TypedBlock {
  type: BlockType
  /** 原始行数组，不删减、不拼接、空行空格皆保留 */
  lines: string[]
  /** heading 专用，1-6 */
  depth?: number
}

export type BlockCallback = (block: TypedBlock) => void
export type DoneCallback = () => void
