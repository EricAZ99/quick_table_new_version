/**
 * Configuration Commitlint (doc 14 §14.1/§14.2, doc 30 §30.1/§30.2).
 *
 * Le type-enum est explicitement restreint aux 8 types documentés pour
 * les branches/commits (doc 30 §30.1) : `@commitlint/config-conventional`
 * en propose davantage par défaut (`build`, `ci`, `revert`, `style`...),
 * hors périmètre tant qu'ils ne sont pas ajoutés à la documentation.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'refactor', 'chore', 'test', 'docs', 'perf', 'security'],
    ],
  },
};
