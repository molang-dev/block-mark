import { BlockMakerPlugin, BlockRule, Block, DirtyFlag } from '../core/types'

export enum MermaidBlockType {
  Diagram = 121001,
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function bl(lines: string[]): Block {
  return { type: MermaidBlockType.Diagram, lines, id: 0, order: 0, lineStart: 0, lineEnd: 0, dirty: DirtyFlag.Changed }
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

export interface MermaidConfig {
  mermaid?: {
    initialize(config: Record<string, unknown>): void
    run(): void
  }
}

export function blockMakerMermaid(config?: MermaidConfig): BlockMakerPlugin {
  const _m = config?.mermaid

  return {
    name: 'mermaid',

    blockRules: [mermaidRule],

    htmlBlock: {
      [MermaidBlockType.Diagram]: (block: Block) => {
        const lines = block.lines
        let closeIdx = lines.length - 1
        while (closeIdx > 0 && lines[closeIdx] === '') closeIdx--
        const code = lines.slice(1, lines[closeIdx]?.match(/^( {0,3})(`{3,}|~{3,})\s*$/) ? closeIdx : undefined).join('\n')
        return `<pre class="mermaid" data-source="${esc(code)}">${esc(code)}</pre>`
      },
    },

    applyTheme(theme: string) {
      if (!_m) return
      _m.initialize({ startOnLoad: false, theme: theme === 'dark' ? 'dark' : 'default' })
      document.querySelectorAll<HTMLElement>('pre.mermaid[data-source]').forEach(el => {
        el.textContent = el.dataset.source ?? ''
        el.removeAttribute('data-processed')
      })
      _m.run()
    },

    blockTypeNames: {
      [MermaidBlockType.Diagram]: 'Mermaid',
    },
  }
}
