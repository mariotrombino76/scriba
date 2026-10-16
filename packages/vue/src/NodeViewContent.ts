import { defineComponent, h, inject, onMounted, ref, type InjectionKey, type PropType } from 'vue'

/** @internal The content element of the node view being rendered (see `vueNodeView`). */
export const CONTENT: InjectionKey<HTMLElement | null> = Symbol('scriba-node-content')

/**
 * Where the editor shows the node's content, inside a `vueNodeView`
 * component of a node with content (e.g. `<NodeViewContent class="body" />`).
 * The editor owns what is inside; Vue never re-renders it.
 */
export const NodeViewContent = defineComponent({
  name: 'NodeViewContent',
  props: { as: { type: String as PropType<'div' | 'span'>, default: 'div' } },
  setup(props) {
    const content = inject(CONTENT, null)
    const el = ref<HTMLElement | null>(null)
    onMounted(() => {
      if (content && el.value && content.parentNode !== el.value) el.value.appendChild(content)
    })
    return () => h(props.as, { ref: el })
  },
})
