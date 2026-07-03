import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { VariableSizeList } from 'react-window'
import { BlockMaker, blockMakerGFM, blockMakerHtml, blockMakerCode, blockMakerMermaid, blockMakerMath, blockMakerThemeCss, blockMakerDom, blockMakerFrontMatter } from 'blockmark'
import mermaid from 'mermaid'
import renderMathInElement from 'katex/contrib/auto-render'
import 'katex/dist/katex.min.css'
import hljs from 'highlight.js'
import hljsLightUrl from 'highlight.js/styles/github.css?url'
import hljsDarkUrl  from 'highlight.js/styles/github-dark.css?url'
import lightCssUrl from '../../../src/light.css?url'
import darkCssUrl  from '../../../src/dark.css?url'
import BlockCard from './BlockCard.jsx'
import './App.css'
// import './md-custom.css'
import testMdRaw from '../../../test/test.md?raw'

function estimateHeight(block) {
  return 44 + block.lines.length * 22
}

function cursorLineNumber(text, selectionStart) {
  const before = text.slice(0, selectionStart)
  return before.split('\n').length - 1
}

function charToRowCol(text, charPos) {
  const before = text.slice(0, charPos)
  const lines = before.split('\n')
  return { row: lines.length - 1, col: lines[lines.length - 1].length }
}

export default function App() {
  const setRevRef      = useRef(null)
  const listRef        = useRef(null)
  const textareaRef    = useRef(null)
  const prevContentRef = useRef(null)
  const blocksRef      = useRef([])

  const initRef = useRef(null)
  if (!initRef.current) {
    const highlight = (code, lang) =>
      lang && hljs.getLanguage(lang)
        ? hljs.highlight(code, { language: lang }).value
        : null
    const p = new BlockMaker()
      .use(blockMakerGFM)
      .use(blockMakerMermaid({ mermaid }))
      .use(blockMakerMath)
      .use(blockMakerHtml)
      .use(blockMakerCode(highlight))
      .use(blockMakerFrontMatter)
      .use(blockMakerThemeCss({ id: 'blockmark-theme', light: lightCssUrl, dark: darkCssUrl }))
      .use(blockMakerThemeCss({ id: 'hljs-theme',      light: hljsLightUrl, dark: hljsDarkUrl }))
      .use(blockMakerDom({ id: 'bmd-preview' }))
    const content = testMdRaw
    p.changed((_changed, isEnd) => {
      if (!isEnd) return
      // 在回调内同步拍快照，捕获 dirty 标记（parse 返回后会立即清零）
      blocksRef.current = p.allBlocks().map(b => ({ ...b }))
      setRevRef.current?.()
      listRef.current?.resetAfterIndex(0)
      setTimeout(() => {
        mermaid.run()
        const el = document.querySelector('.preview-content')
        if (el) renderMathInElement(el, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$',  right: '$',  display: false },
          ],
          throwOnError: false,
        })
      }, 0)
    })
    initRef.current = { parser: p, content }
    prevContentRef.current = content
  }

  const [mdContent, setMdContent] = useState(initRef.current.content)
  const [rev, setRev] = useState(0)
  const [cursorLine, setCursorLine] = useState(0)
  const [darkMode, setDarkMode] = useState(false)

  useEffect(() => {
    initRef.current.parser.parse(initRef.current.content)
  }, [])

  useEffect(() => {
    initRef.current.parser.applyTheme(darkMode ? 'dark' : 'light')
  }, [darkMode])

  setRevRef.current = () => setRev(r => r + 1)

  const blocks = blocksRef.current

  const parse = useCallback(() => {
    const p = initRef.current.parser
    p.parse(mdContent)
    prevContentRef.current = mdContent
  }, [mdContent])

  const handleTextareaChange = useCallback((e) => {
    const newContent = e.target.value
    setMdContent(newContent)

    const oldContent = prevContentRef.current
    prevContentRef.current = newContent

    const minLen = Math.min(oldContent.length, newContent.length)
    let start = 0
    while (start < minLen && oldContent[start] === newContent[start]) start++

    if (start === oldContent.length && start === newContent.length) return

    let oldEnd = oldContent.length
    let newEnd = newContent.length
    while (oldEnd > start && newEnd > start &&
      oldContent[oldEnd - 1] === newContent[newEnd - 1]) {
      oldEnd--; newEnd--
    }

    const pos1 = charToRowCol(oldContent, start)
    const pos2 = charToRowCol(oldContent, oldEnd)
    const content = newContent.slice(start, newEnd)

    initRef.current.parser.update(pos1.row, pos1.col, pos2.row, pos2.col, content)
  }, [])

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
            <button className="btn-parse" onClick={() => setDarkMode(d => !d)}>
              {darkMode ? 'Light' : 'Dark'}
            </button>
          </div>
          <div id="bmd-preview" className="preview-content blockmark" />
        </div>
      </div>
      <div className="bottom-bar">
        <div className="bar-left">行 {cursorLine}</div>
        <div className="bar-divider" />
        <div className="bar-right">
          {matchedBlock ? `id:${matchedBlock.id} ord:${matchedBlock.order} ln:${cursorLine}` : '—'}
        </div>
      </div>
    </div>
  )
}
