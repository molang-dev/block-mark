import React, { useState, useCallback, useRef, useMemo } from 'react'
import { VariableSizeList } from 'react-window'
import { Parser, render_html, default_css } from 'mdparser'
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
  // setter 中转 ref，让 initRef 里的 onUpdate 回调能访问到 useState 的 setter
  const setRevRef   = useRef(null)
  const listRef     = useRef(null)
  const textareaRef = useRef(null)
  const prevContentRef = useRef(null)

  // 组件内一次性初始化（useRef 懒 init，StrictMode 安全）
  const initRef = useRef(null)
  if (!initRef.current) {
    const p = new Parser()
    const content = loadMDFile('../test/test.md')
    p.onUpdate((_changed, isEnd) => {
      console.log('onUpdate: ', _changed, 'onUpdate end')
      if (!isEnd) return
      setRevRef.current?.()
      listRef.current?.resetAfterIndex(0)
    })
    p.read(content)   // 触发 onUpdate；此时 setRevRef 还是 null，跳过 setState
    initRef.current = { parser: p, content }
    prevContentRef.current = content
  }

  const [mdContent, setMdContent] = useState(initRef.current.content)
  const [rev, setRev] = useState(0)
  const [cursorLine, setCursorLine] = useState(0)

  // 每次 render 挂上最新的 rev setter（stable ref，无副作用）
  setRevRef.current = () => setRev(r => r + 1)

  // 直接读 parser 内部数组，零拷贝
  const blocks = initRef.current.parser.allBlocks()

  const parse = useCallback(() => {
    const p = initRef.current.parser
    p.read(mdContent)
    prevContentRef.current = mdContent
  }, [mdContent])

  const handleTextareaChange = useCallback((e) => {
    const newContent = e.target.value
    setMdContent(newContent)

    const prevContent = prevContentRef.current
    prevContentRef.current = newContent

    const oldLines = prevContent.split('\n')
    const newLines = newContent.split('\n')

    const minLen = Math.min(oldLines.length, newLines.length)
    let sl = 0
    while (sl < minLen && oldLines[sl] === newLines[sl]) sl++

    if (sl === oldLines.length && sl === newLines.length) return

    const maxTail = Math.min(oldLines.length - sl, newLines.length - sl)
    let tail = 0
    while (tail < maxTail &&
      oldLines[oldLines.length - 1 - tail] === newLines[newLines.length - 1 - tail]) {
      tail++
    }

    const startLine = Math.min(sl, Math.max(0, oldLines.length - 1))
    const endLine    = oldLines.length - 1 - tail
    const newEndLine = newLines.length - 1 - tail

    const p = initRef.current.parser
    const newSegment = newLines.slice(startLine, Math.max(startLine, newEndLine) + 1).join('\n')
    console.log("updateLine", startLine, endLine, newSegment, 'updateLine end')
    p.updateLine(startLine, endLine, newSegment)
  }, [])

  const handleTextareaEvent = useCallback(() => {
    const ta = textareaRef.current
    if (ta) setCursorLine(cursorLineNumber(ta.value, ta.selectionStart))
  }, [])

  const previewHtml = useMemo(() =>
    blocks.map(b => render_html(b.markdown)).join(''),
    [rev]
  )

  const matchedBlock = useMemo(() => {
    if (blocks.length === 0) return null
    for (const b of blocks) {
      if (cursorLine >= b.lineStart && cursorLine <= b.lineEnd) return b
    }
    return null
  }, [rev, cursorLine])

  const itemCount = blocks.length
  const getItemSize = useCallback((i) => blocks[i] ? estimateHeight(blocks[i]) : 40, [rev])
  const Row = useCallback(({ index, style, data }) => (
    <BlockCard block={data.blocks[index]} style={style} />
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
                itemData={{ blocks, rev }}
                overscanCount={20}
              >{Row}</VariableSizeList>
            ) : (
              <div className="placeholder">点击「解析」查看结果</div>
            )}
          </div>
        </div>
        <div className="node-pane">
          <div className="toolbar">
            <span className="toolbar-title">预览</span>
          </div>
          <style dangerouslySetInnerHTML={{ __html: default_css() }} />
          <div className="preview-content md-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
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
