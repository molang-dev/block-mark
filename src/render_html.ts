import { Node, NodeType } from './types'

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function kids(node: Node): string {
  return (node.children ?? []).map(renderNode).join('')
}

function textOf(nodes: Node[]): string {
  return nodes.map(n => (n.text ?? '') + textOf(n.children ?? [])).join('')
}

function renderNode(node: Node): string {
  switch (node.type) {
    case NodeType.Heading: {
      const h = node.depth ?? 1
      return `<h${h}>${kids(node)}</h${h}>`
    }
    case NodeType.Paragraph:
      return `<p>${kids(node)}</p>`
    case NodeType.Strong:
      return `<strong>${kids(node)}</strong>`
    case NodeType.Em:
      return `<em>${kids(node)}</em>`
    case NodeType.Del:
      return `<del>${kids(node)}</del>`
    case NodeType.Codespan:
      return `<code>${escape(node.text ?? '')}</code>`
    case NodeType.Code: {
      const cls = node.lang ? ` class="language-${escape(node.lang)}"` : ''
      return `<pre><code${cls}>${escape(node.text ?? '')}</code></pre>`
    }
    case NodeType.Blockquote:
      return `<blockquote>${kids(node)}</blockquote>`
    case NodeType.List:
      return `<ul>${kids(node)}</ul>`
    case NodeType.ListItem:
      return `<li>${kids(node)}</li>`
    case NodeType.Table:
      return `<table>${kids(node)}</table>`
    case NodeType.TableRow:
      return `<tr>${kids(node)}</tr>`
    case NodeType.TableCell:
      return `<td>${kids(node)}</td>`
    case NodeType.Hr:
      return '<hr>'
    case NodeType.Link:
      return `<a href="${escape(node.text ?? '')}">${kids(node) || escape(node.text ?? '')}</a>`
    case NodeType.Image:
      return `<img src="${escape(node.text ?? '')}" alt="${escape(textOf(node.children ?? []))}">`
    case NodeType.Br:
      return '<br>'
    case NodeType.Checkbox:
      return `<input type="checkbox"${node.text === 'x' ? ' checked' : ''} disabled>`
    case NodeType.HTML:
    case NodeType.Tag:
      return node.text ?? ''
    default:
      return escape(node.text ?? '')
  }
}

export function render_html(nodes: Node[]): string {
  return nodes.map(renderNode).join('')
}

