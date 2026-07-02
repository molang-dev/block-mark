import {
  BlockMakerPlugin, Block, Node, BlockType, NodeType, LinkType, HtmlCtx,
} from '../core/types'

// ─── helpers ─────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ─── Block HTML renderers ─────────────────────────────────────────────────────

function renderHeading(block: Block, ctx: HtmlCtx): string {
  const d = block.depth ?? 1
  const inner = ctx.renderNodes(block.markdown?.[0]?.children ?? [])
  return `<h${d}>${inner}</h${d}>`
}

function renderParagraph(block: Block, ctx: HtmlCtx): string {
  const inner = ctx.renderNodes(block.markdown?.[0]?.children ?? [])
  return inner ? `<p>${inner}</p>` : ''
}

function renderCode(block: Block): string {
  const node = block.markdown?.[0]
  if (!node) return ''
  const langClass = node.lang ? ` class="language-${esc(node.lang)}"` : ''
  const text = esc(node.text ?? '')
  return `<pre><code${langClass}>${text}</code></pre>`
}

function renderBlockquote(block: Block, ctx: HtmlCtx): string {
  const inner = ctx.renderNodes(block.markdown ?? [])
  return `<blockquote>${inner}</blockquote>`
}

function renderHr(): string {
  return `<hr>`
}

function renderHtml(block: Block): string {
  return block.markdown?.[0]?.text ?? ''
}

function renderDef(): string {
  return ''
}

function renderList(block: Block, ctx: HtmlCtx): string {
  const node = block.markdown?.[0]
  if (!node) return ''
  return renderListNode(node, ctx)
}

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
      return renderNodeHtml(child, ctx)
    }).join('')
    return `<li>${content}</li>`
  }).join('')

  return `<${tag}${oAttr}>${items}</${tag}>`
}

// ─── Inline node HTML renderers ───────────────────────────────────────────────

function renderNodeHtml(node: Node, ctx: HtmlCtx): string {
  const kids = () => ctx.renderNodes(node.children ?? [])
  switch (node.type) {
    case NodeType.Text:      return esc(node.text ?? '')
    case NodeType.Escape:    return node.text ? esc(node.text) : ''
    case NodeType.Tag:       return node.text ?? ''
    case NodeType.Em:        return `<em>${kids()}</em>`
    case NodeType.Strong:    return `<strong>${kids()}</strong>`
    case NodeType.Codespan:  return `<code>${esc(node.text ?? '')}</code>`
    case NodeType.Br:        return ' '
    case NodeType.HardBr:    return '<br>'
    case NodeType.Link:
    case NodeType.LinkRef: {
      const href = esc(node.url ?? '')
      const isEmail = node.linkType === LinkType.Email
      const hrefAttr = isEmail ? `href="mailto:${href}"` : `href="${href}"`
      const inner = node.children?.length ? kids() : esc(node.text ?? '')
      return `<a ${hrefAttr}>${inner}</a>`
    }
    case NodeType.Image: {
      const src = esc(node.url ?? node.text ?? '')
      const alt = esc((node.children ?? []).map(c => c.text ?? '').join(''))
      return `<img src="${src}" alt="${alt}">`
    }
    case NodeType.Heading:    return renderHeadingNode(node, ctx)
    case NodeType.Paragraph:  return `<p>${kids()}</p>`
    case NodeType.Blockquote: return `<blockquote>${kids()}</blockquote>`
    case NodeType.List:       return renderListNode(node, ctx)
    case NodeType.ListItem:   return `<li>${kids()}</li>`
    case NodeType.Code:       return `<pre><code>${esc(node.text ?? '')}</code></pre>`
    case NodeType.Hr:         return `<hr>`
    case NodeType.Html:       return node.text ?? ''
    default:                  return esc(node.text ?? '')
  }
}

function renderHeadingNode(node: Node, ctx: HtmlCtx): string {
  const d = node.depth ?? 1
  return `<h${d}>${ctx.renderNodes(node.children ?? [])}</h${d}>`
}

function renderLink(node: Node, ctx: HtmlCtx): string {
  const href = esc(node.url ?? '')
  const isEmail = node.linkType === LinkType.Email
  const hrefAttr = isEmail ? `href="mailto:${href}"` : `href="${href}"`
  const inner = node.children?.length
    ? ctx.renderNodes(node.children)
    : esc(node.text ?? '')
  return `<a ${hrefAttr}>${inner}</a>`
}

function renderImage(node: Node, ctx: HtmlCtx): string {
  const src = esc(node.url ?? node.text ?? '')
  const alt = esc((node.children ?? []).map(c => c.text ?? '').join(''))
  return `<img src="${src}" alt="${alt}">`
}

// ─── Plugin export ────────────────────────────────────────────────────────────

export const blockMakerHtml: BlockMakerPlugin = {
  name: 'html',

  htmlBlock: {
    [BlockType.Heading]:    (block, ctx) => renderHeading(block, ctx),
    [BlockType.Paragraph]:  (block, ctx) => renderParagraph(block, ctx),
    [BlockType.Code]:       (block)      => renderCode(block),
    [BlockType.Blockquote]: (block, ctx) => renderBlockquote(block, ctx),
    [BlockType.Hr]:         ()           => renderHr(),
    [BlockType.Html]:       (block)      => renderHtml(block),
    [BlockType.Def]:        ()           => renderDef(),
    [BlockType.List]:       (block, ctx) => renderList(block, ctx),
  },

  htmlNode: {
    [NodeType.Text]:       (node)       => esc(node.text ?? ''),
    [NodeType.Escape]:     (node)       => node.text ? esc(node.text) : '',
    [NodeType.Tag]:        (node)       => node.text ?? '',
    [NodeType.Em]:         (node, ctx)  => `<em>${ctx.renderNodes(node.children ?? [])}</em>`,
    [NodeType.Strong]:     (node, ctx)  => `<strong>${ctx.renderNodes(node.children ?? [])}</strong>`,
    [NodeType.Codespan]:   (node)       => `<code>${esc(node.text ?? '')}</code>`,
    [NodeType.Br]:         ()           => ' ',
    [NodeType.HardBr]:     ()           => '<br>',
    [NodeType.Link]:       (node, ctx)  => renderLink(node, ctx),
    [NodeType.LinkRef]:    (node, ctx)  => renderLink(node, ctx),
    [NodeType.Image]:      (node, ctx)  => renderImage(node, ctx),
    [NodeType.Heading]:    (node, ctx)  => renderHeadingNode(node, ctx),
    [NodeType.Paragraph]:  (node, ctx)  => `<p>${ctx.renderNodes(node.children ?? [])}</p>`,
    [NodeType.Blockquote]: (node, ctx)  => `<blockquote>${ctx.renderNodes(node.children ?? [])}</blockquote>`,
    [NodeType.List]:       (node, ctx)  => renderListNode(node, ctx),
    [NodeType.ListItem]:   (node, ctx)  => `<li>${ctx.renderNodes(node.children ?? [])}</li>`,
    [NodeType.Code]:       (node)       => `<pre><code>${esc(node.text ?? '')}</code></pre>`,
    [NodeType.Hr]:         ()           => `<hr>`,
    [NodeType.Html]:       (node)       => node.text ?? '',
  },
}
