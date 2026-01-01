<template>
  <div class="tpl-playground">
    <div class="playground-editor">
      <div class="editor-header">
        <span class="editor-label">{{ label }}</span>
        <div class="editor-actions">
          <span v-if="showStatus" :class="['status-badge', statusType]">
            {{ statusText }}
          </span>
          <button
            class="execute-btn"
            @click="execute"
            :disabled="isLoading || !tplCode"
          >
            {{ isLoading ? 'Running...' : 'Run' }}
          </button>
        </div>
      </div>
      <pre
        class="tpl-input"
        contenteditable="true"
        spellcheck="false"
        @input="onInput"
        @keydown.ctrl.enter.prevent="execute"
        @keydown.meta.enter.prevent="execute"
        ref="editorRef"
      >{{ normalizedQuery }}</pre>
      <div v-if="showDataset" class="dataset-info">
        <span class="info-label">Dataset:</span>
        <code>{{ dataset }}</code>
        <span class="schema">{{ schemaHint }}</span>
      </div>
    </div>

    <div v-if="hasOutput" class="playground-output">
      <div v-if="showTabs" class="output-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="['tab-btn', { active: activeTab === tab.id }]"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="output-content">
        <div v-if="error" class="error-message">
          {{ error }}
        </div>

        <template v-else-if="result">
          <div v-show="activeTab === 'table'" class="table-output" v-html="result.html" />
          <pre v-show="activeTab === 'malloy'" class="code-output">{{ result.malloy }}</pre>
          <pre v-show="activeTab === 'data'" class="code-output">{{ formatJSON(result.data) }}</pre>
        </template>

        <div v-if="result && showTiming" class="timing-info">
          Parse: {{ result.parseTime }}ms |
          Compile: {{ result.compileTime }}ms |
          Execute: {{ result.executeTime }}ms |
          Render: {{ result.renderTime }}ms
        </div>
      </div>
    </div>

    <!-- Try Variations Section -->
    <div v-if="variations && variations.length > 0" class="playground-variations">
      <div class="variations-header">Try Variations</div>
      <div class="variations-list">
        <button
          v-for="(variation, index) in variations"
          :key="index"
          class="variation-btn"
          @click="loadVariation(variation)"
          :disabled="isLoading"
        >
          <span class="variation-arrow">▶</span>
          <span class="variation-label">{{ variation.label }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

interface Variation {
  label: string
  query: string
}

interface Props {
  initialQuery?: string
  dataset?: string
  label?: string
  editorRows?: number
  showTabs?: boolean
  showTiming?: boolean
  showDataset?: boolean
  autoRun?: boolean
  variations?: Variation[]
}

const props = withDefaults(defineProps<Props>(), {
  initialQuery: '',
  dataset: 'samples',
  label: 'TPL Query',
  editorRows: 3,
  showTabs: false,
  showTiming: false,
  showDataset: true,
  autoRun: false,
  variations: () => []
})

const editorRef = ref<HTMLPreElement | null>(null)
// Handle escaped characters in initial query (from markdown props)
const normalizedQuery = computed(() => {
  return props.initialQuery
    .replace(/\\n/g, '\n')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
})
const tplCode = ref('')
const isLoading = ref(false)
const result = ref<any>(null)
const error = ref<string | null>(null)
const activeTab = ref('table')
const hasModified = ref(false)
const hasExecuted = ref(false)

const tabs = [
  { id: 'table', label: 'Table' },
  { id: 'malloy', label: 'Malloy' },
  { id: 'data', label: 'Data' }
]

const schemaHint = computed(() => {
  if (props.dataset === 'samples') {
    return 'occupation, education, gender, income'
  }
  return ''
})

// Has any output to show
const hasOutput = computed(() => {
  return error.value || result.value
})

// Status badge display logic
const showStatus = computed(() => false)
const statusType = computed(() => '')
const statusText = computed(() => '')

function onInput(e: Event) {
  const target = e.target as HTMLPreElement
  tplCode.value = target.innerText || ''
  hasModified.value = tplCode.value.trim() !== normalizedQuery.value.trim()
}

async function execute() {
  if (!tplCode.value.trim() || isLoading.value) {
    return
  }

  isLoading.value = true
  error.value = null
  result.value = null

  try {
    // Import TPL executor dynamically (will be available in browser)
    const module = await import('../../../utils/tpl-executor')
    const executor = module.getExecutor()

    if (!executor.isReady()) {
      await executor.initialize()
    }

    const execResult = await executor.execute(tplCode.value, props.dataset)

    if (execResult.success) {
      result.value = execResult
      hasExecuted.value = true
      activeTab.value = 'table'
    } else {
      error.value = execResult.error || 'Unknown error'
    }
  } catch (err: any) {
    error.value = err.message || String(err)
  } finally {
    isLoading.value = false
  }
}

function formatJSON(data: any): string {
  if (!data) return '(Run query to see data)'
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

function loadVariation(variation: Variation) {
  // Normalize the query (handle escaped newlines)
  const query = variation.query
    .replace(/\\n/g, '\n')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

  // Update the editor content
  if (editorRef.value) {
    editorRef.value.innerText = query
  }
  tplCode.value = query
  hasModified.value = true

  // Execute the new query
  execute()
}

onMounted(() => {
  // Initialize tplCode with normalized query
  tplCode.value = normalizedQuery.value

  if (props.autoRun && tplCode.value) {
    execute()
  }
})
</script>

<style scoped>
.tpl-playground {
  margin: 24px 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  overflow: hidden;
  background: var(--vp-c-bg-soft);
}

.playground-editor {
  background: var(--vp-c-bg);
  padding: 16px;
  border-bottom: 1px solid var(--vp-c-divider);
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.editor-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-2);
}

.editor-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-badge {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.status-badge.cached {
  background: var(--vp-c-green-soft);
  color: var(--vp-c-green-2);
}

.status-badge.modified {
  background: var(--vp-c-yellow-soft);
  color: var(--vp-c-yellow-2);
}

.execute-btn {
  padding: 6px 16px;
  background: var(--vp-c-brand-1);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.execute-btn:hover:not(:disabled) {
  background: var(--vp-c-brand-2);
}

.execute-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tpl-input {
  width: 100%;
  padding: 12px;
  font-family: var(--vp-font-family-mono);
  font-size: 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  line-height: 1.5;
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-x: auto;
  min-height: 2.5em;
  outline: none;
}

.tpl-input:focus {
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 0 0 3px var(--vp-c-brand-soft);
}

.dataset-info {
  margin-top: 8px;
  font-size: 12px;
  color: var(--vp-c-text-2);
}

.dataset-info code {
  margin: 0 4px;
  padding: 2px 6px;
  background: var(--vp-c-bg-soft);
  border-radius: 3px;
}

.dataset-info .schema {
  margin-left: 8px;
  color: var(--vp-c-text-3);
}

.playground-output {
  background: var(--vp-c-bg);
}

.output-tabs {
  display: flex;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
}

.tab-btn {
  padding: 10px 16px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  font-size: 13px;
  font-weight: 500;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn:hover {
  color: var(--vp-c-text-1);
}

.tab-btn.active {
  color: var(--vp-c-brand-1);
  border-bottom-color: var(--vp-c-brand-1);
}

.output-content {
  padding: 16px;
}

.error-message {
  padding: 16px;
  background: var(--vp-custom-block-danger-bg);
  color: var(--vp-custom-block-danger-text);
  border-radius: 6px;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  white-space: pre-wrap;
}

.table-output {
  overflow-x: auto;
}

.code-output {
  margin: 0;
  padding: 16px;
  background: var(--vp-c-bg-soft);
  border-radius: 6px;
  overflow-x: auto;
  font-size: 12px;
  line-height: 1.6;
  max-height: 500px;
  overflow-y: auto;
  white-space: pre-wrap;
}

.timing-info {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--vp-c-divider);
  font-size: 11px;
  color: var(--vp-c-text-3);
  text-align: right;
}

/* Variations Section */
.playground-variations {
  background: var(--vp-c-bg);
  border-top: 1px solid var(--vp-c-divider);
  padding: 16px;
}

.variations-header {
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-2);
  margin-bottom: 12px;
}

.variations-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.variation-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  font-size: 13px;
  color: var(--vp-c-text-1);
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}

.variation-btn:hover:not(:disabled) {
  background: var(--vp-c-bg-elv);
  border-color: var(--vp-c-brand-1);
}

.variation-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.variation-arrow {
  color: var(--vp-c-brand-1);
  font-size: 10px;
  flex-shrink: 0;
}

.variation-label {
  flex: 1;
}
</style>
