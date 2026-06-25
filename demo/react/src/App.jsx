import React, { useState, useCallback, useRef, useEffect } from 'react'
import { VariableSizeList } from 'react-window'
import { Parser } from './parser.js'
import BlockCard from './BlockCard.jsx'
import './App.css'

const DEFAULT_MD = `# MDParser Demo

这是一段正文，包含**粗体**和*斜体*。

## 列表

- 项目 1
- 项目 2
- 项目 3

## 代码示例

\`\`\`javascript
console.log('Hello, world!');
\`\`\`

> 这是一段引用文字

---

| 名称 | 数量 |
|------|------|
| 苹果 | 3 |
| 香蕉 | 5 |
`

function estimateHeight(block) {
  return 28 + block.lines.length * 22
}

export default function App() {
  const [mdContent, setMdContent] = useState(DEFAULT_MD)
  const [blocks, setBlocks] = useState([])
  const listRef = useRef(null)

  const parse = useCallback(() => {
    const p = new Parser()
    p.onBlockUpdate(() => {})
    p.onDone(() => {
      const result = p.allBlocks()
      setBlocks([...result])
    })
    p.read(mdContent)
  }, [mdContent])

  useEffect(() => {
    if (listRef.current) {
      listRef.current.resetAfterIndex(0)
    }
  }, [blocks])

  const itemCount = blocks.length

  const getItemSize = useCallback((index) => {
    return blocks[index] ? estimateHeight(blocks[index]) : 40
  }, [blocks])

  const Row = useCallback(({ index, style }) => (
    <BlockCard block={blocks[index]} style={style} />
  ), [blocks])

  const listHeight = typeof window !== 'undefined' ? window.innerHeight - 42 : 600

  return (
    <div className="app">
      {/* 左侧编辑区 */}
      <div className="editor-pane">
        <div className="toolbar">
          <span className="toolbar-title">Markdown 输入</span>
          <button className="btn-parse" onClick={parse}>解析</button>
        </div>
        <textarea className="md-textarea" value={mdContent}
          onChange={e => setMdContent(e.target.value)}
        />
      </div>

      {/* 右侧结果区 — 虚拟列表 */}
      <div className="result-pane">
        <div className="toolbar">
          <span className="toolbar-title">解析结果</span>
          <span className="result-meta">{itemCount} 个 block</span>
        </div>
        <div className="list-container">
          {itemCount > 0 ? (
            <VariableSizeList
              ref={listRef}
              height={listHeight}
              width="100%"
              itemCount={itemCount}
              itemSize={getItemSize}
              overscanCount={20}
            >
              {Row}
            </VariableSizeList>
          ) : (
            <div className="placeholder">点击「解析」查看结果</div>
          )}
        </div>
      </div>
    </div>
  )
}
