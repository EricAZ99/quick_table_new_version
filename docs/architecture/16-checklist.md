# 16. Checklist complète

Checklist organisée par phase (doc 15). Utilisable comme suivi de projet (cocher au fur et à mesure).

## Phase 0 — Fondations & Infrastructure

- [ ] Monorepo initialisé (workspaces `apps/`, `packages/`)
- [ ] CI GitHub Actions : lint + test + build sur chaque PR
- [ ] Déploiement auto `apps/web` → Vercel (preview + prod)
- [ ] Déploiement auto `apps/api` → Railway (staging + prod)
- [ ] MongoDB Atlas provisionné (dev/staging/prod), réplicas configurés
- [ ] Redis provisionné (dev/staging/prod)
- [ ] Firebase Storage configuré + règles d'accès
- [ ] `config/env.ts` avec validation Zod fail-fast
- [ ] ESLint + Prettier + Husky + Commitlint opérationnels
- [ ] Logger structuré (pino) + middleware `correlationId`
- [ ] Squelette de module de référence validé bout en bout

## Phase 1 — Authentification, RBAC & Multi-tenant

- [ ] Collection `users` + `memberships` implémentées (doc 05)
- [ ] Login / logout / refresh token rotatif fonctionnels
- [ ] Reset de mot de passe (email, token à usage unique)
- [ ] 2FA TOTP (activation, confirmation, vérification, codes de récupération)
- [ ] 2FA obligatoire forcée pour `super_admin` et `restaurant_owner`
- [ ] Gestion des sessions actives (liste, révocation)
- [ ] Middleware Tenant Resolver opérationnel
- [ ] Plugin Mongoose `tenantScope` appliqué à tous les schémas tenant-scoped
- [ ] `BaseRepository` avec `tenantId` obligatoire
- [ ] Middleware RBAC + matrice de permissions (doc 08) implémentée
- [ ] Feature gating par plan d'abonnement (squelette, même sans plans réels encore)
- [ ] **Suite de tests d'isolation multi-tenant** verte et intégrée en CI bloquante
- [ ] **Suite de tests de permissions RBAC** verte et intégrée en CI bloquante
- [ ] Provisioning de tenant transactionnel (`TenantProvisioningService`)

## Phase 2 — Structure du restaurant

- [ ] Module `restaurants` (CRUD, horaires, logo, coordonnées, paramètres)
- [ ] Module `employees` (invitation, rôle, poste, salaire, statut)
- [ ] Limite `maxEmployees` du plan appliquée (`409 EMPLOYEE_LIMIT_REACHED`)
- [ ] Module `rooms` (CRUD)
- [ ] Module `tables` (CRUD, statuts, capacité)
- [ ] Génération de QR Code par table (token opaque, régénération)
- [ ] Écrans back-office correspondants + design system de base (`components/ui/`)

## Phase 3 — Menu & Stock

- [ ] Module `uploads` (Firebase Storage, validation type/taille)
- [ ] Module `categories` (CRUD, ordonnancement)
- [ ] Module `menus`/`menuItems` (CRUD, disponibilité, allergènes)
- [ ] Module `stock` : ingrédients, fournisseurs, mouvements manuels
- [ ] Seuils d'alerte configurables par ingrédient
- [ ] Écrans de gestion de menu avec upload photo fonctionnel

## Phase 4 — Commandes & Cuisine

- [ ] Module `orders` : création, ajout/retrait d'article, machine à état complète
- [ ] Verrouillage optimiste sur `orders` (header `If-Match`, doc 09 §9.10)
- [ ] Décrément automatique de stock à l'envoi en cuisine
- [ ] Blocage/alerte si `INSUFFICIENT_STOCK`
- [ ] Module `kitchen` (tickets, tri priorité/heure/serveur/table)
- [ ] Kitchen Display System (layout dédié, lisible à distance)
- [ ] Socket.IO Gateway (auth au handshake, rooms par tenant/rôle)
- [ ] Adaptateur Redis Socket.IO opérationnel (validé en multi-instance)
- [ ] Tous les événements du catalogue (doc 10 §10.4) implémentés et testés
- [ ] Resynchronisation client après coupure réseau (`client:resync`)
- [ ] Test de charge "rush du samedi soir" exécuté avec résultats documentés

## Phase 5 — Paiement

