import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import noUnsanitized from 'eslint-plugin-no-unsanitized'
import pluginVue from 'eslint-plugin-vue'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.nuxt/**',
      '**/.output/**',
      'e2e/.dist/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
    rules: {
      // v-html would bypass the schema parser (CLAUDE.md §5.2)
      'vue/no-v-html': 'error',
      // TypeScript checks globals; optional props are fine with TS types
      'no-undef': 'off',
      'vue/require-default-prop': 'off',
      // formatting is Prettier's job
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-this-alias': ['error', { allowedNames: ['node'] }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // Security rules (CLAUDE.md §5.2). Never disable to make the build pass.
  noUnsanitized.configs.recommended,
  {
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-restricted-properties': [
        'error',
        { object: 'document', property: 'write', message: 'Forbidden (CLAUDE.md §5.2).' },
        { object: 'document', property: 'writeln', message: 'Forbidden (CLAUDE.md §5.2).' },
      ],
    },
  },
  {
    // Tests contain javascript: URLs on purpose: they are the XSS payloads being blocked.
    files: ['**/test/**/*.ts'],
    rules: { 'no-script-url': 'off', 'vue/one-component-per-file': 'off' },
  },
)
