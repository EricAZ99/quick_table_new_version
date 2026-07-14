# QuickTable — Dossier d'Architecture

**Statut** : Conception (pré-développement) — Revue d'architecture complète effectuée
**Auteur** : Architecture Team
**Dernière revue majeure** : 2026-07-11 (Architecture Review Board, doc 19)
**Vision produit** : QuickTable doit devenir un SaaS commercial de gestion de restaurants comparable à Toast POS, Square for Restaurants, GloriaFood ou Lightspeed Restaurant (doc 33) — capable de supporter plusieurs milliers, voire plusieurs centaines de milliers, de restaurants (tenants) sans refonte majeure de l'architecture (doc 18).

Ce dossier constitue la référence d'architecture du projet. Il doit être lu **avant** toute ligne de code. Aucun code applicatif n'est produit dans ce dossier — uniquement de la conception.

## Comment lire ce dossier selon votre rôle

- **Développeur qui rejoint l'équipe** : 37 (audit CTO, l'état réel du projet au démarrage) → 19 (revue critique, pour comprendre le "pourquoi" derrière chaque choix) → 01 → 02 → 06 → 08 → 28 (DDD) → 30 (Engineering Handbook).
- **Développeur qui commence une feature** : 34 (backlog, trouver sa User Story) → 04 (module concerné) → 05 (collections) → 21 (state machine si applicable) → 20 (Domain Events) → 09 (endpoints) → 10 (si temps réel) → 16 (checklist) → maquette correspondante dans `docs/design/`.
- **Développeur/designer qui travaille sur l'UI** : section "Design & Maquettes" ci-dessous **avant** toute nouvelle maquette — ne jamais repartir de zéro.
- **Tech Lead / Architecte** : 37 (audit CTO) puis 19 (toutes les décisions et leurs alternatives), puis les documents thématiques (20-31) qui en découlent.
- **Product Owner** : 01 (analyse du cahier des charges), 32 (MVP/V1/V2/V3), 33 (comparaison marché), 15/34 (roadmap et backlog), et la section "Points à valider avec le Product Owner" du rapport de revue (99).

## Sommaire

### Fondations (conception initiale)

| # | Document | Contenu |
|---|----------|---------|
| 01 | [Analyse du cahier des charges](./01-analyse-cahier-des-charges.md) | Forces, faiblesses, manques, risques, complexités, recommandations |
| 02 | [Architecture générale](./02-architecture-generale.md) | Vue globale, frontend, backend, DB, temps réel, multi-tenant + diagrammes Mermaid |
| 03 | [Arborescence du projet](./03-arborescence-projet.md) | Structure de dossiers Frontend & Backend, expliquée dossier par dossier |
| 04 | [Découpage en modules](./04-modules.md) | Modules métier, responsabilités, dépendances (mis à jour : couplage événementiel, doc 19 §19.9) |
| 05 | [Base de données MongoDB](./05-database-mongodb.md) | Collections, champs, index, relations, validations, ERD, transactions, sharding readiness |
| 06 | [Multi-tenant](./06-multi-tenant.md) | Isolation des données, tenantId, middleware, sécurité, performance |
| 07 | [Authentification](./07-authentification.md) | JWT, Refresh Token, sessions, 2FA, reset password |
| 08 | [RBAC & Rôles](./08-rbac-roles-permissions.md) | Rôles, permissions, matrice complète |
| 09 | [API REST](./09-api-rest.md) | Tous les endpoints (mis à jour : pagination cursor vs offset, doc 19 §19.10) |
| 10 | [Socket.IO temps réel](./10-socketio-realtime.md) | Namespaces, rooms, événements, scaling |
| 11 | [Architecture Frontend détaillée](./11-frontend-architecture-detail.md) | Conventions Vue 3 / Pinia / composables |
| 12 | [Architecture Backend détaillée](./12-backend-architecture-detail.md) | Conventions Express / couches / DTO |
| 13 | [Sécurité](./13-securite.md) | OWASP, rate limiting, chiffrement, audit, Secrets Management (§13.8bis) |
| 14 | [Qualité de code](./14-qualite-code.md) | Lint, Prettier, Husky, SOLID, conventions (tests → renvoi doc 31) |
| 15 | [Plan de développement](./15-plan-developpement.md) | Phases/Epics, dépendances, livrables, durées — aligné sur doc 32/34 |
| 16 | [Checklist](./16-checklist.md) | Checklist exhaustive cochable |
| 17 | [Standards de documentation](./17-documentation-standards.md) | Documentation à produire et maintenir, ADR |
| 18 | [Bonnes pratiques & scalabilité](./18-bonnes-pratiques-scalabilite.md) | Paliers précis 500/5 000/50 000/500 000 restaurants |

