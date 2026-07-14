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

Prérequis : Node.js ≥ 22.13 (voir `.nvmrc` — requis par `pnpm@11`, cf. `packageManager`), [pnpm](https://pnpm.io) ≥ 9, [Docker](https://www.docker.com/) (MongoDB + Redis locaux, [ADR 0012](./docs/architecture/adr/0012-docker-compose-developpement-local.md)).

```bash
cp .env.example .env # variables de connexion locales (ADR 0012)
docker compose up -d # MongoDB (replica set) + Redis locaux
pnpm install        # installe les dépendances de tout le workspace
pnpm dev             # démarre apps/web et apps/api en parallèle
pnpm build           # build de production de tout le workspace
pnpm test            # tests unitaires de tout le workspace
pnpm typecheck       # vérification TypeScript de tout le workspace
pnpm lint            # ESLint sur tout le workspace
pnpm format          # Prettier (écrit) sur tout le dépôt
```

Un hook `pre-commit` (lint-staged), `commit-msg` (Commitlint) et `pre-push` (tests) s'exécutent automatiquement via Husky (installés par `pnpm install`, voir `pnpm prepare`). La CI GitHub Actions (`.github/workflows/ci.yml`) revérifie lint/test/build sur chaque push/PR vers `main`. `apps/web` se déploie automatiquement sur Vercel (preview par branche, production sur `main`), `apps/api` sur Railway (production ; `staging` pas encore configuré).

> **`docker-compose.yml` écrit mais non vérifié par exécution réelle** sur cette machine de développement (Docker Desktop nécessite Windows 10 22H2/build 19045+, cette machine est en 19044 et sa mise à jour est gérée par une stratégie d'entreprise) — voir `CHECKLIST-DEVELOPPEMENT.md`, Feature 0.2, pour le détail. À vérifier avant d'implémenter `config/database.ts`.

## Conventions

Commits [Conventional Commits](https://www.conventionalcommits.org/), TypeScript strict, un ticket = une fonctionnalité = une Pull Request — voir [`docs/architecture/30-engineering-handbook.md`](./docs/architecture/30-engineering-handbook.md).
