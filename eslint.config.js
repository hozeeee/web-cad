import antfu from '@antfu/eslint-config'

export default antfu(
  {
    react: true,
    typescript: true,
    formatters: { css: true, html: true },
    ignores: [
      'dist/**',
      'playwright-report/**',
      'test-results/**',
      '.qoder/**',
      'engine/dwg/target/**',
    ],
  },
  {
    rules: {
      'react-dom/no-missing-button-type': 'off',
      'no-alert': 'off',
    },
  },
)
