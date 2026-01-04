<template>
  <div class="dimensions-editor">
    <div class="editor-header" @click="toggleExpanded">
      <span class="toggle-icon">{{ isExpanded ? '▼' : '▶' }}</span>
      <span class="header-label">Dimension Definitions</span>
      <span v-if="isModified" class="modified-badge">Modified</span>
    </div>

    <div v-show="isExpanded" class="editor-content">
      <div class="editor-description">
        Define computed dimensions using Malloy's <code>pick</code> syntax.
        Dimensions sort by <strong>declaration order</strong> (the order picks are listed).
      </div>

      <pre
        class="malloy-input"
        contenteditable="true"
        spellcheck="false"
        @input="onInput"
        ref="editorRef"
      >{{ currentContent }}</pre>

      <div class="editor-actions">
        <button
          class="action-btn apply-btn"
          @click="applyChanges"
          :disabled="!isModified || isApplying"
        >
          {{ isApplying ? 'Applying...' : 'Apply Changes' }}
        </button>
        <button
          class="action-btn reset-btn"
          @click="resetToDefault"
          :disabled="isApplying"
        >
          Reset to Default
        </button>
      </div>

      <div v-if="error" class="error-message">
        {{ error }}
      </div>

      <div v-if="successMessage" class="success-message">
        {{ successMessage }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

const emit = defineEmits<{
  (e: 'dimensionsUpdated'): void
}>()

const editorRef = ref<HTMLPreElement | null>(null)
const isExpanded = ref(false)
const originalContent = ref('')
const currentContent = ref('')
const editedContent = ref('')
const isApplying = ref(false)
const error = ref<string | null>(null)
const successMessage = ref<string | null>(null)

const isModified = computed(() => {
  return editedContent.value.trim() !== originalContent.value.trim()
})

function toggleExpanded() {
  isExpanded.value = !isExpanded.value
}

function onInput(e: Event) {
  const target = e.target as HTMLPreElement
  editedContent.value = target.innerText || ''
  console.log('[DimensionsEditor] onInput - content length:', editedContent.value.length, 'isModified:', editedContent.value.trim() !== originalContent.value.trim())
  error.value = null
  successMessage.value = null
}

async function loadCurrentDimensions() {
  try {
    const module = await import('../../../utils/tpl-executor')
    const executor = module.getExecutor()

    if (!executor.isReady()) {
      await executor.initialize()
    }

    const extendBlock = executor.getExtendBlock()
    console.log('[DimensionsEditor] Loaded extend block, length:', extendBlock.length)
    originalContent.value = extendBlock
    currentContent.value = extendBlock
    editedContent.value = extendBlock

    // Also set the editor ref content directly
    if (editorRef.value) {
      editorRef.value.innerText = extendBlock
    }
  } catch (err: any) {
    error.value = `Failed to load dimensions: ${err.message}`
  }
}

async function applyChanges() {
  if (!isModified.value || isApplying.value) return

  isApplying.value = true
  error.value = null
  successMessage.value = null

  try {
    const module = await import('../../../utils/tpl-executor')
    const executor = module.getExecutor()

    console.log('[DimensionsEditor] Applying changes, content length:', editedContent.value.length)
    console.log('[DimensionsEditor] Content starts with:', editedContent.value.substring(0, 100))
    executor.updateDimensions(editedContent.value)

    // Update references
    originalContent.value = editedContent.value
    currentContent.value = editedContent.value

    successMessage.value = 'Dimensions updated! Run your query to see changes.'
    emit('dimensionsUpdated')

    // Clear success message after a few seconds
    setTimeout(() => {
      successMessage.value = null
    }, 3000)
  } catch (err: any) {
    error.value = `Failed to apply changes: ${err.message}`
  } finally {
    isApplying.value = false
  }
}

async function resetToDefault() {
  if (isApplying.value) return

  isApplying.value = true
  error.value = null
  successMessage.value = null

  try {
    const module = await import('../../../utils/tpl-executor')
    const executor = module.getExecutor()

    await executor.resetDimensions()

    // Reload the content
    await loadCurrentDimensions()

    // Update the editor display
    if (editorRef.value) {
      editorRef.value.innerText = currentContent.value
    }

    successMessage.value = 'Reset to default dimensions.'
    emit('dimensionsUpdated')

    setTimeout(() => {
      successMessage.value = null
    }, 3000)
  } catch (err: any) {
    error.value = `Failed to reset: ${err.message}`
  } finally {
    isApplying.value = false
  }
}

onMounted(() => {
  loadCurrentDimensions()
})
</script>

<style scoped>
.dimensions-editor {
  margin: 24px 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  overflow: hidden;
  background: var(--vp-c-bg-soft);
}

.editor-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--vp-c-bg);
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid var(--vp-c-divider);
}

.editor-header:hover {
  background: var(--vp-c-bg-soft);
}

.toggle-icon {
  font-size: 10px;
  color: var(--vp-c-text-2);
  width: 16px;
}

.header-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  flex: 1;
}

.modified-badge {
  font-size: 11px;
  padding: 2px 8px;
  background: var(--vp-c-yellow-soft);
  color: var(--vp-c-yellow-2);
  border-radius: 4px;
  font-weight: 500;
}

.editor-content {
  padding: 16px;
  background: var(--vp-c-bg);
}

.editor-description {
  font-size: 13px;
  color: var(--vp-c-text-2);
  margin-bottom: 12px;
  line-height: 1.5;
}

.editor-description code {
  padding: 2px 6px;
  background: var(--vp-c-bg-soft);
  border-radius: 3px;
  font-size: 12px;
}

.malloy-input {
  width: 100%;
  min-height: 200px;
  max-height: 400px;
  padding: 12px;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 1.5;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  overflow: auto;
  white-space: pre;
  margin: 0;
  outline: none;
}

.malloy-input:focus {
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 0 0 3px var(--vp-c-brand-soft);
}

.editor-actions {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

.action-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.apply-btn {
  background: var(--vp-c-brand-1);
  color: white;
}

.apply-btn:hover:not(:disabled) {
  background: var(--vp-c-brand-2);
}

.reset-btn {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  border: 1px solid var(--vp-c-divider);
}

.reset-btn:hover:not(:disabled) {
  background: var(--vp-c-bg-elv);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-message {
  margin-top: 12px;
  padding: 12px;
  background: var(--vp-custom-block-danger-bg);
  color: var(--vp-custom-block-danger-text);
  border-radius: 6px;
  font-size: 13px;
}

.success-message {
  margin-top: 12px;
  padding: 12px;
  background: var(--vp-custom-block-tip-bg);
  color: var(--vp-custom-block-tip-text);
  border-radius: 6px;
  font-size: 13px;
}
</style>
