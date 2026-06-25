import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { VariableSizeList } from 'react-window'
import { Parser } from 'mdparser'
import BlockCard from './BlockCard.jsx'
import './App.css'
import testMdRaw from '../../../mytest/test.md?raw'

function loadMDFile(_path) {
  return testMdRaw
}

function estimateHeight(block) {
  return 44 + block.lines.length * 22
}

/** 根据 selectionStart 计算光标所在行号（0-based） */
function cursorLineNumber(text, selectionStart) {
  const before = text.slice(0, selectionStart)
  return before.split('\n').length - 1
}

export default function App() {
  const [mdContent, setMdContent] = useState(() => loadMDFile('../test/test.md'))
  const [blocks, setBlocks] = useState([])
  const [cursorLine, setCursorLine] = useState(0)
  const listRef = useRef(null)
  const textareaRef = useRef(null)

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

  const handleTextareaEvent = useCallback(() => {
    const ta = textareaRef.current
    if (ta) {
      setCursorLine(cursorLineNumber(ta.value, ta.selectionStart))
    }
  }, [])

  // 根据光标行号查找对应 block
  const matchedBlock = useMemo(() => {
    if (blocks.length === 0) return null
    for (const b of blocks) {
      if (cursorLine >= b.lineStart && cursorLine <= b.lineEnd) {
        return b
      }
    }
    return null
  }, [blocks, cursorLine])

  const itemCount = blocks.length

  const getItemSize = useCallback((index) => {
    return blocks[index] ? estimateHeight(blocks[index]) : 40
  }, [blocks])

  const Row = useCallback(({ index, style }) => (
    <BlockCard block={blocks[index]} style={style} />
  ), [blocks])

  const BAR_H = 24
  const TOOLBAR_H = 42
  const listHeight = typeof window !== 'undefined' ? window.innerHeight - TOOLBAR_H - BAR_H : 600

  return (
    <div className="app">
      <div className="main-row">
        {/* 左侧编辑区 */}
        <div className="editor-pane">
          <div className="toolbar">
            <span className="toolbar-title">Markdown 输入</span>
            <button className="btn-parse" onClick={parse}>解析</button>
          </div>
          <textarea
            ref={textareaRef}
            className="md-textarea"
            value={mdContent}
            onChange={e => setMdContent(e.target.value)}
            onKeyUp={handleTextareaEvent}
            onClick={handleTextareaEvent}
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

      {/* 底部状态栏 */}
      <div className="bottom-bar">
        <div className="bar-left">行 {cursorLine}</div>
        <div className="bar-divider" />
        <div className="bar-right">
          {matchedBlock
            ? `${matchedBlock.index} : ${cursorLine}`
            : '—'
          }
        </div>
      </div>
    </div>
  )
}
