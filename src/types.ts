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
  /** block 序号（0-based） */
  index: number
  /** block 在原文档中的起始行号（0-based） */
  lineStart: number
  /** block 在原文档中的结束行号 = lineStart + lines.length - 1 */
  lineEnd: number
}

export type BlockCallback = (block: TypedBlock) => void
export type DoneCallback = () => void
