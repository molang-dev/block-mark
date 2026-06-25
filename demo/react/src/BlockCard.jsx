import React from 'react'
import './BlockCard.css'

const TYPE_LABELS = {
  heading:    'H',
  paragraph:  'P',
  list:       'L',
  code:       'C',
  table:      'T',
  blockquote: 'Q',
  hr:         'R',
  html:       '♢',
}

export default function BlockCard({ block, style }) {
  const typeClass = `card card-${block.type}`

  return (
    <div className={typeClass} style={style}>
      <span className="badge">
        {TYPE_LABELS[block.type]}
        {block.depth != null && block.depth}
      </span>
      <div className="lines">
        {block.lines.map((line, i) => (
          <div key={i} className={line === '' ? 'line-empty' : ''}>
            {line || ' '}
          </div>
        ))}
      </div>
    </div>
  )
}
