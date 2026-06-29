<script setup>
import { shallowRef, triggerRef, ref, computed } from 'vue'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import { Parser } from 'mdparser'
import BlockCard from './BlockCard.vue'
import './App.css'
import testMdRaw from '../../../mytest/test.md?raw'

function cursorLineNumber(text, selectionStart) {
  return text.slice(0, selectionStart).split('\n').length - 1
}

// 一次性初始化：<script setup> 顶层只跑一次，无需 useRef 守卫
const p = new Parser()

const mdContent  = ref(testMdRaw)
const cursorLine = ref(0)

// shallowRef 持有 parser 内部数组，零拷贝；triggerRef 强制通知 Vue 重渲染
const blocks = shallowRef(p.allBlocks())

let prevContent = testMdRaw

// 先注册回调，再 read，让初始解析也走 onUpdate
p.onUpdate((_changed, isEnd) => {
  console.log('onUpdate: ', _changed, 'onUpdate end')
  if (!isEnd) return
  blocks.value = p.allBlocks()   // p.read() 会 reset 内部数组，需重新赋值
  triggerRef(blocks)             // updateLine 是 in-place mutation，强制触发
})

p.read(testMdRaw)

function parse() {
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
                <BlockCard :block="item" />
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
