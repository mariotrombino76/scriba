// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { ScribaEditor, useScriba, type Content } from '../src/index.js'

const tick = () => new Promise((r) => setTimeout(r, 0))

function beforeInput(el: Element, inputType: string, data: string | null = null) {
  el.dispatchEvent(
    new InputEvent('beforeinput', { inputType, data, cancelable: true, bubbles: true }),
  )
}

describe('<ScribaEditor>', () => {
  it('renders HTML from v-model through the schema', async () => {
    const wrapper = mount(ScribaEditor, {
      props: { modelValue: '<h1>T</h1><p onclick="x">a <b>b</b><script>alert(1)</script></p>' },
      attachTo: document.body,
    })
    await nextTick()
    const editor = wrapper.find('.scriba-editor')
    expect(editor.element.innerHTML).toContain('<h1>T</h1><p>a <strong>b</strong></p>')
    expect(editor.attributes('aria-label')).toBe('Editor di testo formattato')
    expect(wrapper.find('scriba-toolbar').attributes('role')).toBe('toolbar')
    wrapper.unmount()
  })

  it('inline: the toolbar shows only while the editor has the focus', async () => {
    const wrapper = mount(ScribaEditor, {
      props: { modelValue: '<p>a</p>', inline: true },
      attachTo: document.body,
    })
    await nextTick()
    expect(wrapper.classes()).toContain('scriba-inline')
    const bar = wrapper.find('scriba-toolbar').element as HTMLElement
    expect(bar.hidden).toBe(true)
    ;(wrapper.find('.scriba-editor').element as HTMLElement).focus()
    expect(bar.hidden).toBe(false)
    wrapper.unmount()
  })

  it('emits update:modelValue as HTML when typing', async () => {
    const wrapper = mount(ScribaEditor, {
      props: { modelValue: '<p>ab</p>' },
      attachTo: document.body,
    })
    await nextTick()
    const editor = wrapper.find('.scriba-editor').element as HTMLElement
    beforeInput(editor, 'insertText', 'X')
    const emitted = wrapper.emitted('update:modelValue')!
    expect(emitted.at(-1)).toEqual(['<p>Xab</p>'])
    wrapper.unmount()
  })

  it('supports the JSON format', async () => {
    const value = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'j' }] }],
    }
    const wrapper = mount(ScribaEditor, {
      props: { modelValue: value, format: 'json' },
      attachTo: document.body,
    })
    await nextTick()
    beforeInput(wrapper.find('.scriba-editor').element, 'insertText', 'K')
    const last = wrapper.emitted('update:modelValue')!.at(-1)![0] as {
      content: { content: { text: string }[] }[]
    }
    expect(last.content[0]!.content[0]!.text).toBe('Kj')
    wrapper.unmount()
  })

  it('applies external v-model changes without emitting them back', async () => {
    const wrapper = mount(ScribaEditor, {
      props: { modelValue: '<p>a</p>' },
      attachTo: document.body,
    })
    await nextTick()
    await wrapper.setProps({ modelValue: '<p>nuovo <em>testo</em></p>' })
    expect(wrapper.find('.scriba-editor').element.innerHTML).toContain(
      '<p>nuovo <em>testo</em></p>',
    )
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('works with v-model in a parent and toggles editable', async () => {
    const Parent = defineComponent({
      setup() {
        const html = ref<Content>('<p>x</p>')
        const editable = ref(true)
        return { html, editable }
      },
      render() {
        return h(ScribaEditor, {
          modelValue: this.html,
          'onUpdate:modelValue': (v: Content) => (this.html = v),
          editable: this.editable,
          locale: 'en',
        })
      },
    })
    const wrapper = mount(Parent, { attachTo: document.body })
    await nextTick()
    const editor = wrapper.find('.scriba-editor')
    beforeInput(editor.element, 'insertText', 'Y')
    await nextTick()
    expect(wrapper.vm.html).toBe('<p>Yx</p>')
    expect(editor.attributes('aria-label')).toBe('Rich text editor')
    wrapper.vm.editable = false
    await nextTick()
    expect(editor.attributes('contenteditable')).toBe('false')
    wrapper.unmount()
  })

  it('cleans up on unmount', async () => {
    const wrapper = mount(ScribaEditor, {
      props: { modelValue: '<p>a</p>' },
      attachTo: document.body,
    })
    await nextTick()
    wrapper.unmount()
    await tick()
    expect(document.querySelector('.scriba-editor')).toBeNull()
  })
})

describe('useScriba', () => {
  it('creates an editor in a template ref and exposes helpers', async () => {
    let api: ReturnType<typeof useScriba> | null = null
    const Comp = defineComponent({
      setup() {
        const el = ref<HTMLElement | null>(null)
        api = useScriba(el, { content: '<p>hi</p>' })
        return () => h('div', { ref: el })
      },
    })
    const wrapper = mount(Comp, { attachTo: document.body })
    await nextTick()
    expect(api!.getContent()).toBe('<p>hi</p>')
    api!.setContent('<h2>x</h2><img src=x onerror=alert(1)>')
    expect(api!.getContent()).toBe('<h2>x</h2>')
    wrapper.unmount()
  })
})
