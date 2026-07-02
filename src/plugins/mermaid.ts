import { BlockMakerPlugin, BlockRule, Block, DirtyFlag } from '../core/types'

export enum MermaidBlockType {
  Diagram = 121001,
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function bl(lines: string[]): Block {
  return { type: MermaidBlockType.Diagram, lines, index: 0, lineStart: 0, lineEnd: 0, dirty: DirtyFlag.Changed }
}

const mermaidRule: BlockRule = {
  name: 'mermaid',
  priority: 34,
  tryCollect(lines, at) {
    const openLine = lines[at]
    const om = openLine?.match(/^( {0,3})(`{3,}|~{3,})\s*mermaid\s*$/i)
    if (!om) return null
    const fenceChar = om[2][0]
    const fenceLen  = om[2].length
    const collected = [openLine]
    let i = at + 1
    while (i < lines.length) {
      const l = lines[i]
      collected.push(l); i++
      const cm = l.match(/^( {0,3})(`{3,}|~{3,})\s*$/)
      if (cm && cm[2][0] === fenceChar && cm[2].length >= fenceLen) break
    }
    return bl(collected)
  },
}

export const blockMakerMermaid: BlockMakerPlugin = {
  name: 'mermaid',

  blockRules: [mermaidRule],

  htmlBlock: {
    [MermaidBlockType.Diagram]: (block: Block) => {
      const lines = block.lines
      // strip opening fence line and closing fence line
      const code = lines.slice(1, lines[lines.length - 1]?.match(/^( {0,3})(`{3,}|~{3,})\s*$/) ? -1 : undefined).join('\n')
      return `<pre class="mermaid">${esc(code)}</pre>`
    },
  },

  blockTypeNames: {
    [MermaidBlockType.Diagram]: 'Mermaid',
  },
}
