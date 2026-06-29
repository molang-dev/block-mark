<script setup>
import { ref, computed } from 'vue'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import { Parser } from 'mdparser'
import BlockCard from './BlockCard.vue'
import './App.css'
import testMdRaw from '../../../mytest/test.md?raw'

function snapshot(b) {
  return { type: b.type, lines: b.lines, depth: b.depth, index: b.index, lineStart: b.lineStart, lineEnd: b.lineEnd }
}

function cursorLineNumber(text, selectionStart) {
  return text.slice(0, selectionStart).split('\n').length - 1
}

// 一次性初始化：<script setup> 顶层只跑一次，无需 useRef 守卫
const p = new Parser()

const mdContent  = ref(testMdRaw)
const blocks     = ref([])
const dirtyMap   = ref({})
const cursorLine = ref(0)

let prevContent = testMdRaw
let dirtyTimer  = null

// 先注册回调，再 read，让初始解析也走 onUpdate
p.onUpdate((_changed, isEnd) => {
  console.log('onUpdate: ', _changed, 'onUpdate end')
  if (!isEnd) return
  blocks.value = p.allBlocks().map(snapshot)
  const map = {}
  for (const b of p.allBlocks()) {
    if ((b.dirty ?? 0) > 0) map[b.index] = b.dirty
  }
  dirtyMap.value = map
})

p.read(testMdRaw)

function clearDirty() {
  dirtyMap.value = {}
}

function parse() {
  blocks.value = []
  dirtyMap.value = {}
  p.read(mdContent.value)
  prevContent = mdContent.value
}

function handleInput(e) {
  const newContent = e.target.value
  mdContent.value  = newContent

  const oldLines = prevContent.split('\n')
  const newLines = newContent.split('\n')
  prevContent = newContent

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

  const startLine  = Math.min(sl, Math.max(0, oldLines.length - 1))
  const endLine    = oldLines.length - 1 - tail
  const newEndLine = newLines.length - 1 - tail

  const newSegment = newLines.slice(startLine, Math.max(startLine, newEndLine) + 1).join('\n')
  console.log('updateLine', startLine, endLine, newSegment, 'updateLine end')
  p.updateLine(startLine, endLine, newSegment)

  if (dirtyTimer) clearTimeout(dirtyTimer)
  dirtyTimer = setTimeout(clearDirty, 5000)
}

function handleCursor(e) {
  cursorLine.value = cursorLineNumber(e.target.value, e.target.selectionStart)
}

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
                <BlockCard :block="item" :dirty="dirtyMap[item.index] || 0" />
              </DynamicScrollerItem>
            </template>
          </DynamicScroller>
          <div v-else class="placeholder">点击「解析」查看结果</div>
        </div>
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
