# 22. Stratégie de versioning

## 22.1 Principe général

Deux familles de versioning bien distinctes, à ne jamais confondre :
1. **Versioning de valeur historique** (immutabilité d'un fait passé) : le prix d'un plat au moment d'une commande ne doit jamais changer rétroactivement.
2. **Versioning de configuration/schéma** (évolution contrôlée d'une définition) : un plan SaaS, un ensemble de permissions, un schéma d'API évoluent dans le temps et doivent pouvoir être audités/migrés.

## 22.2 Menus, Produits, Prix — versioning par dénormalisation (déjà en place, formalisé)

Le doc 05 §5.5 dénormalise déjà `name`/`unitPrice` dans `order.items[]` au moment de la commande — c'est la stratégie de versioning retenue pour cette catégorie, **sans collection de versions dédiée** (over-engineering évité, doc 14 KISS) :
- Un `menuItem` n'a qu'une version courante (`menuItems` doc 05) ; toute modification écrase la précédente.
- La valeur légale d'une commande passée reste garantie par la copie dans `order.items[]`, jamais par une remontée dans l'historique du `menuItem`.
- **Amendement de cette revue** : ajout d'un champ `menuItems.priceHistory` (array `[{ price, effectiveFrom, effectiveTo }]`, limité aux 20 dernières entrées) — utile pour l'analyse de marge dans le temps (doc 04 module `statistics`) sans faire porter cette responsabilité à `order.items[]`.

## 22.3 Recettes (`menuItems.recipe[]`)

Une recette peut évoluer (changement de fournisseur, ajustement de quantité d'ingrédient) sans que cela remette en cause les mouvements de stock déjà enregistrés (`stockMovements`, doc 05, collection append-only qui fait foi de ce qui a réellement été décrémenté). Aucune version explicite nécessaire au-delà de l'historique naturel de `stockMovements`.

## 22.4 Permissions — versioning par compteur (`permissionsVersion`)

Déjà conçu au doc 07 §7.2 : `memberships`/`users` porte un `permissionsVersion` incrémenté à chaque changement de rôle/permission, comparé au claim du JWT en cours pour forcer un refresh. **Amendement de cette revue** : la définition elle-même des permissions par rôle (doc 08 §8.4, matrice statique) est déplacée en base dans une collection `roleDefinitions` versionnée :

| Champ | Type | Description |
|---|---|---|
| `_id` | ObjectId | |
| `roleCode` | enum | `manager`, `cashier`, etc. |
| `version` | number | incrémenté à chaque changement de la matrice |
| `permissions` | string[] | |
| `effectiveFrom` | Date | |
| `isCurrent` | boolean | une seule version courante par `roleCode` |

Cela permet un **audit complet** ("quelles permissions un Manager avait-il le 3 mars ?", utile pour une investigation de sécurité, doc 24) sans recompiler le code — cohérent avec le principe RBAC "les permissions sont des données, pas du code" (doc 14 §14.4).

## 22.5 Plans SaaS (`subscriptionPlans`)

Un plan ne doit **jamais être modifié en place** une fois qu'un tenant y est abonné activement — sinon un changement de `limits`/`features` du plan "Business" affecterait rétroactivement tous les clients Business existants sans préavis contractuel. Stratégie retenue :
- `subscriptionPlans.version` (number) + `subscriptionPlans.code` reste stable (`business`) mais chaque révision crée un nouveau document avec `version: n+1` et `supersedesVersion: n`.
- `subscriptions.planVersion` fige la version au moment de la souscription — un tenant reste sur les termes de la version à laquelle il a souscrit jusqu'à un changement de plan explicite ou une politique de migration communiquée (ex. "tous les clients passeront à la v2 du plan Business le 1er janvier, avec préavis 60 jours").
- Nouvelle collection légère `planMigrations` trace les migrations forcées (`fromVersion, toVersion, tenantIds[], scheduledAt, reason`).

## 22.6 Configuration (`restaurants.settings`, `subscriptionPlans.features`)

- Toute configuration à fort impact (feature flags globaux, doc 18 §18.8) est versionnée par un simple horodatage `updatedAt` + entrée dans `auditLogs` (doc 24) — pas besoin d'un historique complet, la fréquence de changement est faible et le risque limité.
- Les feature flags de rollout progressif (doc 18 §18.8, distincts du feature gating commercial) sont gérés par un outil dédié (LaunchDarkly ou équivalent open-source type Unleash) dès que leur nombre dépasse la douzaine — leur propre système de versioning/audit est alors délégué à l'outil, pas réinventé.

## 22.7 API (`/api/v1`, `/api/v2`...)

- **SemVer appliqué au niveau du préfixe majeur uniquement** (`/api/v1`) — les évolutions mineures et correctifs non cassants (ajout de champ optionnel en réponse, nouvel endpoint) ne changent jamais le préfixe.
- **Définition d'un breaking change** (nécessitant `/v2`) : suppression/renommage d'un champ, changement de type d'un champ existant, changement de sémantique d'un code d'erreur, suppression d'un endpoint.
- **Politique de dépréciation** : un endpoint `/v1` déprécié au profit de `/v2` reste actif au minimum 6 mois, avec header de réponse `Deprecation: true` et `Sunset: <date>` (RFC 8594), documenté dans le changelog (doc 17 §17.2).
- **Le frontend `apps/web` cible toujours la dernière version stable** (pas de multi-version côté client interne) ; seuls les clients externes (intégrations Premium, doc 09 §9.16 `api_access`) peuvent rester sur une version dépréciée pendant la fenêtre de transition.
- Les schémas Zod (doc 12 §12.2) portent implicitement la version courante ; un `/v2` d'un module implique un nouveau fichier `*.validators.v2.ts` cohabitant avec le v1 le temps de la transition, jamais une modification en place du v1.

## 22.8 Résumé — mécanisme de versioning par catégorie

| Catégorie | Mécanisme retenu | Nouvelle collection/champ |
|---|---|---|
| Prix produit à l'instant T d'une commande | Dénormalisation dans `order.items[]` (déjà en place) | — |
| Historique de prix (analyse) | `priceHistory[]` sur `menuItems` | Amendement §22.2 |
| Recette | Historique implicite via `stockMovements` | — |
| Permissions par rôle | Versioning explicite en base | `roleDefinitions` (nouveau, §22.4) |
| Plans SaaS | Version figée à la souscription | `subscriptionPlans.version`, `subscriptions.planVersion`, `planMigrations` (§22.5) |
| Configuration tenant | Horodatage + audit | — |
| Feature flags de rollout | Délégué à un outil dédié au-delà de 12 flags | — |
| API publique | SemVer au niveau du préfixe majeur | — |
