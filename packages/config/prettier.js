/**
 * Configuration Prettier partagée (doc 14 §14.1). Aucune convention de
 * style n'étant imposée par la documentation d'architecture, ces valeurs
 * sont un choix d'implémentation KISS (doc 14 §14.5) : proche des
 * défauts Prettier, pour ne jamais avoir à en débattre en revue.
 */
export default {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  arrowParens: 'always',
};
