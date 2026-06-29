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

function cursorLineNumber(text, selectionStart) {
  const before = text.slice(0, selectionStart)
  return before.split('\n').length - 1
}

export default function App() {
  const [mdContent, setMdContent] = useState(() => loadMDFile('../test/test.md'))
  const [blocks, setBlocks] = useState([])
  const [dirtyMap, setDirtyMap] = useState({})  // { [index]: 1|2 }
  const [cursorLine, setCursorLine] = useState(0)
  const listRef = useRef(null)
  const textareaRef = useRef(null)
  const parserRef = useRef(new Parser())
  const dirtyTimerRef = useRef(null)
  const prevContentRef = useRef('')

  const freshBlocks = useCallback((p) => {
    return p.allBlocks().map(b => ({ type:b.type, lines:b.lines, depth:b.depth, index:b.index, lineStart:b.lineStart, lineEnd:b.lineEnd }))
  }, [])

  // 从 parser._blocks 收集 dirty 状态
  const collectDirty = useCallback((p) => {
    const map = {}
    for (const b of p.allBlocks()) {
      if (b.dirty && b.dirty > 0) map[b.index] = b.dirty
    }
    return map
  }, [])

  const parse = useCallback(() => {
    const p = parserRef.current
    setBlocks([])
    setDirtyMap({})
    p.read(mdContent)
    prevContentRef.current = mdContent
  }, [mdContent])

  // Register onUpdate once — drives setBlocks + setDirtyMap for all read/updateLine calls
  useEffect(() => {
    const p = parserRef.current
    p.onUpdate((_changed, isEnd) => {
      if (!isEnd) return
      setBlocks(freshBlocks(p))
      setDirtyMap(collectDirty(p))
    })
  }, [freshBlocks, collectDirty])

  useEffect(() => { parse() }, [])

  useEffect(() => {
    if (listRef.current) listRef.current.resetAfterIndex(0)
  }, [blocks])

  const clearDirty = useCallback(() => {
    setDirtyMap({})
  }, [])

  const handleTextareaChange = useCallback((e) => {
    const newContent = e.target.value
    setMdContent(newContent)

    const prevContent = prevContentRef.current
    prevContentRef.current = newContent

    const oldLines = prevContent.split('\n')
    const newLines = newContent.split('\n')

    // Find first differing line from start
    const minLen = Math.min(oldLines.length, newLines.length)
    let sl = 0
    while (sl < minLen && oldLines[sl] === newLines[sl]) sl++

    // Truly identical (no change)
    if (sl === oldLines.length && sl === newLines.length) return

    // Find matching tail
    const maxTail = Math.min(oldLines.length - sl, newLines.length - sl)
    let tail = 0
    while (tail < maxTail &&
      oldLines[oldLines.length - 1 - tail] === newLines[newLines.length - 1 - tail]) {
      tail++
    }

    // startLine: clamp to last old line in case of pure append (sl === oldLines.length)
    const startLine = Math.min(sl, Math.max(0, oldLines.length - 1))
    const endLine = oldLines.length - 1 - tail    // last changed old line
    const newEndLine = newLines.length - 1 - tail  // last changed new line

    const p = parserRef.current
    const affected = p.findBlocks(startLine, Math.max(startLine, endLine))

    if (affected.length !== 1) {
      // 0: out of range; 2+: cross-block
      p.read(newContent)
      return
    }

    const segEnd = Math.max(startLine, newEndLine)
    const newSegment = newLines.slice(startLine, segEnd + 1).join('\n')
    console.log(newSegment)
    p.updateLine(startLine, endLine, newSegment)

    if (dirtyTimerRef.current) clearTimeout(dirtyTimerRef.current)
    dirtyTimerRef.current = setTimeout(clearDirty, 5000)
  }, [clearDirty])

  const handleTextareaEvent = useCallback(() => {
    const ta = textareaRef.current
    if (ta) setCursorLine(cursorLineNumber(ta.value, ta.selectionStart))
  }, [])

  const matchedBlock = useMemo(() => {
    if (blocks.length === 0) return null
    for (const b of blocks) {
      if (cursorLine >= b.lineStart && cursorLine <= b.lineEnd) return b
    }
    return null
  }, [blocks, cursorLine])

  const itemCount = blocks.length
  const getItemSize = useCallback((i) => blocks[i] ? estimateHeight(blocks[i]) : 40, [blocks])
  const Row = useCallback(({ index, style, data }) => (
    <BlockCard block={data.blocks[index]} dirty={data.dirtyMap[index] || 0} style={style} />
  ), [])

  const BAR_H = 24, TOOLBAR_H = 42
  const listHeight = typeof window !== 'undefined' ? window.innerHeight - TOOLBAR_H - BAR_H : 600

  return (
    <div className="app">
      <div className="main-row">
        <div className="editor-pane">
          <div className="toolbar">
            <span className="toolbar-title">Markdown 输入</span>
            <button className="btn-parse" onClick={parse}>解析</button>
          </div>
          <textarea ref={textareaRef} className="md-textarea"
            value={mdContent}
            onChange={handleTextareaChange}
            onKeyUp={handleTextareaEvent}
            onClick={handleTextareaEvent}
          />
        </div>
        <div className="result-pane">
          <div className="toolbar">
            <span className="toolbar-title">解析结果</span>
            <span className="result-meta">{itemCount} 个 block</span>
          </div>
          <div className="list-container">
            {itemCount > 0 ? (
              <VariableSizeList ref={listRef}
                height={listHeight} width="100%"
                itemCount={itemCount} itemSize={getItemSize}
                itemData={{ blocks, dirtyMap }}
                overscanCount={20}
              >{Row}</VariableSizeList>
            ) : (
              <div className="placeholder">点击「解析」查看结果</div>
            )}
          </div>
        </div>
      </div>
      <div className="bottom-bar">
        <div className="bar-left">行 {cursorLine}</div>
        <div className="bar-divider" />
        <div className="bar-right">
          {matchedBlock ? `${matchedBlock.index} : ${cursorLine}` : '—'}
        </div>
      </div>
    </div>
  )
}
