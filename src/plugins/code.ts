import { BlockMakerPlugin, Block, BlockType } from '../core/types'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function blockMakerCode(
  highlight: (code: string, lang: string) => string | null
): BlockMakerPlugin {
  return {
    name: 'code',
    htmlBlock: {
      [BlockType.Code]: (block: Block) => {
        const node = block.markdown?.[0]
        if (!node) return ''
        const lang = node.lang ?? ''
        const raw  = node.text ?? ''
        const body = lang ? (highlight(raw, lang) ?? esc(raw)) : esc(raw)
        const langClass = lang ? ` class="language-${esc(lang)}"` : ''
        return `<pre><code${langClass}>${body}</code></pre>`
      },
    },
  }
}
