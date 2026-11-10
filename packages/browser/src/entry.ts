// The build's entry: the theme (bundled into scriba.css) plus the API. The CSS import
// stays out of index.ts so that the published type declarations do not reference it.
import '../../themes/scriba.css'

export * from './index.js'
