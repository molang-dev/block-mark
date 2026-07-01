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
  return `<h${d} class="bmk-h${d}">${inner}</h${d}>`
}

function renderParagraph(block: Block, ctx: HtmlCtx): string {
  const inner = ctx.renderNodes(block.markdown?.[0]?.children ?? [])
  return inner ? `<p class="bmk-p">${inner}</p>` : ''
}

function renderCode(block: Block): string {
  const node = block.markdown?.[0]
  if (!node) return ''
  const lang  = node.lang ? ` class="bmk-code language-${esc(node.lang)}"` : ' class="bmk-code"'
  const text  = esc(node.text ?? '')
  return `<pre class="bmk-pre"><code${lang}>${text}</code></pre>`
}

function renderBlockquote(block: Block, ctx: HtmlCtx): string {
  const inner = ctx.renderNodes(block.markdown ?? [])
  return `<blockquote class="bmk-blockquote">${inner}</blockquote>`
}

function renderHr(): string {
  return `<hr class="bmk-hr">`
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
  const tag     = ordered ? 'ul' : 'ul'           // keep ul; ol support below
  const cls     = ordered ? 'bmk-ol' : 'bmk-ul'
  const oAttr   = ordered && start !== 1 ? ` start="${start}"` : ''
  const outerTag = ordered ? 'ol' : 'ul'

  const items = (node.children ?? []).map(item => {
    const content = (item.children ?? []).map(child => {
      if (!loose && child.type === NodeType.Paragraph) {
        return ctx.renderNodes(child.children ?? [])
      }
      return renderNodeHtml(child, ctx)
    }).join('')
    return `<li class="bmk-li">${content}</li>`
  }).join('')

  return `<${outerTag} class="${cls}"${oAttr}>${items}</${outerTag}>`
}

// ─── Inline node HTML renderers ───────────────────────────────────────────────

function renderNodeHtml(node: Node, ctx: HtmlCtx): string {
  const kids = () => ctx.renderNodes(node.children ?? [])
  switch (node.type) {
    case NodeType.Text:      return esc(node.text ?? '')
    case NodeType.Escape:    return node.text ? esc(node.text) : ''
    case NodeType.Tag:       return node.text ?? ''  // raw inline HTML passthrough
    case NodeType.Em:        return `<em class="bmk-em">${kids()}</em>`
    case NodeType.Strong:    return `<strong class="bmk-strong">${kids()}</strong>`
    case NodeType.Codespan:  return `<code class="bmk-codespan">${esc(node.text ?? '')}</code>`
    case NodeType.Br:        return ' '
    case NodeType.HardBr:    return '<br class="bmk-br">'
    case NodeType.Link:
    case NodeType.LinkRef: {
      const href = esc(node.url ?? '')
      const isEmail = node.linkType === LinkType.Email
      const hrefAttr = isEmail ? `href="mailto:${href}"` : `href="${href}"`
      const inner = node.children?.length ? kids() : esc(node.text ?? '')
      return `<a class="bmk-a" ${hrefAttr}>${inner}</a>`
    }
    case NodeType.Image: {
      const src = esc(node.url ?? node.text ?? '')
      const alt = esc((node.children ?? []).map(c => c.text ?? '').join(''))
      return `<img class="bmk-img" src="${src}" alt="${alt}">`
    }
    case NodeType.Heading:    return renderHeadingNode(node, ctx)
    case NodeType.Paragraph:  return `<p class="bmk-p">${kids()}</p>`
    case NodeType.Blockquote: return `<blockquote class="bmk-blockquote">${kids()}</blockquote>`
    case NodeType.List:       return renderListNode(node, ctx)
    case NodeType.ListItem:   return `<li class="bmk-li">${kids()}</li>`
    case NodeType.Code:       return `<pre class="bmk-pre"><code class="bmk-code">${esc(node.text ?? '')}</code></pre>`
    case NodeType.Hr:         return `<hr class="bmk-hr">`
    case NodeType.Html:       return node.text ?? ''
    default:                  return esc(node.text ?? '')
  }
}

function renderHeadingNode(node: Node, ctx: HtmlCtx): string {
  const d = node.depth ?? 1
  return `<h${d} class="bmk-h${d}">${ctx.renderNodes(node.children ?? [])}</h${d}>`
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
    [NodeType.Em]:         (node, ctx)  => `<em class="bmk-em">${ctx.renderNodes(node.children ?? [])}</em>`,
    [NodeType.Strong]:     (node, ctx)  => `<strong class="bmk-strong">${ctx.renderNodes(node.children ?? [])}</strong>`,
    [NodeType.Codespan]:   (node)       => `<code class="bmk-codespan">${esc(node.text ?? '')}</code>`,
    [NodeType.Br]:         ()           => ' ',
    [NodeType.HardBr]:     ()           => '<br class="bmk-br">',
    [NodeType.Link]:       (node, ctx)  => renderLink(node, ctx),
    [NodeType.LinkRef]:    (node, ctx)  => renderLink(node, ctx),
    [NodeType.Image]:      (node, ctx)  => renderImage(node, ctx),
    [NodeType.Heading]:    (node, ctx)  => renderHeadingNode(node, ctx),
    [NodeType.Paragraph]:  (node, ctx)  => `<p class="bmk-p">${ctx.renderNodes(node.children ?? [])}</p>`,
    [NodeType.Blockquote]: (node, ctx)  => `<blockquote class="bmk-blockquote">${ctx.renderNodes(node.children ?? [])}</blockquote>`,
    [NodeType.List]:       (node, ctx)  => renderListNode(node, ctx),
    [NodeType.ListItem]:   (node, ctx)  => `<li class="bmk-li">${ctx.renderNodes(node.children ?? [])}</li>`,
    [NodeType.Code]:       (node)       => `<pre class="bmk-pre"><code class="bmk-code">${esc(node.text ?? '')}</code></pre>`,
    [NodeType.Hr]:         ()           => `<hr class="bmk-hr">`,
    [NodeType.Html]:       (node)       => node.text ?? '',
  },
}

function renderLink(node: Node, ctx: HtmlCtx): string {
  const href = esc(node.url ?? '')
  const isEmail = node.linkType === LinkType.Email
  const hrefAttr = isEmail ? `href="mailto:${href}"` : `href="${href}"`
  const inner = node.children?.length
    ? ctx.renderNodes(node.children)
    : esc(node.text ?? '')
  return `<a class="bmk-a" ${hrefAttr}>${inner}</a>`
}

function renderImage(node: Node, ctx: HtmlCtx): string {
  const src = esc(node.url ?? node.text ?? '')
  const alt = esc((node.children ?? []).map(c => c.text ?? '').join(''))
  return `<img class="bmk-img" src="${src}" alt="${alt}">`
}
