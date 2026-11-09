<script setup lang="ts">
import type { NodeJSON, Plugin, Schema } from '@scriba/core'
import { createTranslator, type Messages } from '@scriba/i18n'
import { defineScribaToolbar, inlineToolbar, type ScribaToolbar } from '@scriba/ui'
import type { NodeViewFactory } from '@scriba/view'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { sameContent, type Content, type ContentFormat } from '@scriba/view'
import { useScriba } from './useScriba.js'

const props = withDefaults(
  defineProps<{
    modelValue?: string | NodeJSON | null
    /** `'html'` (default) or `'json'`. */
    format?: ContentFormat
    schema?: Schema
    plugins?: Plugin[]
    editable?: boolean
    /** Accessible name; defaults to the translated "Rich text editor". */
    label?: string
    /** UI language (`'it'`, `'en'`…) or a message object. */
    locale?: string | Messages
    toolbar?: boolean
    /** Inline mode: page styles, toolbar only while focused (floating). Read when mounted. */
    inline?: boolean
    /** Custom views of atomic nodes, e.g. `{ task: vueNodeView(TaskView, { t }) }`. */
    nodeViews?: Readonly<Record<string, NodeViewFactory>>
  }>(),
  { modelValue: null, format: 'html', editable: true, toolbar: true, inline: false, locale: 'it' },
)

const emit = defineEmits<{
  'update:modelValue': [value: Content]
}>()

defineScribaToolbar()

const t = computed(() => createTranslator(props.locale))
const editorEl = ref<HTMLElement | null>(null)
const toolbarEl = ref<ScribaToolbar | null>(null)
const rootEl = ref<HTMLElement | null>(null)
let inlineHandle: { destroy(): void } | null = null
let lastEmitted: Content | null = props.modelValue ?? null

const scriba = useScriba(editorEl, {
  ...(props.schema ? { schema: props.schema } : {}),
  ...(props.plugins ? { plugins: props.plugins } : {}),
  ...(props.nodeViews ? { nodeViews: props.nodeViews } : {}),
  content: props.modelValue,
  format: props.format,
  editable: () => props.editable,
  label: () => props.label ?? t.value('editor.label'),
  onChange(value) {
    lastEmitted = value
    emit('update:modelValue', value)
  },
})

onMounted(() => {
  if (toolbarEl.value && scriba.view.value) {
    toolbarEl.value.translator = t.value
    toolbarEl.value.view = scriba.view.value
  }
  if (props.inline && rootEl.value && toolbarEl.value)
    inlineHandle = inlineToolbar(rootEl.value, toolbarEl.value)
})
onBeforeUnmount(() => inlineHandle?.destroy())

watch(t, (translate) => {
  if (toolbarEl.value) toolbarEl.value.translator = translate
})

// External v-model changes replace the content (parsed through the schema).
watch(
  () => props.modelValue,
  (value) => {
    if (sameContent(value, lastEmitted)) return
    lastEmitted = value ?? null
    scriba.setContent(value ?? null)
  },
)

defineExpose(scriba)
</script>

<template>
  <div ref="rootEl" :class="['scriba', { 'scriba-inline': inline }]">
    <scriba-toolbar v-if="toolbar" ref="toolbarEl" />
    <div ref="editorEl" class="scriba-mount" />
  </div>
</template>
