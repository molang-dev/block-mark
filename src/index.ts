// ─── BlockMaker (new API) ─────────────────────────────────────────────────────

export { BlockMaker } from './core/BlockMaker'
export type {
  Block, Node, BlockMakerPlugin, BlockMakerOptions, ChangedCallback,
  BlockRule, InlineRule, BlockContext, InlineContext, HtmlCtx, BlockProcessorCtx,
} from './core/types'
export { DirtyFlag, BlockType, NodeType, LinkType } from './core/types'
export { blockMakerGFM, GFMBlockType, GFMNodeType } from './plugins/gfm'
export { blockMakerHtml } from './plugins/html'
export { blockMakerCode } from './plugins/code'