### Revue d'architecture (2026-07-11) — nouveaux documents

| # | Document | Contenu |
|---|----------|---------|
| 19 | [**Revue d'architecture critique**](./19-revue-architecture-critique.md) | **À lire en premier.** Chaque décision structurante réexaminée (Pourquoi / Alternative / Avantages / Inconvénients / Verdict), oublis identifiés |
| 20 | [Architecture Event-Driven & Event Bus](./20-event-driven-architecture.md) | Domain Events, Event Bus interne, pattern Transactional Outbox |
| 21 | [State Machines](./21-state-machines.md) | Order, Payment, Reservation, Subscription, Employee, Restaurant, Table |
| 22 | [Stratégie de versioning](./22-versioning-strategy.md) | Menus/prix, recettes, permissions, plans SaaS, configuration, API |
| 23 | [Politique de Soft Delete](./23-soft-delete-policy.md) | deletedAt/deletedBy/restoredAt/restoredBy, archivage, RGPD |
| 24 | [Audit Technique vs Métier](./24-audit-technique-metier.md) | Séparation, `businessAuditLogs`, catalogue d'actions, rétention |
| 25 | [Observabilité](./25-observabilite.md) | Logging, Metrics, Tracing, Health Checks, Alerting |
| 26 | [Cache Redis](./26-cache-redis.md) | Convention de clés, TTL, invalidation, anti-patterns |
| 27 | [Recherche](./27-recherche.md) | Text Search, autocomplétion, filtres/tri, pagination cursor |
| 28 | [DDD — Bounded Contexts](./28-ddd-bounded-contexts.md) | Aggregates, Entities, Value Objects, Repositories, Factories, Domain Services |
| 29 | [Performance & SLO](./29-performance-slo.md) | Temps de réponse API, chargement front, temps réel, MongoDB, disponibilité |
| 30 | [Engineering Handbook](./30-engineering-handbook.md) | Conventions Git/TS/Vue/Express/MongoDB/Socket.IO, DoR, DoD, checklist PR |
| 31 | [Architecture des tests](./31-architecture-tests.md) | Pyramide complète, y compris Socket.IO et sécurité dédiés |
| 32 | [MVP / V1 / V1.5 / V2 / V3](./32-mvp-versions.md) | Définition précise de chaque version, critères de sortie |
| 33 | [Comparaison marché](./33-comparaison-marche.md) | Toast, Square, Lightspeed, GloriaFood, Loyverse — écarts et différenciateurs |
| 34 | [Backlog Epics/Features/Stories](./34-backlog-epics-features.md) | Découpage en tâches ≤1 jour pour le MVP, Feature/Story pour V1-V3 |
| 35 | [Internationalisation & multi-devise](./35-internationalisation-multidevise.md) | Géolocalisation, i18n FR/EN/IT/ES, devise par pays, conversion des plans SaaS |
| 36 | [Architecture de l'information & Parcours utilisateurs](./36-architecture-information-parcours-utilisateurs.md) | Inventaire d'écrans par rôle, parcours critiques, hiérarchie d'information, navigation, cibles d'appareils |
| 37 | [**Audit CTO — Pré-Développement**](./37-audit-pre-developpement-cto.md) | **À lire avant le premier commit.** Revue critique de l'ensemble du dossier par un CTO entrant, constats, checklist GO/NO-GO, autorisation de démarrage |
| 99 | [Rapport de revue d'architecture](./99-rapport-revue-architecture.md) | Synthèse : documents créés/modifiés, décisions, risques, points à valider avec le PO |

### Design & Maquettes (`docs/design/`)

**Existent déjà et sont finalisés** — à consulter systématiquement avant de développer un écran, ne jamais redemander ou refaire ce travail (gap identifié et corrigé au doc 37, constat F8/F9) :

| Document | Contenu |
|---|---|
| [`docs/design/00-design-system.html`](../design/00-design-system.html) | Design System complet : tokens (couleur, typographie, espacement), composants de base, thèmes clair/sombre. Palette Encre/Porcelaine/Ambre confirmée comme identité de marque officielle. |
| `docs/design/01-authentification.html` à `12-platform-admin.html` | 12 écrans haute-fidélité couvrant les 6 interfaces (doc 36 §36.2) : Auth, Dashboard, Serveur, Cuisine (KDS), Caisse, Client QR Code, Menu & Tables, Employés & Réservations, Stock & Clients, Statistiques & Paramètres, Abonnement & Audit, Platform Admin. |
| [`docs/design/AUDIT-UX.md`](../design/AUDIT-UX.md) | Audit UX auto-critique déjà mené sur l'ensemble des maquettes (parcours, accessibilité, cohérence visuelle) — corrections déjà appliquées. |

### Autres documents racine du projet

| Document | Contenu |
|---|---|
| [`RESUME-SESSION.md`](../../RESUME-SESSION.md) | Résumé exhaustif de toute la conception et du design réalisés — point d'entrée narratif complémentaire à ce dossier. |
| [`CHECKLIST-DEVELOPPEMENT.md`](../../CHECKLIST-DEVELOPPEMENT.md) | Checklist de développement complète, séquentielle, du Epic 0 à l'Epic 12, organisée en lots livrables — à utiliser au quotidien pendant le développement. |

### Architecture Decision Records

| ADR | Décision |
|---|---|
| [0001](./adr/0001-mongodb-comme-base-de-donnees.md) | MongoDB comme base de données primaire |
| [0002](./adr/0002-express-comme-framework-backend.md) | Express.js comme framework backend |
| [0003](./adr/0003-modular-monolith.md) | Modular Monolith plutôt que Microservices |
| [0004](./adr/0004-socketio-temps-reel.md) | Socket.IO pour le temps réel |
| [0005](./adr/0005-firebase-storage.md) | Firebase Storage pour le stockage de fichiers |
| [0006](./adr/0006-railway-hebergement-backend.md) | Railway pour l'hébergement backend |
| [0007](./adr/0007-vercel-hebergement-frontend.md) | Vercel pour l'hébergement frontend |
| [0008](./adr/0008-tenantid-strategie-isolation.md) | `tenantId` partagé (mode Pool) comme stratégie d'isolation |
| [0009](./adr/0009-redis-cache-et-pubsub.md) | Redis comme cache, pub/sub et broker de queue |
| [0010](./adr/0010-jwt-authentification-stateless.md) | JWT stateless + Refresh Token rotatif |
| [0011](./adr/0011-fedapay-agregateur-mobile-money.md) | FedaPay comme agrégateur Mobile Money pour le marché béninois |
| [0012](./adr/0012-docker-compose-developpement-local.md) | Docker Compose (MongoDB + Redis locaux) pour l'environnement de développement individuel |

## Décisions d'architecture structurantes (résumé, détail complet doc 19 + `adr/`)

1. **Modular Monolith avant Microservices** (ADR 0003), avec communication inter-module majoritairement **événementielle** (doc 20) plutôt que par appel direct — trajectoire d'extraction mécanique documentée (doc 18 §18.6).
2. **Multi-tenant en mode "Pool"** (ADR 0008), `tenantId` à trois lignes de défense (doc 06 §6.4), trajectoire vers Bridge/Silo pour les gros comptes.
3. **Event-Driven avec pattern Transactional Outbox** (doc 20) : les modules publient des faits du passé (Domain Events), fiabilisés par une collection `eventOutbox` transactionnelle plutôt qu'un simple `EventEmitter` en mémoire.
4. **Toute entité à cycle de vie est une State Machine documentée** (doc 21), avec opérations atomiques ciblées plutôt qu'un verrouillage document-entier sur `orders` (doc 19 §19.4, amendement issu de la revue).
5. **Aucune donnée de paiement sensible stockée** ; tokenisation systématique via prestataire tiers (doc 13).
6. **API versionnée dès le premier jour** (`/api/v1`), avec deux modes de pagination selon le volume (offset vs cursor, doc 19 §19.10, doc 27 §27.5).
7. **Observabilité, cache et recherche gouvernés par une politique centrale unique** (doc 25, 26, 27) — plus d'improvisation dispersée entre documents.
8. **Audit métier et technique strictement séparés** (doc 24) — le technique ne transite jamais par MongoDB.
9. **Feature gating par plan d'abonnement intégré au RBAC** (doc 08 §8.6), avec versioning explicite des permissions et des plans (doc 22).
10. **Roadmap alignée sur une définition produit précise** MVP → V1 → V1.5 → V2 → V3 (doc 32), issue d'une comparaison concurrentielle documentée (doc 33).

## Journal des révisions

| Date | Révision | Portée |
|---|---|---|
| 2026-07-11 | v1.0 — Conception initiale | Documents 00-18 |
| 2026-07-11 | v2.0 — Revue d'architecture complète | Documents 19-34, dossier `adr/`, rapport 99 ; mises à jour de 04, 05, 09, 13, 14, 15, 18 |
| 2026-07-13 | v2.1 — Cadrage Product Owner | Nouveau doc 35 (i18n/géolocalisation/multi-devise) ; split bill, pourboires et annulation post-cuisine remontés au MVP ; paiement Stripe/Mobile Money scindé en UI-seule (MVP) + intégration réelle (V1) ; Nodemailer + Brevo retenus pour l'email ; grille tarifaire entièrement pilotée par dashboard avec conversion de devise automatique. Mises à jour de 04, 05, 09, 21, 32, 33, 34 |
| 2026-07-13 | v2.2 — Architecture de l'information | Nouveau doc 36 (inventaire d'écrans, parcours utilisateurs, hiérarchie d'information, navigation par rôle, cibles d'appareils) — comble le manque d'UX/IA identifié après la v2.1, sert de brief pour le design visuel à venir |
| 2026-07-13 | v2.3 — Backlog intégral à granularité tâche | Doc 34 étendu : les Epics 6 à 12 (V1/V1.5/V2/V3), auparavant à niveau Feature seulement, sont désormais découpés en tâches ≤1 jour, organisées par module (doc 04) ; Epic 11 corrigé (split bill/pourboires retirés, déjà remontés au MVP) |
| 2026-07-13 | v2.4 — Derniers points ouverts tranchés avec le Product Owner | FedaPay retenu comme agrégateur Mobile Money béninois (doc adr/0011, doc 34 §34.7, doc 32 §32.3) ; rétention des `businessAuditLogs` différenciée par catégorie — 10 ans pour les actions comptables/fiscales (art. 23 AUDCIF/OHADA), 3 ans pour le reste, permanente pour le RGPD (doc 24 §24.4) ; identité de marque Encre/Porcelaine/Ambre confirmée comme identité officielle (doc 00 design system) ; outillage V1.5 retenu à budget serré — Infisical pour les secrets (doc 13 §13.8bis), Grafana Cloud + Sentry pour l'observabilité (doc 25 §25.1bis). Plus aucun point bloquant avant le démarrage du développement de l'Epic 0 |
| 2026-07-13 | v2.5 — Audit CTO pré-développement et corrections | Nouveau doc 37 (audit critique complet avant démarrage du code, checklist GO/NO-GO, autorisation officielle) ; nouvel ADR 0012 (Docker Compose pour le développement local, MongoDB/Redis locaux distincts d'Atlas/Redis cloud réservés à staging/prod) ; section "Design & Maquettes" ajoutée pour référencer `docs/design/` (Design System, 12 maquettes, audit UX) et les fichiers racine (`RESUME-SESSION.md`, `CHECKLIST-DEVELOPPEMENT.md`), auparavant invisibles depuis ce point d'entrée ; renommage `auditLogs` → `businessAuditLogs` propagé dans 05, 13, 16, 22, 23 (la politique de rétention contradictoire du doc 13 §13.7 est corrigée pour renvoyer à doc 24) ; nouveau §8.8 (doc 08) spécifiant le mécanisme RBAC de filtrage par propriétaire ("les siennes") ; doc 36 §36.7 corrigé (identité de marque et maquettes ne sont plus des points ouverts) |

Toute révision future de ce dossier doit ajouter une ligne à ce journal, indiquant la date et la portée — ce dossier est **la source de vérité vivante** de l'architecture (doc 00 §"Comment lire ce dossier" ci-dessus), pas un artefact figé au lancement du projet.

## Décisions Product Owner actées le 2026-07-13

1. Domaine : `quicktable.io`.
2. Comptes d'infrastructure (MongoDB Atlas, Firebase, Vercel, Railway) facturés personnellement par le Product Owner.
3. Prestataires de paiement retenus : **Stripe et Mobile Money**, mais intégration réelle différée à la V1 — le MVP livre l'UI et le flux de paiement complets (split bill, pourboires) avec enregistrement manuel côté caissier (doc 34 §34.7).
4. Email : **Nodemailer**, relayé par **Brevo** (plan gratuit, 300 emails/jour — tranché le 2026-07-13, trigger de bascule vers Amazon SES documenté au palier "5 000 restaurants", doc 04 §4.1).
5. Marché de lancement prioritaire : **Bénin**, avec une portée mondiale dès la conception — interface FR/EN/IT/ES et devise dérivée automatiquement du pays du restaurant, avec détection par géolocalisation ou saisie manuelle à l'inscription (doc 35).
6. Règles métier confirmées dès le MVP : split bill (égal ou par article), pourboires, annulation d'un plat déjà envoyé en cuisine tant qu'il n'est pas encore en préparation (doc 21 §21.1).
7. Grille tarifaire (période d'essai, prix, accès par fonctionnalité) entièrement pilotée depuis le dashboard Super Admin, avec conversion automatique dans la devise du pays du restaurant (doc 35 §35.6).
