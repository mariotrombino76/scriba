<script setup lang="ts">
/**
 * Example node view: a task (done, title, due date) drawn by Vue.
 * Use with `taskNodes` from `@scriba-editor/plugin-task`:
 * `nodeViews: { task: vueNodeView(TaskView, { t }) }`.
 * Changes go through `updateAttrs` (validated by the schema, undoable);
 * the title is committed on Enter or when leaving the field, not per key.
 */
import type { Node } from '@scriba-editor/core'
import { createTranslator, type Translate } from '@scriba-editor/i18n'
import { computed, ref, useId } from 'vue'

// The props of every `vueNodeView` component (see NodeViewProps), declared
// here so the SFC compiler can read them without resolving imported types.
const props = defineProps<{
  node: Node
  attrs: Readonly<Record<string, unknown>>
  selected: boolean
  editable: boolean
  updateAttrs: (attrs: Record<string, unknown>) => boolean
  leave: () => void
  t: Translate | undefined
}>()
const tr = computed(() => props.t ?? createTranslator('en'))
const id = useId()
const title = computed(() => (props.attrs['title'] as string) ?? '')
const done = computed(() => props.attrs['done'] === true)
const due = computed(() => (props.attrs['due'] as string | null) ?? '')
const dueError = ref(false)

function today(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const overdue = computed(() => !done.value && !!due.value && due.value < today())
const summary = computed(() =>
  tr.value('task.summary', {
    title: title.value || tr.value('task.new'),
    state: tr.value(done.value ? 'task.stateDone' : 'task.stateOpen'),
  }),
)

function toggle(): void {
  props.updateAttrs({ done: !done.value })
}

function commitTitle(event: Event): void {
  const input = event.target as HTMLInputElement
  const value = input.value.replace(/\s+/g, ' ').trim()
  if (value !== title.value && !props.updateAttrs({ title: value })) input.value = title.value
}

function commitDue(event: Event): void {
  const input = event.target as HTMLInputElement
  const value = input.value.trim()
  if (value === due.value) return
  dueError.value = !props.updateAttrs({ due: value || null })
}

/** Enter keeps the change, Escape drops it; both go back to the editor. */
function onKey(event: KeyboardEvent): void {
  if (event.key !== 'Escape' && event.key !== 'Enter') return
  event.preventDefault()
  const input = event.target as HTMLInputElement
  if (event.key === 'Escape' && input.type === 'text') {
    input.value = input.classList.contains('scriba-task-due') ? due.value : title.value
    dueError.value = false
  }
  input.blur() // fires change when the value differs
  props.leave()
}
</script>

<template>
  <div
    class="scriba-task-view"
    :class="{ 'is-done': done, 'is-selected': selected, 'is-overdue': overdue }"
    role="group"
    :aria-label="summary"
  >
    <input
      :id="`${id}-done`"
      type="checkbox"
      class="scriba-task-done"
      :checked="done"
      :disabled="!editable"
      :aria-label="tr('task.done')"
      @change="toggle"
      @keydown="onKey"
    />
    <input
      type="text"
      class="scriba-task-title"
      :value="title"
      :readonly="!editable"
      :placeholder="tr('task.new')"
      :aria-label="tr('task.title')"
      maxlength="200"
      @change="commitTitle"
      @keydown="onKey"
    />
    <input
      type="text"
      class="scriba-task-due"
      :value="due"
      :readonly="!editable"
      :aria-label="tr('task.due')"
      :aria-invalid="dueError"
      :aria-describedby="dueError ? `${id}-due-error` : undefined"
      inputmode="numeric"
      maxlength="10"
      size="10"
      @change="commitDue"
      @keydown="onKey"
    />
    <span v-if="overdue" class="scriba-task-overdue">{{ tr('task.overdue') }}</span>
    <span v-if="dueError" :id="`${id}-due-error`" class="scriba-task-error" role="alert">
      {{ tr('task.dueInvalid') }}
    </span>
  </div>
</template>
