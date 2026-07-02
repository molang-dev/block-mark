import { BlockMakerPlugin } from '../core/types'
import { GFMBlockType, GFMNodeType } from './gfm'

export const blockMakerMath: BlockMakerPlugin = {
  name: 'math',

  htmlBlock: {
    [GFMBlockType.MathBlock]: (block, ctx) => ctx.renderNodes(block.markdown ?? []),
  },

  htmlNode: {
    [GFMNodeType.MathBlock]:  (node) => `<div class="math-display">$$${node.text ?? ''}$$</div>`,
    [GFMNodeType.MathInline]: (node) => `<span class="math-inline">$${node.text ?? ''}$</span>`,
  },
}
