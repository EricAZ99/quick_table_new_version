# QuickTable

Plateforme SaaS multi-tenant de gestion de restaurants (salles, tables, menus, commandes, cuisine, paiement, stock, clients, réservations, statistiques, QR Code).

**Avant toute contribution, lire [`docs/architecture/00-INDEX.md`](./docs/architecture/00-INDEX.md)** — c'est la référence d'architecture du projet, à jour, source de vérité vivante. En particulier :
- [`docs/architecture/37-audit-pre-developpement-cto.md`](./docs/architecture/37-audit-pre-developpement-cto.md) — état du projet au démarrage du développement.
- [`CHECKLIST-DEVELOPPEMENT.md`](./CHECKLIST-DEVELOPPEMENT.md) — backlog séquentiel, ticket par ticket.
- [`docs/design/`](./docs/design/) — Design System et maquettes haute-fidélité.

## Stack technique

Vue 3 (Composition API, TS) · Node.js / Express (TS) · MongoDB · Socket.IO · Redis · Firebase Storage · Vercel (frontend) · Railway (backend) — voir [`docs/architecture/02-architecture-generale.md`](./docs/architecture/02-architecture-generale.md).

## Structure du monorepo

```
apps/
  web/    — Frontend (Vue 3 SPA, back-office + interface client QR Code)
  api/    — Backend (Express, API REST + Socket.IO + Workers)
packages/
  shared-types/  — Types TypeScript partagés front/back
  config/        — Configuration ESLint/Prettier/TypeScript partagée
```

Détail complet et justification : [`docs/architecture/03-arborescence-projet.md`](./docs/architecture/03-arborescence-projet.md).

## Démarrage

Prérequis : Node.js ≥ 20 (voir `.nvmrc`), [pnpm](https://pnpm.io) ≥ 9, [Docker](https://www.docker.com/) (MongoDB + Redis locaux, [ADR 0012](./docs/architecture/adr/0012-docker-compose-developpement-local.md)).

```bash
pnpm install        # installe les dépendances de tout le workspace
pnpm dev             # démarre apps/web et apps/api en parallèle
pnpm build           # build de production de tout le workspace
pnpm test            # tests unitaires de tout le workspace
pnpm typecheck       # vérification TypeScript de tout le workspace
```

> `docker-compose.yml` (MongoDB + Redis locaux) et l'intégration ESLint/Prettier/Husky arrivent avec les tickets suivants de la Feature 0.1/0.2 (voir `CHECKLIST-DEVELOPPEMENT.md`) — non encore présents à ce stade du projet.

## Conventions

Commits [Conventional Commits](https://www.conventionalcommits.org/), TypeScript strict, un ticket = une fonctionnalité = une Pull Request — voir [`docs/architecture/30-engineering-handbook.md`](./docs/architecture/30-engineering-handbook.md).
