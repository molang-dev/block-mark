// ─── BlockMaker (new API) ─────────────────────────────────────────────────────

export { BlockMaker } from './core/BlockMaker'
export type {
  Block, Node, BlockMakerPlugin, BlockMakerOptions, ChangedCallback,
  BlockRule, InlineRule, BlockContext, InlineContext, HtmlCtx, BlockProcessorCtx,
} from './core/types'
export { DirtyFlag, BlockType, NodeType, LinkType } from './core/types'
export { blockMakerGFM, GFMBlockType, GFMNodeType } from './plugins/gfm'
export { blockMakerHtml } from './plugins/html'

// ─── Legacy API (kept for compatibility with existing demos) ─────────────────

export { Parser } from './parser'
export { parseInline as parseInlineLegacy } from './inline'
export type { TypedBlock, BlockCallback } from './types'
export { BlockType as LegacyBlockType, NodeType as LegacyNodeType } from './types'
export type { Node as LegacyNode } from './types'
export { block2str, blocks2str } from './util'
export { render_html } from './render_html'
