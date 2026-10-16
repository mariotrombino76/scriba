<script setup lang="ts">
/**
 * Example node view with editable content: a callout box whose kind is
 * chosen in a Vue header, while the text inside is edited by the editor
 * (`<NodeViewContent>`). Use with `calloutNodes` from `@scriba/plugin-callout`:
 * `nodeViews: { callout: vueNodeView(CalloutView, { t }) }`.
 * The header is `contenteditable="false"`: the caret stays in the text.
 */
import type { Node } from '@scriba/core'
import { createTranslator, type MessageKey, type Translate } from '@scriba/i18n'
import { computed, ref } from 'vue'
import { NodeViewContent } from '../NodeViewContent.js'

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

const KINDS = ['info', 'tip', 'warning', 'danger'] as const
type Kind = (typeof KINDS)[number]
const ICONS: Record<Kind, string> = { info: 'ℹ', tip: '💡', warning: '⚠', danger: '⛔' }

const tr = computed(() => props.t ?? createTranslator('en'))
const kind = computed<Kind>(() =>
  KINDS.includes(props.attrs['kind'] as Kind) ? (props.attrs['kind'] as Kind) : 'info',
)
const kindLabel = (k: Kind) => tr.value(`callout.${k}` as MessageKey)
const buttons = ref<HTMLButtonElement[]>([])

function choose(k: Kind): void {
  if (k !== kind.value) props.updateAttrs({ kind: k })
}

/** Radio group keys: arrows move and choose, Escape goes back to the text. */
function onKey(event: KeyboardEvent, index: number): void {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
  if (event.key === 'Escape') {
    event.preventDefault()
    props.leave()
    return
  }
  if (!step) return
  event.preventDefault()
  const next = (index + step + KINDS.length) % KINDS.length
  choose(KINDS[next]!)
  buttons.value[next]?.focus()
}
</script>

<template>
  <div
    class="scriba-callout-view"
    :data-callout="kind"
    role="note"
    :aria-label="tr('callout.label', { kind: kindLabel(kind) })"
  >
    <div class="scriba-callout-head" contenteditable="false">
      <span class="scriba-callout-icon" aria-hidden="true">{{ ICONS[kind] }}</span>
      <div role="radiogroup" :aria-label="tr('callout.kind')">
        <button
          v-for="(k, i) in KINDS"
          :key="k"
          ref="buttons"
          type="button"
          role="radio"
          class="scriba-callout-kind"
          :aria-checked="k === kind"
          :tabindex="k === kind ? 0 : -1"
          :disabled="!editable"
          @click="choose(k)"
          @keydown="onKey($event, i)"
        >
          {{ kindLabel(k) }}
        </button>
      </div>
    </div>
    <NodeViewContent class="scriba-callout-body" />
  </div>
</template>