- [ ] Module `payments` (encaissement, méthodes multiples, paiement mixte)
- [ ] Intégration prestataire de paiement (tokenisation, aucune donnée carte stockée)
- [ ] Idempotence sur `POST /payments` (header `Idempotency-Key`)
- [ ] Génération de reçu asynchrone (worker)
- [ ] Remboursement (total/partiel)
- [ ] Revue de sécurité dédiée paiement effectuée et documentée

## Phase 6 — Réservations & Clients

- [ ] Module `reservations` (création, confirmation, annulation, no-show)
- [ ] Détection de conflit de créneau/table
- [ ] Rappels de réservation (cron)
- [ ] Module `customers` (profil, historique, fidélité basique)

## Phase 7 — Expérience Client (QR Code)

- [ ] Namespace public `/public/qr/*` isolé et testé
- [ ] Middleware `publicTenant` (résolution sans JWT)
- [ ] Rate limiting renforcé sur les routes publiques
- [ ] Front client dédié (menu, suivi commande, appel serveur, demande addition)
- [ ] Commande client directe (si activée par les paramètres du restaurant)
- [ ] Module `reviews` avec modération avant publication
- [ ] Bundle JS du front client vérifié comme indépendant du bundle back-office

## Phase 8 — Statistiques, Notifications, Audit

- [ ] Module `statistics` + worker d'agrégation `dailyStatistics`
- [ ] Dashboard temps réel (`dashboard:stats_updated`)
- [ ] Module `notifications` (in-app, préférences, email)
- [ ] Module `audit-logs` en lecture, alimenté automatiquement (plugin `auditable`)
- [ ] Alerting sur patterns suspects (échecs de login, remboursements anormaux)

## Phase 9 — SaaS : Abonnements, Facturation, Plateforme

- [ ] `subscriptionPlans` seedés (Starter/Business/Premium) avec `limits`/`features`
- [ ] Module `subscriptions` (souscription, upgrade/downgrade, annulation)
- [ ] Module `billing` (factures SaaS, moyens de paiement du tenant)
- [ ] Feature gating activé sur **toutes** les routes concernées (doc 08 §8.6)
- [ ] Module `platform-admin` complet (création/suspension/suppression de tenant)
- [ ] Cron `subscription-expiry` opérationnel (suspension automatique)
- [ ] Écrans self-service d'upgrade de plan

## Phase 10 — Durcissement & Lancement

- [ ] Checklist sécurité OWASP (doc 13) revue intégralement
- [ ] Pentest externe réalisé (ou a minima revue de sécurité approfondie interne)
- [ ] Tests de charge multi-tenant simultanés exécutés
- [ ] APM/Observabilité en place (traces, alerting, dashboards)
- [ ] Sauvegardes automatiques testées (restauration réellement exécutée en staging)
- [ ] Documentation utilisateur rédigée (manuel, doc 17)
- [ ] Documentation technique à jour (ce dossier `docs/architecture/`)
- [ ] Plan de réponse à incident documenté et partagé à l'équipe
- [ ] Recette fonctionnelle complète sur environnement de staging
- [ ] Politique de sécurité/disclosure publiée (`security@quicktable.io`)

## Checklist transverse — Sécurité (à vérifier à chaque nouveau module, doc 13)

- [ ] Toutes les routes déclarent une permission RBAC explicite
- [ ] Aucune requête base ne s'exécute sans `tenantId` (vérifié par le plugin + tests)
- [ ] Tous les inputs validés par un schéma Zod
- [ ] Rate limiting appliqué si la route est sensible ou publique
- [ ] Aucune donnée sensible (mot de passe, secret 2FA, données de carte) exposée dans une réponse API
- [ ] Erreurs typées utilisées, pas de fuite de stacktrace au client
- [ ] Actions sensibles tracées dans `auditLogs`

## Checklist transverse — Qualité (à chaque PR, doc 14)

- [ ] Lint et format passent sans erreur
- [ ] Tests unitaires ajoutés/mis à jour pour la logique modifiée
- [ ] Aucune régression sur la suite de tests d'isolation/RBAC
- [ ] Commit conforme à Conventional Commits
- [ ] Documentation d'architecture mise à jour si décision structurante
- [ ] Pas de code mort, pas de `console.log`, pas de `any` non justifié
