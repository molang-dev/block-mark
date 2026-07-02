<script setup>
import { shallowRef, ref, computed, watchEffect } from 'vue'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import { BlockMaker, blockMakerGFM, blockMakerHtml } from 'mdparser'
import lightCssUrl from '../../../src/light.css?url'
import darkCssUrl  from '../../../src/dark.css?url'
import BlockCard from './BlockCard.vue'
import './App.css'
// import './md-custom.css'
import testMdRaw from '../../../mytest/test.md?raw'

function cursorLineNumber(text, selectionStart) {
  return text.slice(0, selectionStart).split('\n').length - 1
}

function charToRowCol(text, charPos) {
  const before = text.slice(0, charPos)
  const lines = before.split('\n')
  return { row: lines.length - 1, col: lines[lines.length - 1].length }
}

// 一次性初始化：<script setup> 顶层只跑一次，无需 useRef 守卫
const p = new BlockMaker().use(blockMakerGFM).use(blockMakerHtml)

const mdContent  = ref(testMdRaw)
const cursorLine = ref(0)
const darkMode   = ref(false)

watchEffect(() => {
  let link = document.getElementById('blockmark-theme')
  if (!link) {
    link = document.createElement('link')
    link.id  = 'blockmark-theme'
    link.rel = 'stylesheet'
    document.head.appendChild(link)
  }
  link.href = darkMode.value ? darkCssUrl : lightCssUrl
})

// shallowRef 持有 parser 内部数组，零拷贝；triggerRef 强制通知 Vue 重渲染
const blocks = shallowRef(p.allBlocks())

let prevContent = testMdRaw

// 先注册回调，再 parse，让初始解析也走 changed
p.changed((_changed, isEnd) => {
  if (!isEnd) return
  blocks.value = [...p.allBlocks()]   // 浅拷贝：引用变化让 DynamicScroller 感知更新
})

p.parse(testMdRaw)

function parse() {
  p.parse(mdContent.value)
  prevContent = mdContent.value
}

function handleInput(e) {
  console.log(e.target.value)
  const newContent = e.target.value
  mdContent.value  = newContent

  const oldContent = prevContent
  prevContent = newContent

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

  p.update(pos1.row, pos1.col, pos2.row, pos2.col, content)
}

function handleCursor(e) {
  cursorLine.value = cursorLineNumber(e.target.value, e.target.selectionStart)
}

const previewHtml = computed(() =>
  blocks.value.map(b => b.html ?? '').join('')
)

const matchedBlock = computed(() => {
  for (const b of blocks.value) {
    if (cursorLine.value >= b.lineStart && cursorLine.value <= b.lineEnd) return b
  }
  return null
})
</script>

<template>
  <div class="app">
    <div class="main-row">
      <div class="editor-pane">
        <div class="toolbar">
          <span class="toolbar-title">Markdown 输入</span>
          <button class="btn-parse" @click="parse">解析</button>
        </div>
        <textarea
          class="md-textarea"
          :value="mdContent"
          @input="handleInput"
          @keyup="handleCursor"
          @click="handleCursor"
        />
      </div>
      <div class="result-pane">
        <div class="toolbar">
          <span class="toolbar-title">解析结果</span>
          <span class="result-meta">{{ blocks.length }} 个 block</span>
        </div>
        <div class="list-container">
          <DynamicScroller
            v-if="blocks.length > 0"
            :items="blocks"
            :min-item-size="44"
            key-field="index"
            style="height: 100%"
          >
            <template #default="{ item, index, active }">
              <DynamicScrollerItem :item="item" :active="active" :data-index="index">
                <BlockCard :block="item" />
              </DynamicScrollerItem>
            </template>
          </DynamicScroller>
          <div v-else class="placeholder">点击「解析」查看结果</div>
        </div>
      </div>
      <div class="node-pane">
        <div class="toolbar">
          <span class="toolbar-title">预览</span>
          <button class="btn-parse" @click="darkMode = !darkMode">{{ darkMode ? 'Light' : 'Dark' }}</button>
        </div>
        <div class="preview-content blockmark" v-html="previewHtml" />
      </div>
    </div>
    <div class="bottom-bar">
      <div class="bar-left">行 {{ cursorLine }}</div>
      <div class="bar-divider" />
      <div class="bar-right">
        {{ matchedBlock ? `${matchedBlock.index} : ${cursorLine}` : '—' }}
      </div>
    </div>
  </div>
</template>
