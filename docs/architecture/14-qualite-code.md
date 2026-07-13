# 14. Qualité de code

## 14.1 Outillage (mis en place dès la Phase 1, voir doc 15)

| Outil | Rôle |
|---|---|
| **TypeScript strict** (`strict: true`, `noUncheckedIndexedAccess: true`) | Front et back, aucun `any` implicite toléré |
| **ESLint** (config partagée `packages/config`) | Règles communes front/back + règles spécifiques (Vue, imports internes de module, doc 12) |
| **Prettier** | Formatage automatique, non négociable en revue (pas de débat de style en PR) |
| **Husky** | Hooks Git : `pre-commit` (lint-staged), `commit-msg` (Commitlint), `pre-push` (tests unitaires rapides) |
| **lint-staged** | N'exécute lint/format que sur les fichiers modifiés — rapide en local |
| **Commitlint** (Conventional Commits) | `feat:`, `fix:`, `refactor:`, `chore:`, `test:`, `docs:` — permet un changelog généré automatiquement |
| **Vitest** | Tests unitaires front et back (rapide, compatible Vite) |
| **Playwright** | Tests end-to-end (parcours critiques : login, prise de commande, paiement) |
| **Supertest** | Tests d'intégration API (contrôleurs + middlewares) |
| **Husky + CI GitHub Actions** | Aucune PR mergeable sans lint + tests + build verts |

## 14.2 Convention de commit

```
<type>(<scope>): <description courte à l'impératif>

[corps optionnel : pourquoi, pas quoi]

[footer optionnel : BREAKING CHANGE, référence ticket]
```

Exemple : `feat(orders): ajoute la transition de statut vers "servi"`. Le `scope` correspond au nom du module (doc 04), ce qui permet de filtrer l'historique par domaine métier.

## 14.3 Architecture Clean appliquée pragmatiquement

QuickTable applique les **principes** de Clean Architecture (indépendance de la logique métier vis-à-vis du framework et de la base de données, via la séparation Controller/Service/Repository, doc 12) **sans dogmatisme** : pas d'entités/use-cases/interface-adapters à la lettre façon Uncle Bob, ce qui serait une sur-ingénierie pour la taille de l'équipe. Le test décisif à chaque revue : *"si on devait remplacer MongoDB par PostgreSQL, ou Express par Fastify, combien de fichiers hors `repositories/` et `routes/` devrait-on toucher ?"* La réponse attendue est : zéro dans les `services/`.

## 14.4 SOLID appliqué au contexte Node/TS

- **S — Single Responsibility** : un service ne gère qu'un agrégat métier (`OrdersService` ne connaît pas les règles de calcul de stock, il appelle `StockService`, doc 04).
- **O — Open/Closed** : le RBAC (doc 08) et le feature gating par plan sont **des données** (permissions, features), pas des `if (role === ...)` en dur — ajouter un rôle ou un plan ne modifie pas le code du middleware.
- **L — Liskov Substitution** : `BaseRepository<T>` (doc 12 §12.2) doit pouvoir être substitué par n'importe quel repository enfant sans que l'appelant (service) n'ait besoin de connaître la spécificité de la collection.
- **I — Interface Segregation** : les DTO Zod sont spécifiques à chaque action (`CreateOrderDto` ≠ `UpdateOrderStatusDto`), jamais un DTO générique "fourre-tout" avec des champs optionnels ambigus.
- **D — Dependency Inversion** : les services dépendent d'une **interface** de repository (type TypeScript), pas de l'implémentation Mongoose concrète — permet de mocker facilement en test unitaire (doc 14.6).

## 14.5 DRY / KISS — arbitrage assumé

- **DRY appliqué à la logique métier et aux contrats** (schémas Zod partagés, `BaseRepository`, `packages/shared-types`) — c'est là que la duplication coûte cher (bug corrigé à un endroit, pas à l'autre).
- **DRY volontairement PAS appliqué à la duplication accidentelle de structure** (deux modules qui se ressemblent à 80% aujourd'hui mais évolueront différemment, ex. `reservations` et `orders` partagent une notion de "créneau" mais des règles métier distinctes) — trois lignes similaires valent mieux qu'une abstraction prématurée qui devra être défaite dans 2 mois (cohérent avec les principes généraux de l'équipe).
- **KISS** : toute solution technique doit pouvoir s'expliquer en une phrase à un développeur qui rejoint l'équipe (doc 00). Une PR qui introduit un pattern non documenté dans ce dossier d'architecture doit d'abord mettre à jour le dossier ou être rediscutée.

## 14.6 Stratégie de tests

**Déplacé vers le doc 31 (Architecture des tests)** suite à la revue d'architecture (doc 19 §19.11-11), qui centralise désormais la pyramide de tests complète — unitaires, intégration, isolation multi-tenant, RBAC, charge, sécurité, Socket.IO, E2E — avec le détail des seuils de couverture et des suites bloquantes en CI. Ce paragraphe n'en garde que le principe directeur, qui reste vrai ici comme ailleurs : les tests d'isolation multi-tenant et de RBAC sont des **tests de sécurité**, pas de simples tests fonctionnels — leur échec bloque le merge sans exception possible (doc 13 §13.9, doc 31 §31.5).

## 14.7 Documentation du code

- **Pas de commentaire qui répète le code.** Un commentaire n'est écrit que pour une contrainte non-évidente (ex. "le stock est vérifié ici et pas dans `stock.service` pour éviter un aller-retour réseau supplémentaire pendant le rush", doc 04).
- **JSDoc/TSDoc uniquement sur les fonctions publiques exportées d'un module** (`index.ts`), pas sur les fonctions privées internes dont la signature TypeScript suffit à comprendre l'usage.
- **Schémas Zod comme documentation vivante** : ils décrivent exactement les contraintes d'un DTO, réutilisés pour générer OpenAPI (doc 12 §12.2) — pas de documentation d'API entretenue séparément à la main.

## 14.8 Revue de code

- Toute PR doit répondre à trois questions dans sa description : *Quoi* (résumé), *Pourquoi* (lien avec une user story/bug), *Comment tester* (étapes manuelles si pertinent).
- Checklist de revue systématique : isolation tenant respectée ? permission RBAC déclarée sur la route ? erreurs typées utilisées ? tests ajoutés ? impact sur `docs/architecture/` à documenter si décision structurante (ADR, doc 00 §"Décisions d'architecture structurantes") ?
- Taille de PR recommandée : un module ou une sous-fonctionnalité à la fois — une PR qui touche plus de 400 lignes de diff (hors fichiers générés) est découpée sauf exception justifiée.
