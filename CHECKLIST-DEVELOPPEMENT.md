# QuickTable — Checklist de développement complète

**Source** : extrait et reformaté à partir du backlog détaillé (`docs/architecture/34-backlog-epics-features.md`), dans l'ordre d'exécution du projet — Epic 0 (Infrastructure) → Epic 12 (Différenciation V3).

**Lecture du fichier** : chaque **Feature** est un **lot livrable** — un incrément démontrable et testable indépendamment, résumé en une ligne 🎯 _Livrable_. Elle se décompose en tâches ≤ 1 jour-développeur (☐), chacune assignable à une seule personne. Une Feature est "faite" quand toutes ses tâches sont cochées **et** que le livrable décrit peut être démontré tel quel (démo, revue de sprint). Pour le contexte complet (User Stories, critères d'acceptation, docs d'architecture associés), voir le doc 34.

**Repères de charge** (somme indicative des estimations, à ajuster selon l'équipe réelle) :

| Palier            | Epics | Charge indicative                                    |
| ----------------- | ----- | ---------------------------------------------------- |
| MVP               | 0 à 5 | ≈ 84 jours-développeur                               |
| V1                | 6 à 9 | ≈ 56,5 jours-développeur                             |
| V1.5              | 10    | ≈ 16 jours-développeur (+ pentest, hors granularité) |
| V2 _(provisoire)_ | 11    | ≈ 21,5 jours-développeur                             |
| V3 _(provisoire)_ | 12    | non chiffré — dépend des retours V2                  |

---

## Epic 0 — Infrastructure & Fondations `MVP`

### Feature 0.1 — Monorepo & CI/CD

🎯 **Livrable** : chaque push est linté, testé, buildé, puis déployé automatiquement en preview (web) et staging (API).

- [x] Initialiser le monorepo (workspaces `apps/`, `packages/`) — 0,5j
- [x] Configurer ESLint + Prettier + config partagée `packages/config` — 0,5j
- [x] Configurer Husky (pre-commit, commit-msg, pre-push) + lint-staged — 0,5j
- [x] Configurer Commitlint (Conventional Commits) — 0,25j
- [x] Écrire le pipeline CI GitHub Actions (lint + test + build) — 1j
- [x] Configurer déploiement auto Vercel (`apps/web`, preview + prod) — 0,5j
- [ ] Configurer déploiement auto Railway (`apps/api`, staging + prod) — 0,5j

### Feature 0.2 — Infrastructure de données

🎯 **Livrable** : les briques d'infrastructure (base de données, cache, stockage fichiers) sont provisionnées et accessibles depuis le code applicatif.

- [ ] Écrire `docker-compose.yml` (MongoDB replica set + Redis locaux, ADR 0012) — 0,5j — **écrit, non vérifié par exécution** (Docker Desktop non installable sur la machine de développement actuelle : Windows 10 build 19044, exige 22H2/19045+ depuis Docker Desktop 4.50 ; mise à jour Windows bloquée par une stratégie d'entreprise). N'a finalement pas bloqué `config/database.ts` : `.env` local pointe directement sur MongoDB Atlas (déjà vérifié), pas sur le Mongo dockerisé — à revérifier quand même avant qu'un développeur bascule réellement sur `docker compose up`.
- [x] Provisionner MongoDB Atlas (staging/prod) — 0,5j — un seul cluster M0 gratuit, deux bases distinctes (`quicktable` / `quicktable-staging`) plutôt que deux clusters, décision budget-serré cohérente avec Railway (un seul environnement) ; connexion vérifiée réellement sur les deux bases (ping OK, MongoDB 8.0.27)
- [x] Provisionner Redis managé (staging/prod) — 0,25j — Upstash (ADR 0009), instance gratuite unique partagée staging/prod pour l'instant (même logique que Railway/Atlas) ; connexion vérifiée réellement (PING/PONG, SET/GET) via le protocole Redis standard TLS, pas seulement l'API REST
- [ ] Configurer Firebase Storage + règles d'accès — 0,5j — **bloqué** : Google exige le plan Blaze (carte bancaire) pour activer Cloud Storage, même en usage gratuit ; pas de carte disponible actuellement. `storage.rules` écrit et prêt (deny-all, ADR 0005/doc 04 : accès exclusivement via le SDK Admin backend + URLs signées), non déployé. Pas d'alternative légitime (Firebase imposé par le cahier des charges, contrairement à Railway) — à débloquer dès qu'une carte est disponible, avant le module `uploads` (Epic 3).
- [x] Implémenter `config/env.ts` avec validation Zod fail-fast — 0,5j
- [x] Implémenter `config/database.ts` (connexion Mongoose, pool) — 0,5j

### Feature 0.3 — Socle applicatif

🎯 **Livrable** : un module de référence traverse toutes les couches (repository, erreurs typées, logs, health checks) — le patron à répliquer pour tous les modules métier suivants.

- [x] Implémenter le logger structuré (pino) + middleware `correlationId` — 0,5j
- [x] Implémenter `error-handler.middleware.ts` + classes d'erreurs typées — 1j
- [x] Implémenter `BaseRepository` générique avec `tenantId` obligatoire — 1j
- [x] Implémenter les plugins Mongoose transverses (`tenantScope`, `timestamps`) — 1j
- [ ] Implémenter les health checks `/health/live`, `/health/ready` — 0,5j
- [ ] Créer un module de référence traversant toutes les couches (validation du pattern) — 1j

### Feature 0.4 — Internationalisation, socle

🎯 **Livrable** : le sélecteur de langue FR/EN/IT/ES fonctionne sur un écran de test ; la locale/devise/fuseau d'un pays est résolue automatiquement.

- [ ] Configurer Vue I18n + scaffolding des fichiers `fr.json`/`en.json`/`it.json`/`es.json` — 0,5j
- [ ] Implémenter `i18n.middleware.ts` backend (résolution de locale, catalogue de messages d'erreur) — 1j
- [ ] Modéliser et seeder la collection `countryDefaults` (Bénin, France, Italie, Espagne, USA) — 0,5j
- [ ] Implémenter le service de géolocalisation IP (`GET /restaurants/detect-location`) — 1j

> **Critère de sortie Epic 0** : module "Hello World" déployé en staging, health checks verts, CI bloquante fonctionnelle, sélecteur de langue FR/EN/IT/ES opérationnel.

---

## Epic 1 — Authentification, RBAC & Multi-tenant `MVP`

### Feature 1.1 — Identité (`users`, `memberships`)

🎯 **Livrable** : un compte utilisateur peut être créé et rattaché à un restaurant avec un rôle — données validées et persistées (authentification pas encore branchée).

- [ ] Modéliser et implémenter le schéma `users` — 0,5j
- [ ] Modéliser et implémenter le schéma `memberships` — 0,5j
- [ ] Implémenter `users.repository.ts` / `memberships.repository.ts` — 0,5j
- [ ] Implémenter la validation Zod des DTO `users`/`memberships` — 0,5j

### Feature 1.2 — Authentification

🎯 **Livrable** : un utilisateur peut se connecter, se déconnecter, réinitialiser son mot de passe, activer la 2FA, et gérer ses sessions actives.

- [ ] Implémenter `POST /auth/login` (vérification mot de passe, émission JWT) — 1j
- [ ] Implémenter la rotation de refresh token + `POST /auth/refresh` — 1j
- [ ] Implémenter `POST /auth/logout` + révocation de session — 0,5j
- [ ] Implémenter `POST /auth/forgot-password` + `POST /auth/reset-password` — 1j
- [ ] Implémenter l'envoi d'email (worker, Nodemailer + relais SMTP Brevo) — 1j
- [ ] Configurer SPF/DKIM/DMARC sur `quicktable.io` + compte Brevo — 0,5j
- [ ] Implémenter la 2FA TOTP (enable/confirm/verify/disable) — 1j
- [ ] Implémenter `GET/DELETE /auth/sessions` — 0,5j
- [ ] Tests d'intégration complets du module `auth` — 1j

### Feature 1.3 — Multi-tenant

🎯 **Livrable** : l'isolation des données entre restaurants est garantie et vérifiée par une suite de tests automatisés bloquante en CI.

- [ ] Implémenter `tenant.middleware.ts` (résolution depuis JWT) — 1j
- [x] ~~Implémenter le plugin Mongoose `tenantScope` (garde-fou ORM) — 0,5j~~ doublon avec Feature 0.3 (déjà fait là-bas, le plugin n'a pas de dépendance sur `tenant.middleware.ts`)
- [ ] Implémenter `TenantProvisioningService` (transaction multi-documents) — 1j
- [ ] Écrire la suite de tests d'isolation multi-tenant — infrastructure de test — 1j
- [ ] Écrire les tests d'isolation pour les endpoints Epic 1 — 0,5j

### Feature 1.4 — RBAC

🎯 **Livrable** : chaque action est vérifiée contre les permissions du rôle de l'utilisateur, avec cache Redis pour la performance.

- [ ] Modéliser `roleDefinitions` et seed des rôles système — 0,5j
- [ ] Implémenter `rbac.middleware.ts` (`requirePermission`) — 1j
- [ ] Implémenter la résolution combinée rôle + `permissionsOverrides` — 0,5j
- [ ] Implémenter le cache Redis `rbac:resolved:{membershipId}` — 0,5j
- [ ] Écrire les tests de la matrice de permissions — 1j

> **Critère de sortie Epic 1** : suites de tests isolation + RBAC vertes et bloquantes en CI.

---

## Epic 2 — Structure du restaurant `MVP`

### Feature 2.1 — Restaurants

🎯 **Livrable** : un restaurant est configurable de bout en bout (identité, horaires, logo), avec devise/langue/fuseau déduits automatiquement du pays.

- [ ] Modéliser/implémenter `restaurants` (CRUD) avec `country`/`locale`/`currency` dérivés — 1j
- [ ] Implémenter la dérivation automatique devise/langue/fuseau depuis `countryDefaults` — 0,5j
- [ ] Écran d'inscription : saisie manuelle du pays ou confirmation de la détection automatique — 1j
- [ ] Écran back-office : création/édition restaurant (horaires, logo, coordonnées) — 1j

### Feature 2.2 — Employés

🎯 **Livrable** : le gérant invite, gère et retire des employés, dans la limite du quota de son plan.

- [ ] Implémenter `POST/GET/PATCH/DELETE /employees` — 1j
- [ ] Implémenter la limite `maxEmployees` du plan (`409`) — 0,5j
- [ ] Implémenter le flux d'invitation employé (email + activation) — 1j
- [ ] Écran back-office : liste et gestion des employés — 1j

### Feature 2.3 — Salles & Tables

🎯 **Livrable** : le plan de salle est configuré avec des tables, chacune dotée d'un QR Code fonctionnel.

- [ ] Implémenter `rooms` CRUD — 0,5j
- [ ] Implémenter `tables` CRUD + statuts — 1j
- [ ] Implémenter la génération de QR Code (token opaque + image) — 1j
- [ ] Implémenter `POST /tables/:id/qrcode/regenerate` — 0,5j
- [ ] Écran back-office : gestion des salles et tables (vue plan) — 1,5j

> **Critère de sortie Epic 2** : un restaurant peut être entièrement configuré (équipe, salles, tables, QR codes) via le back-office.

---

## Epic 3 — Menu & Stock `MVP`

### Feature 3.1 — Uploads

🎯 **Livrable** : une image peut être uploadée vers Firebase Storage et supprimée à la demande.

- [ ] Implémenter `POST /uploads` (SDK Firebase, validation type/taille) — 1j
- [ ] Implémenter `DELETE /uploads/:fileId` — 0,5j

### Feature 3.2 — Catalogue

🎯 **Livrable** : le menu complet (catégories, plats, photos, disponibilité) est visible et modifiable depuis le back-office.

- [ ] Implémenter `categories` CRUD + ordonnancement — 0,5j
- [ ] Implémenter `menuItems` CRUD (avec `recipe[]`) — 1j
- [ ] Implémenter `PATCH /menu-items/:id/availability` — 0,25j
- [ ] Écran back-office : gestion du menu avec upload photo — 1,5j

### Feature 3.3 — Stock simple

🎯 **Livrable** : le stock d'ingrédients est suivi, avec alerte automatique en cas de rupture imminente.

- [ ] Implémenter `ingredients`/`suppliers` CRUD — 1j
- [ ] Implémenter `POST /stock/movements` (mouvements manuels) — 0,5j
- [ ] Implémenter le Domain Event `StockLevelLow` + alerte — 1j
- [ ] Écran back-office : gestion du stock et seuils — 1j

> **Critère de sortie Epic 3** : un menu complet avec photos et stock associé est configurable et consultable.

---

## Epic 4 — Commandes & Cuisine `MVP` (le plus critique)

### Feature 4.1 — Cycle de vie de la commande

🎯 **Livrable** : une commande peut être créée, envoyée en cuisine, modifiée, transférée et annulée en respectant toutes les règles métier (dont l'annulation post-envoi tant qu'un plat n'est pas encore en préparation).

- [ ] Implémenter `POST /orders` (création, `OrderCreated`) — 0,5j
- [ ] Implémenter `POST/PATCH/DELETE /orders/:id/items` (opérations atomiques ciblées) — 1j
- [ ] Implémenter `POST /orders/:id/send-to-kitchen` + vérification stock synchrone (`pending → queued`) — 1j
- [ ] Implémenter `POST /orders/:id/items/:itemId/cancel` (annulation post-envoi tant que `queued`) + réintégration stock — 1j
- [ ] Implémenter `PATCH /orders/:id/status` + verrouillage optimiste `If-Match` — 1j
- [ ] Implémenter `POST /orders/:id/transfer` — 0,5j
- [ ] Implémenter `POST /orders/:id/cancel` (avec réintégration stock) — 1j
- [ ] Implémenter le décrément automatique de stock (couplage synchrone) — 1j
- [ ] Tests unitaires de la machine à état `Order`/`OrderItem` (toutes transitions + interdictions) — 1j

### Feature 4.2 — Cuisine (KDS)

🎯 **Livrable** : les cuisiniers voient les tickets arriver en temps réel et font progresser chaque plat sur un écran dédié.

- [ ] Implémenter `GET /kitchen/tickets` (agrégation, tri) — 1j
- [ ] Implémenter `PATCH /kitchen/tickets/:orderId/items/:itemId/status` — 0,5j
- [ ] Écran Kitchen Display System (layout dédié) — 1,5j

### Feature 4.3 — Temps réel

🎯 **Livrable** : toute mise à jour (commande, table) est propagée instantanément à tous les postes concernés, avec resynchronisation automatique après une coupure réseau.

- [ ] Implémenter le Socket Gateway (auth handshake) — 1j
- [ ] Configurer l'adaptateur Redis Socket.IO — 0,5j
- [ ] Implémenter la gestion des rooms par tenant/rôle — 1j
- [ ] Implémenter les événements `order:*`, `table:*` — 1j
- [ ] Implémenter le mécanisme de resynchronisation client (`client:resync`) — 1j
- [ ] Intégrer Socket.IO côté frontend (`services/socket/`) — 1j
- [ ] Tests Socket.IO, y compris test multi-instance — 1j

### Feature 4.4 — Validation de charge

🎯 **Livrable** : le système encaisse un pic de charge simulé ("rush du samedi soir") en respectant les cibles de performance du doc 29.

- [ ] Écrire le scénario k6 "Rush du samedi soir" — 1j
- [ ] Exécuter et documenter les résultats vs cibles de performance — 0,5j

> **Critère de sortie Epic 4** : parcours complet commande → cuisine → service validé en E2E et sous charge.

---

## Epic 5 — Paiement `MVP`

_Rescopé au cadrage PO du 2026-07-13 : Stripe + Mobile Money retenus, mais UI/flux seuls en MVP (confirmation manuelle) ; intégration API réelle en V1 (Feature 5.2). Split bill et pourboires confirmés dès le MVP._

### Feature 5.1 — Encaissement, split bill, pourboires

🎯 **Livrable** : un service complet peut être encaissé de bout en bout — espèces, carte/Mobile Money (confirmation manuelle), addition partagée entre convives, pourboire tracé, remboursement possible. **→ Fin du MVP.**

- [ ] Définir l'interface `PaymentProviderAdapter` + implémentation `ManualProviderAdapter` — 1j
- [ ] Implémenter `POST /payments` avec `Idempotency-Key`, support `splitCount`/`coveredItemIds` — 1,5j
- [ ] Implémenter l'incrément atomique `orders.amountPaid` + transition `served → partially_paid → paid` — 1j
- [ ] Implémenter la gestion des pourboires (`tipAmount`, `tipRecipientId`) — 0,5j
- [ ] Implémenter `POST /payments/:id/refund` — 1j
- [ ] Implémenter la génération de reçu (worker asynchrone), avec détail du split — 1j
- [ ] Écran caisse : sélection du mode de paiement, saisie split égal/par article, saisie pourboire — 2j
- [ ] Tests d'intégration paiement (nominal, split égal, split par article, montant excédentaire) — 1j
- [ ] Tests unitaires de la machine à état `Order` avec `partially_paid` — 0,5j

### Feature 5.2 — Intégration réelle des prestataires de paiement `V1`

🎯 **Livrable** : les paiements carte et Mobile Money sont réellement débités via Stripe et l'agrégateur retenu, sans changement d'API côté frontend.

- [ ] Sélectionner le compte Stripe (mode production) — 0,5j
- [ ] Implémenter `StripeAdapter` (tokenisation) — 1,5j
- [ ] Implémenter `MobileMoneyAdapter` pour le marché béninois via FedaPay (doc adr/0011) — 2j
- [ ] Basculer `POST /payments` du provider `manual` vers `stripe`/`mobile_money` selon `method` — 0,5j
- [ ] Revue de sécurité dédiée paiement (aucune donnée de carte ne transite par le backend) — 0,5j
- [ ] Tests d'intégration avec sandbox Stripe + sandbox Mobile Money — 1j

---

## Epic 6 — Réservations & Clients `V1`

### Feature 6.1 — Module `reservations`

🎯 **Livrable** : une réservation peut être prise, confirmée avec assignation de table, annulée ou marquée no-show, sans jamais permettre de double-booking.

- [ ] Modéliser le schéma `reservations` — 0,5j
- [ ] Implémenter le Domain Service `ReservationConflictDetector` — 1j
- [ ] Implémenter `POST/GET/PATCH /reservations` — 1j
- [ ] Implémenter `PATCH /reservations/:id/confirm` (assignation table) — 0,5j
- [ ] Implémenter `POST /reservations/:id/cancel` — 0,5j
- [ ] Implémenter `PATCH /reservations/:id/no-show` — 0,25j
- [ ] Implémenter le cron `reservation-reminder.cron.ts` — 1j
- [ ] Publier les Domain Events `ReservationCreated`/`Cancelled`/`NoShow` — 0,5j
- [ ] Tests de la state machine `Reservation` — 0,5j
- [ ] Écran back-office Réservations — vue du jour + tiroir de conflit — 1,5j

### Feature 6.2 — Module `customers`

🎯 **Livrable** : un client est identifié, son historique de commandes/réservations consultable, et ses points de fidélité s'accumulent automatiquement.

- [ ] Modéliser le schéma `customers` — 0,5j
- [ ] Implémenter `POST/GET/PATCH /customers` — 1j
- [ ] Implémenter `GET /customers/:id/history` (agrégation commandes + réservations) — 1j
- [ ] Implémenter l'incrément de `loyaltyPoints`/`totalSpent`/`visitsCount` sur `PaymentCompleted` — 1j
- [ ] Écran back-office Clients — liste + fiche détail avec ligne sélectionnée — 1,5j

> **Critère de sortie Epic 6** : un client peut être identifié, son historique consulté, et une réservation créée sans conflit possible.

---

## Epic 7 — Expérience Client QR `V1`

### Feature 7.1 — Namespace public (module `qrcode`)

🎯 **Livrable** : le menu et les actions client (appeler serveur, demander l'addition) sont accessibles publiquement via un QR Code, sans exposer aucune donnée du back-office.

- [ ] Implémenter `publicTenant.middleware.ts` (résolution via `qrCodeToken`) — 1j
- [ ] Implémenter le rate limiting dédié aux routes publiques — 0,5j
- [ ] Implémenter `GET /public/qr/:token/menu` + cache Redis `menu:public:{tenantId}` — 1j
- [ ] Implémenter `POST /public/qr/:token/call-waiter` — 0,5j
- [ ] Implémenter `POST /public/qr/:token/request-bill` — 0,5j
- [ ] Gérer les erreurs `410 QR_CODE_REVOKED` / `423 TABLE_OUT_OF_SERVICE` — 0,5j

### Feature 7.2 — Commande client directe (si activée)

🎯 **Livrable** : un client peut, si le restaurant l'autorise, commander et suivre sa commande directement depuis son téléphone.

- [ ] Implémenter le paramètre `restaurants.settings.allowCustomerOrdering` — 0,25j
- [ ] Implémenter `POST /public/qr/:token/orders` — 1j
- [ ] Implémenter `GET /public/qr/:token/orders/:orderId` (suivi) — 0,5j

### Feature 7.3 — Avis (`reviews`)

🎯 **Livrable** : un client laisse un avis après son passage, modéré avant publication.

- [ ] Modéliser le schéma `reviews` — 0,5j
- [ ] Implémenter `POST /public/qr/:token/reviews` — 0,5j
- [ ] Implémenter la modération back-office (`isPublished` toggle) — 0,5j

### Feature 7.4 — Front client

🎯 **Livrable** : l'application client (accueil, menu, suivi, avis, réservation) est utilisable de bout en bout, dans sa langue, sur mobile.

- [ ] Implémenter `CustomerLayout.vue` + code-splitting dédié — 1j
- [ ] Écran Accueil après scan — 1j
- [ ] Écran Menu — filtres allergènes, actions flottantes sémantiques — 1,5j
- [ ] Écran Suivi de commande — 1j
- [ ] Écran Avis (notation accessible en `radiogroup`) — 0,5j
- [ ] Écran Réservation client — 0,5j
- [ ] Sélecteur de langue FR/EN/IT/ES sur l'interface client — 0,5j

> **Critère de sortie Epic 7** : un client scanne un QR Code, consulte le menu dans sa langue, appelle le serveur ou demande l'addition, sans jamais voir le back-office.

---

## Epic 8 — Statistiques, Notifications, Audit `V1`

### Feature 8.1 — Module `statistics`

🎯 **Livrable** : le gérant consulte un dashboard de statistiques (CA, top produits, rentabilité selon le plan) mis à jour en continu.

- [ ] Modéliser `dailyStatistics` — 0,5j
- [ ] Implémenter le worker `statistics.worker.ts` (recalcul incrémental) — 1,5j
- [ ] Implémenter le cron `daily-statistics.cron.ts` (agrégation nocturne) — 1j
- [ ] Implémenter `GET /statistics/dashboard`, `/revenue`, `/top-products`, `/top-waiters` — 1j
- [ ] Implémenter `GET /statistics/profitability` (feature gating Business+) — 1j
- [ ] Implémenter `GET /statistics/trends?granularity=` — 0,5j
- [ ] Écran Statistiques détaillées — graphique + panneau verrouillé par plan — 1,5j

### Feature 8.2 — Module `notifications`

🎯 **Livrable** : chaque utilisateur reçoit les notifications pertinentes à son rôle (stock bas, nouvelle réservation, paiement) et peut gérer ses préférences.

- [ ] Modéliser `notifications` (TTL 90 jours) — 0,5j
- [ ] Implémenter `GET/PATCH /notifications` (+ `read-all`) — 1j
- [ ] Implémenter `GET/PATCH /notifications/preferences` — 0,5j
- [ ] Implémenter le panneau de notifications frontend (composant canonique) — 1j
- [ ] Brancher les handlers Domain Event → notification — 1j

### Feature 8.3 — Module `audit-logs`

🎯 **Livrable** : toute action sensible est tracée et consultable avec le détail avant/après dans un journal d'audit dédié.

- [ ] Modéliser `businessAuditLogs` avec `expiresAt` calculé par catégorie (10 ans finance, 3 ans reste, permanent RGPD, doc 24 §24.4) + index TTL — 0,5j
- [ ] Implémenter le plugin Mongoose `auditable` restreint aux actions sensibles — 1j
- [ ] Implémenter `GET /audit-logs` (filtrable) — 0,5j
- [ ] Écran Journal d'audit — liste + détail avant/après — 1,5j

> **Critère de sortie Epic 8** : le gérant voit ses statistiques, reçoit des notifications pertinentes, et toute action sensible est tracée.

---

## Epic 9 — SaaS : Abonnements, Billing, Plateforme `V1`

### Feature 9.1 — Module `subscriptions` & feature gating

🎯 **Livrable** : un restaurant peut comparer, souscrire et changer de plan ; les fonctionnalités hors plan sont bloquées avec un message d'upgrade clair.

- [ ] Modéliser `subscriptionPlans`/`subscriptions` versionnées — 1j
- [ ] Implémenter le Domain Service `FeatureGateResolver` — 1j
- [ ] Implémenter le middleware de feature gating (`402 PLAN_UPGRADE_REQUIRED`) — 1j
- [ ] Implémenter `GET /subscriptions/plans`, `/subscriptions/me`, `PATCH` upgrade/downgrade — 1j
- [ ] Écran Abonnement & Billing — comparatif de plans — 1,5j

### Feature 9.2 — Module `billing`

🎯 **Livrable** : les factures sont consultables, et un abonnement expiré suspend automatiquement l'accès.

- [ ] Modéliser `invoices` — 0,5j
- [ ] Implémenter `GET /billing/invoices`, `/billing/payment-methods` — 1j
- [ ] Implémenter le cron `subscription-expiry.cron.ts` (suspension automatique) — 1j

### Feature 9.3 — Module `platform-admin`

🎯 **Livrable** : le Super Admin pilote depuis un dashboard dédié tous les restaurants, tous les plans tarifaires, tous les pays, et la conversion de devises, sans intervention manuelle en base.

- [ ] Implémenter `GET/POST/PATCH /platform/restaurants` (provisioning, suspend/reactivate) — 1,5j
- [ ] Implémenter `GET/POST/PATCH /platform/subscription-plans` (CRUD versionné) — 1,5j
- [ ] Implémenter `GET/POST/PATCH /platform/country-defaults` — 1j
- [ ] Implémenter le Currency Conversion Service + cache Redis `fx:rate:*` + cron de rafraîchissement — 1,5j
- [ ] Implémenter `GET /platform/statistics` (cross-tenant) — 1j
- [ ] Écrans Platform Admin — restaurants, plans, pays, statistiques globales — 2j

> **Critère de sortie Epic 9 = fin de la V1 complète** : un restaurant peut s'inscrire, payer et s'auto-gérer sans intervention humaine ; le Super Admin pilote toute la tarification depuis son dashboard.

---

## Epic 10 — Durcissement `V1.5`

### Feature 10.1 — Event-Driven en production

🎯 **Livrable** : les événements métier sont publiés de façon transactionnelle et fiable (outbox), avec garantie de traitement une seule fois.

- [ ] Modéliser la collection `eventOutbox` + `EventBus.publish()` transactionnel — 1j
- [ ] Implémenter le worker `outbox-relay.worker.ts` — 1j
- [ ] Migrer les couplages événementiels simplifiés vers l'Outbox réel — 2j
- [ ] Implémenter l'idempotence des handlers (`processedEvents`) — 1j

### Feature 10.2 — Observabilité

🎯 **Livrable** : l'équipe dispose de métriques, traces et alertes pour diagnostiquer un incident en production sans accès direct à la base.

- [ ] Implémenter les métriques Prometheus `/internal/metrics` — 1j
- [ ] Implémenter le tracing OpenTelemetry (propagation `correlationId`) — 1,5j
- [ ] Implémenter `GET /health/deep` — 0,5j
- [ ] Brancher Grafana Cloud (logs/métriques/traces) et Sentry (erreurs) + configurer les alertes — 1j

### Feature 10.3 — Cache & Recherche

🎯 **Livrable** : les listes volumineuses se chargent par pagination performante, et une recherche texte fonctionne sur le menu et les clients.

- [ ] Généraliser le cache Redis à tous les modules restants — 1j
- [ ] Implémenter la pagination cursor sur `orders`/`payments`/`notifications`/`audit-logs` — 1,5j
- [ ] Implémenter MongoDB Text Search sur `menuItems`/`customers` — 1j

### Feature 10.4 — Conformité & sécurité renforcée

🎯 **Livrable** : un client peut demander l'effacement de ses données personnelles, les secrets sont gérés hors du code, et un pentest externe ne remonte aucune faille critique ouverte.

- [ ] Implémenter `DELETE /customers/:id/personal-data` (export/anonymisation) — 1j
- [ ] Outiller le Secrets Management avec Infisical — 1j
- [ ] Implémenter le multi-site pour le plan Premium — 1,5j
- [ ] Pentest externe + corrections — _hors granularité 1j_

> **Critère de sortie Epic 10 = V1.5** : SLA 99,9 % tenu sur 3 mois, pentest sans faille critique ouverte.

---

## Epic 11 — Parité marché `V2` _(provisoire — contenu à confirmer avec le Product Owner)_

_Correction du 2026-07-13 : split bill et pourboires retirés de cette liste — déjà remontés au MVP (Epic 5)._

### Feature 11.1 — Impression ticket physique (ESC/POS)

🎯 **Livrable** : chaque commande envoyée en cuisine et chaque paiement encaissé déclenchent une impression physique automatique.

- [ ] Étudier le protocole ESC/POS et sélectionner le mode d'intégration — 1j
- [ ] Implémenter le service d'impression cuisine (sur `OrderSentToKitchen`) — 1,5j
- [ ] Implémenter l'impression de reçu caisse (sur `PaymentCompleted`) — 1j
- [ ] Écran Paramètres — configuration imprimante(s) — 1j

### Feature 11.2 — TVA multi-taux & export comptable

🎯 **Livrable** : la comptabilité du restaurant peut exporter ses données avec une TVA correctement ventilée par taux.

- [ ] Étendre `restaurants.taxSettings[]` pour plusieurs taux par catégorie — 1j
- [ ] Implémenter le calcul de taxe par ligne de commande (`PricingService`) — 1j
- [ ] Implémenter l'export comptable (format à définir avec le PO) — 1,5j

### Feature 11.3 — API publique & Webhooks (plan Premium)

🎯 **Livrable** : un intégrateur tiers peut consommer l'API QuickTable avec sa propre clé et recevoir des webhooks en temps réel.

- [ ] Générer la documentation OpenAPI publique depuis les schémas Zod — 1j
- [ ] Implémenter la gestion de clés API (scoping, rate limiting dédié) — 1,5j
- [ ] Implémenter le système de webhooks sortants (signature HMAC, retry) — 2j

### Feature 11.4 — Mode offline / resynchronisation

🎯 **Livrable** : le poste serveur continue de fonctionner sans connexion et se resynchronise automatiquement au retour du réseau.

- [ ] Étudier la stratégie de synchronisation (Service Worker + IndexedDB) — 1j
- [ ] Implémenter la file d'actions en attente (queue locale) — 2j
- [ ] Implémenter la résolution de conflit à la reconnexion — 1,5j

### Feature 11.5 — Fidélité structurée & Promotions

🎯 **Livrable** : le gérant configure des paliers de fidélité et des promotions/coupons appliqués automatiquement en caisse.

- [ ] Modéliser les paliers de fidélité et règles de récompense — 1j
- [ ] Implémenter le moteur de promotions/coupons/happy hours — 2j
- [ ] Écrans back-office correspondants — 1,5j

---

## Epic 12 — Différenciation `V3` _(provisoire — dépend des retours V2)_

- [ ] Menus multi-langue — traduction du contenu métier, modèle de données, interface de traduction (~4-5j)
- [ ] Marketplace d'intégrations — registre d'intégrations tierces au-dessus de l'API publique (~5j+)
- [ ] App mobile native serveur — projet à part entière (React Native/Flutter à évaluer)
- [ ] Silo Enterprise — routage `clusterId` + automatisation du provisioning dédié (~3j)
- [ ] IA prévisionnelle — projet data science à part entière
- [ ] Certification SOC 2 — démarche organisationnelle, hors granularité de développement

---

## Dépendances entre Epics

```
Epic 0 → Epic 1 → Epic 2 → Epic 3 → Epic 4 → Epic 5
                     ↓                  ↓        ↓
                  Epic 6 ──────────→ Epic 7   Epic 8
                     ↓                          ↓
                  Epic 1 ──────────────────→ Epic 9
                                                 ↓
                                             Epic 10
                                                 ↓
                                             Epic 11
                                                 ↓
                                             Epic 12
```

Détail complet et diagramme Mermaid : `docs/architecture/34-backlog-epics-features.md` §34.15.
