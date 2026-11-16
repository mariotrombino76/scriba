**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-task

Tasks (to-dos) inside the document: a block with a title, a "done" checkbox and a due date.
TinyMCE only has the checklist (`checklist`); here the task is a node with its own data,
exportable to HTML and JSON.

```bash
pnpm add @scriba-editor/plugin-task
```

## Usage

```ts
import { keymap } from '@scriba-editor/core'
import { taskKeymap, taskNodes, taskSlashItem, taskToolbarItem } from '@scriba-editor/plugin-task'

const schema = new Schema({ nodes: { ...basicSchemaSpec.nodes, ...taskNodes }, marks })

const plugins = [keymap(taskKeymap(), { priority: 70 })]
// toolbar: taskToolbarItem(schema)
// "/" menu: taskSlashItem(schema) among the slashCommands items
```

The plugin defines the **node and the commands**; the look (checkbox, fields) is a _node view_
that you choose, for example `vueNodeView(TaskView, { t })` from `@scriba-editor/vue` (see
`demo/main.ts`). Without a node view the node is still valid and gets exported.

## Exports

| Name                                                            | What it does                                                                                                                                                         |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `taskNodes`                                                     | `task` node: atomic block with the attributes `title`, `done`, `due`. HTML: `<div class="scriba-task" data-task data-done="false" data-due="2026-10-20">Title</div>` |
| `insertTask(schema, attrs?)`                                    | Command: inserts a task after the current block (in place of an empty paragraph) and selects it                                                                      |
| `selectedTask(state)`                                           | The selected task as a node, or `null`                                                                                                                               |
| `taskKeymap()`                                                  | Enter and Space on the selected task                                                                                                                                 |
| `taskToolbarItem(schema)`                                       | "Task" button (`id: 'task'`)                                                                                                                                         |
| `taskSlashItem(schema)`                                         | `/task` item (keywords: todo, task, attività, compito, checklist)                                                                                                    |
| `leaveTask(view, pos)`                                          | Selects the task again and returns focus to the editor (Esc in its fields)                                                                                           |
| `isTaskTitle`, `isTaskDate`, `titleFromText`, `MAX_TITLE` (200) | Validations                                                                                                                                                          |
| `TaskAttrs`                                                     | `{ title, done, due }`                                                                                                                                               |

## Keyboard

With the task selected: **Enter** moves focus into the first field of the node view; **Space**
toggles "done"; the arrow keys leave it as usual. Esc in the fields goes back to selecting the
task (`leaveTask`).

## Security

The title has at most 200 characters on one line, with no control characters and no direction
marks (which could hide or reorder text). The due date is a real `YYYY-MM-DD` date (not
`2026-02-30`); an invalid value in incoming HTML becomes `null`, and a `data-done` other than
`true` is `false`. Everything is text and typed attributes, never HTML. The server must still
run the HTML through `@scriba-editor/sanitize-server`. See [security](../../../docs/security.md)
and [plugins](../../../docs/plugins.md).
