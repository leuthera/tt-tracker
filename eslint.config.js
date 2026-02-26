'use strict';

const globals = require('globals');
const html = require('eslint-plugin-html');

const rules = {
  'no-undef': 'error',
  'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
};

module.exports = [
  // Backend: server.js, db-service.js, lib/
  {
    files: ['server.js', 'db-service.js', 'lib/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node, fetch: 'readonly' },
    },
    rules,
  },
  // Tests
  {
    files: ['test/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules,
  },
  // Frontend (HTML with inline <script>)
  {
    files: ['**/*.html'],
    plugins: { html },
    languageOptions: {
      sourceType: 'script',
      globals: globals.browser,
    },
    rules,
  },
  // Service worker
  {
    files: ['sw.js'],
    languageOptions: {
      sourceType: 'script',
      globals: globals.serviceworker,
    },
    rules,
  },
];
