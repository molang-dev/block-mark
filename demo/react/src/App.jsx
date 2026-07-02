import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { VariableSizeList } from 'react-window'
import { BlockMaker, blockMakerGFM, blockMakerHtml, blockMakerCode } from 'blockmark'
import hljs from 'highlight.js'
import lightCssUrl    from '../../../src/light.css?url'
import darkCssUrl     from '../../../src/dark.css?url'
import hljsLightUrl  from 'highlight.js/styles/github.css?url'
import hljsDarkUrl   from 'highlight.js/styles/github-dark.css?url'
import BlockCard from './BlockCard.jsx'
import './App.css'
import './md-custom.css'
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

function charToRowCol(text, charPos) {
  const before = text.slice(0, charPos)
  const lines = before.split('\n')
  return { row: lines.length - 1, col: lines[lines.length - 1].length }
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
    const highlight = (code, lang) =>
      lang && hljs.getLanguage(lang)
        ? hljs.highlight(code, { language: lang }).value
        : hljs.highlightAuto(code).value
    const p = new BlockMaker().use(blockMakerGFM).use(blockMakerHtml).use(blockMakerCode(highlight))
    const content = loadMDFile('../test/test.md')
    p.changed((_changed, isEnd) => {
      if (!isEnd) return
      setRevRef.current?.()
      listRef.current?.resetAfterIndex(0)
    })
    p.parse(content)   // 触发 changed；此时 setRevRef 还是 null，跳过 setState
    initRef.current = { parser: p, content }
    prevContentRef.current = content
  }

  const [mdContent, setMdContent] = useState(initRef.current.content)
  const [rev, setRev] = useState(0)
  const [cursorLine, setCursorLine] = useState(0)
  const [darkMode, setDarkMode] = useState(false)

  useEffect(() => {
    let link = document.getElementById('blockmark-theme')
    if (!link) {
      link = document.createElement('link')
      link.id  = 'blockmark-theme'
      link.rel = 'stylesheet'
      document.head.appendChild(link)
    }
    link.href = darkMode ? darkCssUrl : lightCssUrl

    let hljsLink = document.getElementById('hljs-theme')
    if (!hljsLink) {
      hljsLink = document.createElement('link')
      hljsLink.id  = 'hljs-theme'
      hljsLink.rel = 'stylesheet'
      document.head.appendChild(hljsLink)
    }
    hljsLink.href = darkMode ? hljsDarkUrl : hljsLightUrl
  }, [darkMode])

  // 每次 render 挂上最新的 rev setter（stable ref，无副作用）
  setRevRef.current = () => setRev(r => r + 1)

  // 直接读 parser 内部数组，零拷贝
  const blocks = initRef.current.parser.allBlocks()

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

    const p = initRef.current.parser
    p.update(pos1.row, pos1.col, pos2.row, pos2.col, content)
  }, [])

  const handleTextareaEvent = useCallback(() => {
    const ta = textareaRef.current
    if (ta) setCursorLine(cursorLineNumber(ta.value, ta.selectionStart))
  }, [])

  const FN_TYPE = 111002
  const previewHtml = useMemo(() => {
    const mainParts = [], fnParts = []
    for (const b of blocks) {
      if (b.type === FN_TYPE) fnParts.push(`<li id="bmd-fn-${b.meta}">${b.html ?? ''}</li>`)
      else mainParts.push(b.html ?? '')
    }
    const fnSection = fnParts.length ? `<hr><ol>${fnParts.join('')}</ol>` : ''
    return mainParts.join('') + fnSection
  }, [rev])

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
          <div className="preview-content blockmark" dangerouslySetInnerHTML={{ __html: previewHtml }} />
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
