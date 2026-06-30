import { BlockType, NodeType, LinkType, TypedBlock, Node } from './types'

export function node2str(node: Node, indent = 0): string {
  const pad = '  '.repeat(indent)
  const i1  = pad + '  '
  const lines = [
    `${pad}Node {`,
    `${i1}typeName : ${NodeType[node.type]}`,
    `${i1}type     : ${node.type}`,
  ]
  if (node.depth)                    lines.push(`${i1}depth    : ${node.depth}`)
  if (node.lang)                     lines.push(`${i1}lang     : ${node.lang}`)
  if (node.linkType !== undefined)   lines.push(`${i1}linkType : ${LinkType[node.linkType]}`)
  if (node.text !== undefined) lines.push(`${i1}text     : '${node.text}'`)
  if (node.children?.length) {
    const kids = node.children.map(c => node2str(c, indent + 2)).join('\n')
    lines.push(`${i1}children : [\n${kids}\n${i1}]`)
  }
  lines.push(`${pad}}`)
  return lines.join('\n')
}

export function block2str(block: TypedBlock): string {
  const i1 = '  '
  const lines = [
    'TypedBlock {',
    `${i1}typeName  : ${BlockType[block.type]}`,
    `${i1}type      : ${block.type}`,
  ]
  if (block.depth) lines.push(`${i1}depth     : ${block.depth}`)
  lines.push(
    `${i1}index     : ${block.index}`,
    `${i1}lineStart : ${block.lineStart}`,
    `${i1}lineEnd   : ${block.lineEnd}`,
    `${i1}dirty     : ${block.dirty}`,
    `${i1}lines     : ${JSON.stringify(block.lines)}`,
  )
  if (block.markdown.length > 0) {
    lines.push(`${i1}markdown  : [\n${block.markdown.map(n => node2str(n, 2)).join('\n')}\n${i1}]`)
  }
  lines.push('}')
  return lines.join('\n')
}

export function blocks2str(blocks: TypedBlock[]): string {
  return blocks.map(b => block2str(b)).join('\n\n')
}
