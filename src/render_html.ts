import { Node, NodeType } from './types'

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function kids(node: Node): string {
  return (node.children ?? []).map(renderNode).join('')
}

function textOf(nodes: Node[]): string {
  return nodes.map(n => n.value + textOf(n.children ?? [])).join('')
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
      return `<code>${escape(node.value)}</code>`
    case NodeType.Code: {
      const cls = node.lang ? ` class="language-${escape(node.lang)}"` : ''
      return `<pre><code${cls}>${escape(node.value)}</code></pre>`
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
      return `<a href="${escape(node.value)}">${kids(node) || escape(node.value)}</a>`
    case NodeType.Image:
      return `<img src="${escape(node.value)}" alt="${escape(textOf(node.children ?? []))}">`
    case NodeType.Br:
      return '<br>'
    case NodeType.Checkbox:
      return `<input type="checkbox"${node.value === 'x' ? ' checked' : ''} disabled>`
    case NodeType.HTML:
    case NodeType.Tag:
      return node.value
    default:
      return escape(node.value)
  }
}

export function render_html(nodes: Node[]): string {
  return nodes.map(renderNode).join('')
}

export function default_css(className = 'md-preview'): string {
  const s = className
  return `
.${s} { font-family: system-ui, -apple-system, sans-serif; font-size: 15px; line-height: 1.7; color: #24292f; word-break: break-word; }
.${s} h1, .${s} h2, .${s} h3, .${s} h4, .${s} h5, .${s} h6 { margin: 1em 0 0.4em; font-weight: 600; line-height: 1.3; }
.${s} h1 { font-size: 2em;     border-bottom: 1px solid #eaecef; padding-bottom: 0.2em; }
.${s} h2 { font-size: 1.5em;   border-bottom: 1px solid #eaecef; padding-bottom: 0.2em; }
.${s} h3 { font-size: 1.25em; }
.${s} h4 { font-size: 1em; }
.${s} h5 { font-size: 0.875em; }
.${s} h6 { font-size: 0.85em; color: #57606a; }
.${s} p  { margin: 0.6em 0; }
.${s} a  { color: #0969da; text-decoration: none; }
.${s} a:hover { text-decoration: underline; }
.${s} strong { font-weight: 600; }
.${s} em     { font-style: italic; }
.${s} del    { color: #57606a; }
.${s} code { font-family: Menlo, Consolas, monospace; font-size: 0.9em; background: #f6f8fa; padding: 0.15em 0.4em; border-radius: 4px; }
.${s} pre  { background: #f6f8fa; border-radius: 6px; padding: 14px 16px; overflow-x: auto; margin: 0.8em 0; }
.${s} pre code { background: none; padding: 0; font-size: 13px; }
.${s} blockquote { margin: 0.8em 0; padding: 0 1em; border-left: 4px solid #d0d7de; color: #57606a; }
.${s} ul, .${s} ol { margin: 0.5em 0; padding-left: 2em; }
.${s} li { margin: 0.2em 0; }
.${s} table { border-collapse: collapse; width: 100%; margin: 0.8em 0; }
.${s} th, .${s} td { border: 1px solid #d0d7de; padding: 6px 12px; text-align: left; }
.${s} th { background: #f6f8fa; font-weight: 600; }
.${s} tr:nth-child(even) td { background: #f6f8fa; }
.${s} hr  { border: none; border-top: 2px solid #d0d7de; margin: 1.2em 0; }
.${s} img { max-width: 100%; border-radius: 4px; }
.${s} input[type="checkbox"] { margin-right: 0.4em; }
`.trim()
}
