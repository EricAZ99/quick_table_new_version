import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Socle ESLint commun front/back (doc 14 §14.1).
 *
 * Le style (indentation, guillemets, points-virgules) est entièrement
 * délégué à Prettier — aucune règle stylistique n'est activée ici, et
 * `eslint-config-prettier` désactive explicitement celles qui pourraient
 * entrer en conflit (doc 14 §14.1 : "pas de débat de style en PR").
 *
 * Ne contient volontairement aucune règle type-aware TypeScript : voir
 * `typeCheckedConfig` ci-dessous pour la raison (interop avec les fichiers
 * `.vue`).
 */
export const baseConfig = tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  prettierConfig,
);

/**
 * Couche additionnelle de linting *type-aware* (`recommendedTypeChecked`),
 * à ajouter explicitement par les paquets purement TypeScript (apps/api,
 * packages/shared-types).
 *
 * Volontairement PAS incluse dans `baseConfig`/`vueConfig` : un fichier
 * `.ts` qui importe un composant `.vue` (ex. `main.ts` → `App.vue`) reçoit
 * un type `any` de la part du service de types utilisé par ESLint, qui ne
 * passe pas par le plugin de langage de `vue-tsc` — ce qui déclenche de
 * faux positifs (`no-unsafe-argument`, etc.) sans rapport avec un vrai bug.
 * Limitation connue de l'écosystème Vue + typescript-eslint ; `vue-tsc`
 * (déjà exécuté par `pnpm typecheck`/`build`) reste la source de vérité du
 * typage sur `apps/web`.
 */
export const typeCheckedConfig = tseslint.config({
  files: ['**/*.ts', '**/*.tsx'],
  extends: [...tseslint.configs.recommendedTypeChecked],
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: process.cwd(),
    },
  },
});
