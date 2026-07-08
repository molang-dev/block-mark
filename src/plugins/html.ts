import {
  BlockMakerPlugin, Block, Node, BlockType, NodeType, LinkType, HtmlCtx,
} from '../core/types'

// ─── helpers ─────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ─── List node renderer (shared by htmlNode and nested lists) ─────────────────

function renderListNode(node: Node, ctx: HtmlCtx): string {
  const loose   = node.loose === true
  const ordered = node.ordered === true
  const start   = node.start ?? 1
  const tag     = ordered ? 'ol' : 'ul'
  const oAttr   = ordered && start !== 1 ? ` start="${start}"` : ''

  const items = (node.children ?? []).map(item => {
    const content = (item.children ?? []).map(child => {
      if (!loose && child.type === NodeType.Paragraph) {
        return ctx.renderNodes(child.children ?? [])
      }
      return ctx.renderNodes([child])
    }).join('')
    return `<li>${content}</li>`
  }).join('')

  return `<${tag}${oAttr}>${items}</${tag}>`
}

// ─── Inline node HTML renderers ───────────────────────────────────────────────

function renderLink(node: Node, ctx: HtmlCtx): string {
  const href = esc(node.url ?? '')
  const isEmail = node.linkType === LinkType.Email
  const hrefAttr = isEmail ? `href="mailto:${href}"` : `href="${href}"`
  const inner = node.children?.length
    ? ctx.renderNodes(node.children)
    : esc(node.text ?? '')
  return `<a ${hrefAttr}>${inner}</a>`
}

function renderImage(node: Node): string {
  const src = esc(node.url ?? node.text ?? '')
  const alt = esc((node.children ?? []).map(c => c.text ?? '').join(''))
  return `<img src="${src}" alt="${alt}">`
}

// ─── Plugin export ────────────────────────────────────────────────────────────

export const blockMakerHtml: BlockMakerPlugin = {
  name: 'html',

  htmlBlock: {
    [BlockType.Heading]: (block, ctx) => {
      const html = ctx.renderNodes(block.markdown ?? [])
      return html.replace(/^(<h\d)>/, `$1 id="bmd-h-${block.id}">`)
    },
    [BlockType.Toc]: (block, ctx) => {
      const nodes = block.markdown ?? []
      if (nodes.length === 0) return ''
      const parts: string[] = []
      const stack: number[] = []
      for (const node of nodes) {
        const d = node.depth ?? 1
        const link = `<a href="${ctx.escape(node.url ?? '')}">${ctx.renderNodes(node.children ?? [])}</a>`
        if (stack.length === 0) {
          parts.push('<ul>', '<li>', link); stack.push(d)
        } else {
          const top = stack[stack.length - 1]
          if (d > top) {
            parts.push('<ul>', '<li>', link); stack.push(d)
          } else if (d === top) {
            parts.push('</li>', '<li>', link)
          } else {
            while (stack.length > 0 && stack[stack.length - 1] > d) {
              parts.push('</li>', '</ul>'); stack.pop()
            }
            if (stack.length > 0 && stack[stack.length - 1] === d) parts.push('</li>', '<li>', link)
            else { parts.push('<li>', link); stack.push(d) }
          }
        }
      }
      while (stack.length > 0) { parts.push('</li>', '</ul>'); stack.pop() }
      return `<nav>${parts.join('')}</nav>`
    },
    [BlockType.Paragraph]:  (block, ctx) => ctx.renderNodes(block.markdown ?? []),
    [BlockType.Code]:       (block, ctx) => ctx.renderNodes(block.markdown ?? []),
    [BlockType.Blockquote]: (block, ctx) => ctx.renderNodes(block.markdown ?? []),
    [BlockType.Hr]:         (block, ctx) => ctx.renderNodes(block.markdown ?? []),
    [BlockType.Html]:       (block, ctx) => ctx.renderNodes(block.markdown ?? []),
    [BlockType.Def]:        (block, ctx) => ctx.renderNodes(block.markdown ?? []),
    [BlockType.List]:       (block, ctx) => ctx.renderNodes(block.markdown ?? []),
  },

  htmlNode: {
    [NodeType.Text]:       (node)       => esc(node.text ?? ''),
    [NodeType.Escape]:     (node)       => node.text ? esc(node.text) : '',
    [NodeType.Tag]:        (node)       => node.text ?? '',
    [NodeType.Italic]:     (node, ctx)  => `<em>${ctx.renderNodes(node.children ?? [])}</em>`,
    [NodeType.Bold]:       (node, ctx)  => `<strong>${ctx.renderNodes(node.children ?? [])}</strong>`,
    [NodeType.BoldItalic]: (node, ctx)  => `<strong><em>${ctx.renderNodes(node.children ?? [])}</em></strong>`,
    [NodeType.Codespan]:   (node)       => `<code>${esc(node.text ?? '')}</code>`,
    [NodeType.Br]:         ()           => ' ',
    [NodeType.HardBr]:     ()           => '<br>',
    [NodeType.Link]:       (node, ctx)  => renderLink(node, ctx),
    [NodeType.LinkRef]:    (node, ctx)  => renderLink(node, ctx),
    [NodeType.Image]:      (node)       => renderImage(node),
    [NodeType.Heading]:    (node, ctx)  => { const d = node.depth ?? 1; return `<h${d}>${ctx.renderNodes(node.children ?? [])}</h${d}>` },
    [NodeType.Paragraph]:  (node, ctx)  => `<p>${ctx.renderNodes(node.children ?? [])}</p>`,
    [NodeType.Blockquote]: (node, ctx)  => `<blockquote>${ctx.renderNodes(node.children ?? [])}</blockquote>`,
    [NodeType.List]:       (node, ctx)  => renderListNode(node, ctx),
    [NodeType.ListItem]:   (node, ctx)  => `<li>${ctx.renderNodes(node.children ?? [])}</li>`,
    [NodeType.Code]:       (node)       => { const lc = node.lang ? ` class="language-${esc(node.lang)}"` : ''; return `<pre><code${lc}>${esc(node.text ?? '')}</code></pre>` },
    [NodeType.Hr]:         ()           => `<hr>`,
    [NodeType.Html]:       (node)       => node.text ?? '',
    [NodeType.Def]:        ()           => '',
  },
}
