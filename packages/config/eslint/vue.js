import vue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import { baseConfig } from './base.js';

/**
 * Socle ESLint pour apps/web (doc 14 §14.1, doc 11).
 *
 * Ajoute les règles Vue 3 Composition API (doc 11 §11 point 3) et les deux
 * règles d'architecture frontend explicitement documentées (doc 11 §11
 * point 4) : `src/services/` est le seul point d'entrée autorisé vers
 * Axios et `localStorage`, pour empêcher les composants d'y accéder
 * directement et de désynchroniser l'état du store Pinia.
 */
export const vueConfig = tseslint.config(
  ...baseConfig,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    files: ['src/**/*.{ts,vue}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ['src/**/*.{ts,vue}'],
    ignores: ['src/services/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'axios',
              message: 'Axios ne doit être importé que depuis src/services/ (doc 11 §11, point 4).',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'localStorage',
          message:
            'localStorage ne doit être accédé que depuis src/services/ (doc 11 §11, point 4).',
        },
      ],
    },
  },
);
