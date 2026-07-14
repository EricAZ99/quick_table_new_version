# 3. Découpage du projet — Arborescence complète

## 3.1 Organisation générale (monorepo)

```
quicktable/
├── apps/
│   ├── web/                 # Frontend back-office + interface client (Vue 3)
│   └── api/                 # Backend Express (API REST + Socket.IO + Workers)
├── packages/
│   ├── shared-types/        # Types TypeScript partagés front/back (DTO, enums)
│   └── config/               # Config ESLint/Prettier/TSConfig partagée
├── docs/
│   └── architecture/        # Ce dossier
├── .github/
│   └── workflows/           # CI/CD (lint, test, build, deploy)
├── docker-compose.yml         # MongoDB + Redis locaux pour le développement individuel (ADR 0012)
├── .env.example                # Variables d'environnement, pointe par défaut vers les services Docker Compose locaux
├── package.json              # Workspaces (npm/pnpm)
├── pnpm-workspace.yaml
└── README.md
```

Un monorepo (pnpm workspaces ou Turborepo) permet de partager les types entre front et back (contrat d'API garanti à la compilation) et de garder une seule pipeline CI cohérente, sans coupler les déploiements (Vercel ne build que `apps/web`, Railway ne build que `apps/api`).

**Environnement de développement local** (ADR 0012) : `docker-compose.yml` fournit MongoDB (replica set à un seul nœud, pour valider localement les transactions multi-documents, doc 05 §5.8) et Redis, utilisés par chaque développeur individuellement — MongoDB Atlas et Redis managé (doc 02 §2.7) restent réservés à `staging`/`production`, jamais utilisés comme environnement "dev" partagé entre développeurs.

---

## 3.2 Frontend — `apps/web/src/`

```
src/
├── main.ts                   # Bootstrap de l'application Vue
├── App.vue                   # Composant racine
├── env.d.ts                  # Typage des variables d'environnement Vite
│
├── assets/                   # Assets statiques (images, polices, styles globaux)
│   ├── styles/
│   │   ├── tailwind.css
│   │   └── variables.css
│   ├── images/
│   └── fonts/
│
├── router/                    # Vue Router
│   ├── index.ts                # Instanciation du router
│   ├── guards/                 # Navigation guards (auth, rbac, tenant, subscription)
│   │   ├── auth.guard.ts
│   │   ├── rbac.guard.ts
│   │   └── subscription.guard.ts
│   └── modules/                 # Routes déclarées par module métier
│       ├── auth.routes.ts
│       ├── orders.routes.ts
│       ├── kitchen.routes.ts
│       └── ...
│
├── layouts/                    # Layouts globaux
│   ├── AdminLayout.vue          # Layout back-office (sidebar, topbar)
│   ├── KitchenLayout.vue        # Layout plein écran cuisine (KDS)
│   ├── AuthLayout.vue           # Layout écrans de connexion
│   └── CustomerLayout.vue       # Layout interface client QR Code
│
├── pages/                      # Vues associées aux routes (1 page = 1 route)
│   ├── auth/
│   │   ├── LoginPage.vue
│   │   ├── ForgotPasswordPage.vue
│   │   └── TwoFactorPage.vue
│   ├── dashboard/
│   │   └── DashboardPage.vue
│   ├── restaurants/
│   ├── employees/
│   ├── rooms/
│   ├── tables/
│   ├── menus/
│   ├── stock/
│   ├── orders/
│   ├── kitchen/
│   │   └── KitchenDisplayPage.vue
│   ├── payments/
│   ├── reservations/
│   ├── customers/
│   ├── statistics/
│   ├── subscriptions/
│   ├── settings/
│   └── customer-app/            # Pages publiques post-scan QR Code
│       ├── MenuPage.vue
│       ├── OrderTrackingPage.vue
│       └── ReviewPage.vue
│
├── components/                 # Composants réutilisables
│   ├── ui/                      # Design system (Button, Modal, Input, Table, Badge...)
│   ├── common/                  # Composants transverses (SearchBar, EmptyState, Pagination)
│   └── modules/                 # Composants spécifiques à un module métier
│       ├── orders/
│       │   ├── OrderCard.vue
│       │   ├── OrderStatusBadge.vue
│       │   └── OrderForm.vue
│       ├── kitchen/
│       │   └── KitchenTicket.vue
│       └── tables/
│           └── TableGridCell.vue
│
├── stores/                     # Pinia — un store par domaine métier
│   ├── auth.store.ts
│   ├── tenant.store.ts          # Restaurant courant, plan, permissions résolues
│   ├── orders.store.ts
│   ├── kitchen.store.ts
│   ├── tables.store.ts
│   ├── menu.store.ts
│   ├── stock.store.ts
│   ├── notifications.store.ts
│   └── ui.store.ts              # État UI global (sidebar ouverte, thème, etc.)
│
├── services/                    # Couche d'accès aux données (jamais appelée hors stores/composables)
│   ├── api/                      # Clients REST par module
│   │   ├── http.ts                 # Instance Axios + intercepteurs (token, refresh, erreurs)
│   │   ├── auth.api.ts
│   │   ├── orders.api.ts
│   │   ├── kitchen.api.ts
│   │   └── ...
│   └── socket/
│       ├── socket-client.ts       # Connexion/reconnexion Socket.IO
│       └── handlers/               # Écouteurs d'événements par module
│           ├── orders.handlers.ts
│           └── kitchen.handlers.ts
│
├── composables/                  # Logique réutilisable (Composition API)
│   ├── useAuth.ts
│   ├── usePermissions.ts
│   ├── usePagination.ts
│   ├── useDebounce.ts
│   ├── useSocketRoom.ts
│   └── useFormValidation.ts
│
├── directives/                    # Directives Vue custom
│   ├── vPermission.ts               # v-permission="'orders:create'"
│   └── vClickOutside.ts
│
├── plugins/                        # Initialisation de librairies tierces
│   ├── axios.plugin.ts
│   ├── sentry.plugin.ts
│   └── i18n.plugin.ts
│
├── types/                          # Types TypeScript spécifiques au front
│   ├── models/                       # Réexport / extension de shared-types
│   ├── api/                          # Types de requêtes/réponses spécifiques UI
│   └── global.d.ts
│
├── constants/                       # Constantes applicatives
│   ├── permissions.constants.ts
│   ├── order-status.constants.ts
│   └── routes.constants.ts
│
└── utils/                            # Fonctions utilitaires pures
    ├── currency.util.ts
    ├── date.util.ts
    └── validators.util.ts
```

### Explication des dossiers clés

- **`router/guards/`** : chaque garde est une fonction pure testée isolément (auth valide ? tenant actif ? permission suffisante ? plan d'abonnement compatible ?). Elles se composent dans `router/index.ts`, jamais dupliquées dans les composants.
- **`layouts/`** séparés par contexte d'usage : le layout Cuisine (KDS — Kitchen Display System) doit rester lisible à distance sur une tablette murale, donc un layout radicalement différent du back-office.
- **`pages/`** ne contiennent quasiment aucune logique : elles assemblent des `components/modules/*` et lisent/écrivent dans les `stores/`.
- **`components/ui/`** est le design system interne (boutons, inputs, modales, tables) — c'est ici que se joue l'exigence du cahier des charges ("interface jolie, moderne, soft, épurée"). Ce dossier ne connaît rien du métier restaurant.
- **`stores/`** : un store Pinia par domaine, jamais un store géant. Chaque store expose des actions qui appellent `services/api/*`, jamais Axios directement.
- **`services/api/http.ts`** centralise l'intercepteur de refresh token (voir doc 07) : c'est le seul endroit qui sait comment un 401 doit déclencher un rafraîchissement de session.
- **`composables/usePermissions.ts`** est utilisé par la directive `v-permission` et par les guards de route — logique de RBAC frontend écrite une seule fois.
- **`types/`** : les types métier (Order, Table, User...) viennent de `packages/shared-types` pour rester synchronisés avec le backend ; ce dossier ne contient que des types propres à l'UI.

---

## 3.3 Backend — `apps/api/src/`

```
src/
├── server.ts                    # Point d'entrée (bootstrap HTTP + Socket.IO)
├── app.ts                       # Configuration Express (middlewares globaux, routes)
│
├── config/                       # Configuration & bootstrap
│   ├── env.ts                     # Chargement + validation des variables d'env (Zod)
│   ├── database.ts                # Connexion MongoDB (Mongoose)
│   ├── redis.ts                   # Connexion Redis
│   ├── firebase.ts                # SDK Firebase Storage
│   ├── socket.ts                  # Configuration Socket.IO + adaptateur Redis
│   └── constants.ts
│
├── modules/                      # Un dossier par module métier (voir doc 04)
│   ├── auth/
│   │   ├── auth.routes.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── auth.repository.ts
│   │   ├── auth.validators.ts       # Schémas Zod (DTO d'entrée)
│   │   ├── auth.types.ts
│   │   └── auth.socket.ts           # Handlers Socket.IO du module (si applicable)
│   ├── restaurants/
│   ├── users/
│   ├── employees/
│   ├── rooms/
│   ├── tables/
│   ├── menus/
│   ├── categories/
│   ├── stock/
│   ├── orders/
│   ├── kitchen/
│   ├── payments/
│   ├── reservations/
│   ├── customers/
│   ├── qrcode/
│   ├── statistics/
│   ├── subscriptions/
│   ├── billing/
│   ├── notifications/
│   ├── audit-logs/
│   ├── uploads/
│   └── settings/
│   # Chaque module suit strictement la même structure interne (voir doc 12)
│
├── middlewares/                   # Middlewares transverses partagés entre modules
│   ├── auth.middleware.ts           # Vérification JWT
│   ├── tenant.middleware.ts          # Résolution + injection du tenant courant
│   ├── rbac.middleware.ts            # Vérification des permissions
│   ├── validate.middleware.ts        # Application des schémas Zod
│   ├── rate-limit.middleware.ts
│   ├── error-handler.middleware.ts   # Gestionnaire d'erreurs centralisé
│   ├── audit.middleware.ts
│   └── not-found.middleware.ts
│
├── sockets/                        # Gateway Socket.IO transverse
│   ├── socket-gateway.ts             # Handshake, auth, gestion des rooms
│   ├── socket-auth.middleware.ts
│   └── events.registry.ts            # Registre central des noms d'événements
│
├── workers/                         # Processus / handlers de jobs asynchrones (BullMQ)
│   ├── worker.ts                     # Point d'entrée du process worker
│   ├── email.worker.ts
│   ├── statistics.worker.ts
│   ├── stock-alert.worker.ts
│   └── receipt-pdf.worker.ts
│
├── cron/                            # Tâches planifiées
│   ├── subscription-expiry.cron.ts
│   ├── daily-statistics.cron.ts
│   └── session-cleanup.cron.ts
│
├── shared/                           # Code transverse réutilisable entre modules
│   ├── errors/                        # Classes d'erreurs typées (AppError, NotFoundError...)
│   ├── dto/                           # DTO génériques (pagination, filtres)
│   ├── utils/
│   ├── decorators/                    # Décorateurs éventuels (permissions, cache)
│   └── base/                          # BaseRepository, BaseService génériques
│
├── database/
│   ├── models/                        # Schémas Mongoose (voir doc 05)
│   │   ├── plugins/                    # Plugins Mongoose transverses (tenantScope, softDelete, auditable)
│   │   └── index.ts
│   ├── migrations/                     # Migrations versionnées
│   └── seeders/                        # Données de démonstration / plans d'abonnement par défaut
│
├── jobs/                                # Définition des queues BullMQ (pas les workers eux-mêmes)
│   └── queues.ts
│
├── logger/
│   └── logger.ts                        # Logger structuré (pino), corrélation d'ID
│
├── types/                                # Types globaux backend (Express Request augmenté, etc.)
│   └── express.d.ts
│
└── docs/
    └── openapi.ts                         # Génération de la documentation OpenAPI/Swagger
```

### Explication des dossiers clés

- **`modules/`** est le cœur de l'architecture (doc 04 et 12) : chaque module est une unité autonome avec ses routes, controller, service, repository, validators et types. Un module ne doit importer un autre module **que via son `index.ts` public** (jamais un import profond `../../orders/orders.repository`), ce qui prépare une extraction en microservice sans douleur.
- **`middlewares/`** vs **module-specific** : seuls les middlewares réellement transverses (auth, tenant, rbac, validation, rate-limit) vivent ici ; toute logique spécifique à un module reste dans le module.
- **`sockets/`** centralise l'authentification et la gestion des rooms Socket.IO, mais chaque module peut définir ses propres événements (`orders/orders.socket.ts`) enregistrés via `events.registry.ts` pour éviter les collisions de noms d'événements.
- **`workers/` et `cron/`** sont des **process séparés** du serveur API (démarrés indépendamment sur Railway), pour ne jamais bloquer la boucle d'événements Node qui sert le trafic API/WebSocket en rush.
- **`shared/base/BaseRepository`** factorise les opérations CRUD génériques + l'injection systématique du filtre `tenantId` (voir doc 06), pour qu'aucun repository ne puisse "oublier" l'isolation tenant par erreur humaine.
- **`database/models/plugins/tenantScope.ts`** est un plugin Mongoose appliqué à tous les schémas tenant-scoped : il ajoute automatiquement le champ `tenantId`, l'index correspondant, et un hook `pre()` qui refuse toute requête sans `tenantId` dans le contexte (garde-fou au niveau ORM, en plus du middleware Express).
- **`docs/openapi.ts`** : les schémas Zod des `*.validators.ts` sont réutilisés pour générer automatiquement la documentation OpenAPI — un seul endroit de vérité pour la validation ET la documentation (évite la dérive doc/code).
