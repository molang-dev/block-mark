import type { BlockMakerPlugin, Block } from '../core/types'
import { DirtyFlag } from '../core/types'

// GFMBlockType.FootnoteDef — grouped into <hr><ol> at the end of the container
const FN_TYPE = 111002

export interface DomConfig {
  id: string
}

export function blockMakerDom(config: DomConfig): BlockMakerPlugin {
  const domMap = new Map<number, HTMLElement>()
  let container: HTMLElement | null = null
  let fnContainer: HTMLElement | null = null

  function getContainer(): HTMLElement | null {
    if (!container) container = document.getElementById(config.id)
    return container
  }

  return {
    name: `dom-${config.id}`,

    onChanged(changedBlocks: Block[], deletedIds: number[], allBlocks: Block[]) {
      const el = getContainer()
      if (!el) return

      // 1. Remove deleted elements
      for (const id of deletedIds) {
        const dom = domMap.get(id)
        if (dom) { dom.remove(); domMap.delete(id) }
      }

      // 2. Create/update elements for changed blocks (skip footnotes)
      for (const b of changedBlocks) {
        if (b.type === FN_TYPE) continue
        let dom = domMap.get(b.id)
        if (!dom) {
          dom = document.createElement('div')
          dom.dataset.bmdBlock = String(b.id)
          domMap.set(b.id, dom)
        }
        if (b.dirty >= DirtyFlag.Changed) dom.innerHTML = b.html ?? ''
      }

      // 3. Ensure every non-footnote block has an element (e.g. TOC with id=0)
      const mainBlocks = allBlocks.filter(b => b.type !== FN_TYPE)
      for (const b of mainBlocks) {
        let dom = domMap.get(b.id)
        if (!dom) {
          dom = document.createElement('div')
          dom.dataset.bmdBlock = b.id === 0 ? 'toc' : String(b.id)
          dom.innerHTML = b.html ?? ''
          domMap.set(b.id, dom)
        } else if (b.id === 0) {
          // TOC is synthetic (not in changedBlocks); always sync its html
          dom.innerHTML = b.html ?? ''
        }
      }

      // 4. Reconcile DOM order (reverse iteration keeps insertBefore stable)
      const fnAnchor = fnContainer?.parentElement === el ? fnContainer : null
      let anchor: Element | null = fnAnchor
      for (let i = mainBlocks.length - 1; i >= 0; i--) {
        const dom = domMap.get(mainBlocks[i].id)!
        if (dom.parentElement !== el || dom.nextElementSibling !== anchor) el.insertBefore(dom, anchor)
        anchor = dom
      }

      // 5. Footnotes — always rebuild the grouped section
      const fnBlocks = allBlocks.filter(b => b.type === FN_TYPE)
      if (fnBlocks.length) {
        if (!fnContainer) {
          fnContainer = document.createElement('div')
          fnContainer.dataset.bmdFootnotes = ''
        }
        fnContainer.innerHTML =
          `<hr><ol>${fnBlocks.map(b => `<li id="bmd-fn-${b.meta}">${b.html ?? ''}</li>`).join('')}</ol>`
        if (fnContainer.parentElement !== el) el.appendChild(fnContainer)
      } else if (fnContainer?.parentElement === el) {
        fnContainer.remove()
      }
    },
  }
}
