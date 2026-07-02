<script setup>
const props = defineProps({
  block: Object,
})

const TYPE_LABELS = { 1: 'H', 2: 'P', 3: 'L', 4: 'C', 5: 'Q', 6: 'R', 7: '⌗', 8: '♢', 100: 'T', 101: 'FN' }
</script>

<template>
  <div :class="['card', `card-${block.type}`, (block.dirty ?? 0) === 2 ? 'dirty-lines' : (block.dirty ?? 0) === 1 ? 'dirty-position' : '']">
    <span class="badge">
      {{ TYPE_LABELS[block.type] }}{{ block.depth != null ? block.depth : '' }}
    </span>
    <div class="card-body">
      <div class="block-info">
        {{ block.index }} : {{ block.lineStart }} ~ {{ block.lineEnd }}
        <span :class="['dirty-tag', (block.dirty ?? 0) === 2 ? 'dirty-tag-lines' : (block.dirty ?? 0) === 1 ? 'dirty-tag-pos' : '']">
          dirty: {{ block.dirty ?? 0 }}
        </span>
      </div>
      <div class="lines">
        <div v-for="(line, i) in block.lines" :key="i" :class="line === '' ? 'line-empty' : ''">
          <span v-if="line === ''" class="empty-marker">↵</span>
          <template v-else>{{ line }}</template>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.card {
  display: flex;
  gap: 10px;
  padding: 8px 12px;
  font-family: Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  overflow: hidden;
  box-sizing: border-box;
}

.card-heading    { background: #e3f2fd; }
.card-paragraph  { background: #fff; }
.card-list       { background: #fff3e0; }
.card-table      { background: #e8f5e9; }
.card-blockquote { background: #f3e5f5; }
.card-hr         { background: #fafafa; }
.card-html       { background: #fce4ec; }

.card + .card {
  border-top: 1px solid #e0e0e0;
}

.card-code {
  background: #263238;
  color: #eee;
}

.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  background: #607d8b;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 2px;
}

.card-code .badge { background: #455a64; }

.card-body { min-width: 0; }

.block-info {
  font-size: 11px;
  color: #999;
  margin-bottom: 2px;
  line-height: 1.4;
}

.card-code .block-info { color: #78909c; }

.lines {
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  min-width: 0;
}

.empty-marker {
  color: #bdbdbd;
  font-size: 11px;
  user-select: none;
}

.dirty-lines    { border-left: 3px solid #e53935; }
.dirty-position { border-left: 3px solid #fdd835; }

.dirty-tag {
  margin-left: 8px;
  font-weight: 600;
  font-size: 11px;
}

.dirty-tag-lines { color: #e53935; }
.dirty-tag-pos   { color: #f9a825; }
</style>
