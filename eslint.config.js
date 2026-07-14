import { baseConfig, typeCheckedConfig } from '@quicktable/config/eslint/base';
import { vueConfig } from '@quicktable/config/eslint/vue';
import tseslint from 'typescript-eslint';

/**
 * Point d'entrée ESLint unique du monorepo (doc 14 §14.1).
 *
 * En flat config, ESLint résout `eslint.config.js` par rapport au
 * répertoire courant du process, pas par dossier lint — un seul fichier
 * à la racine (et non un par paquet) est donc nécessaire pour que
 * `pnpm lint` (racine) et les hooks Husky/lint-staged (§14.1, exécutés
 * depuis la racine du dépôt) résolvent la même configuration.
 */
export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/.turbo/**'],
  },
  {
    files: ['apps/api/**/*.{ts,tsx}', 'packages/shared-types/**/*.{ts,tsx}'],
    extends: [...baseConfig, ...typeCheckedConfig],
  },
  {
    files: ['packages/config/**/*.js'],
    extends: [...baseConfig],
  },
  {
    files: ['apps/web/**/*.{ts,tsx,vue}'],
    extends: [...vueConfig],
  },
);
