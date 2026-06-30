import React from 'react'
import './BlockCard.css'

const TYPE_LABELS = { 1: 'H', 2: 'P', 3: 'L', 4: 'C', 5: 'T', 6: 'Q', 7: 'R', 8: '♢' }

export default function BlockCard({ block, style }) {
  const dirty = block.dirty ?? 0
  const dirtyClass = dirty === 2 ? 'dirty-lines' : dirty === 1 ? 'dirty-position' : ''
  const typeClass = `card card-${block.type} ${dirtyClass}`

  return (
    <div className={typeClass} style={style}>
      <span className="badge">
        {TYPE_LABELS[block.type]}
        {block.depth != null && block.depth}
      </span>
      <div className="card-body">
        <div className="block-info">
          {block.index} : {block.lineStart} ~ {block.lineEnd}
          <span className={`dirty-tag ${dirty === 2 ? 'dirty-tag-lines' : dirty === 1 ? 'dirty-tag-pos' : ''}`}> dirty: {dirty}</span>
        </div>
        <div className="lines">
          {block.lines.map((line, i) => (
            <div key={i} className={line === '' ? 'line-empty' : ''}>
              {line === '' ? <span className="empty-marker">↵</span> : line}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
