# QuickTable — Résumé complet de la session de conception

**Dernière mise à jour** : 2026-07-13 (revue UX incluse)
**Statut du projet** : conception architecturale terminée, revue d'architecture terminée, cadrage produit avec le Product Owner terminé, design UI/UX en cours.
**Aucune ligne de code applicatif n'a encore été écrite** — ce document couvre uniquement la phase de conception (architecture + design).

---

## 1. Cadrage initial

Point de départ : lecture du cahier des charges fourni (`Cahier_des_charges_QuickTable.docx`).

**QuickTable** est un SaaS multi-tenant de gestion de restaurants (établissements, salles, tables, menus, commandes, cuisine, paiements, stock, clients, réservations, statistiques, QR Code), avec un système de rôles et un modèle d'abonnement SaaS (Starter/Business/Premium).

**Stack technique imposée** :
- Frontend : Vue 3 (Composition API), TypeScript, Vite, Pinia, Vue Router, Tailwind CSS
- Backend : Node.js, Express.js, TypeScript
- Base de données : MongoDB
- Stockage : Firebase Storage
- Temps réel : Socket.IO
- Déploiement : Vercel (frontend), Railway (backend), MongoDB Atlas

**Ambition affichée par le Product Owner** : un produit comparable à Toast POS, Square for Restaurants, Lightspeed Restaurant, GloriaFood, Loyverse, Shopify POS — conçu pour scaler à plusieurs milliers, voire centaines de milliers, de restaurants sans refonte.

---

## 2. Architecture logicielle complète — `docs/architecture/` (documents 00 à 18)

Conception initiale complète, produite en tant qu'architecte logiciel senior :

| Doc | Contenu |
|---|---|
| 00 | Index général, décisions structurantes |
| 01 | Analyse du cahier des charges (forces, faiblesses, risques, recommandations) |
| 02 | Architecture générale (diagrammes Mermaid : global, frontend, backend, DB, temps réel, multi-tenant) |
| 03 | Arborescence complète du projet (Frontend Vue 3 + Backend Express) |
| 04 | Découpage en ~20 modules métier (Auth, Restaurant, Orders, Kitchen, Payments, Stock, Reservations, Statistics, Subscriptions, etc.) |
| 05 | Base de données MongoDB complète (collections, champs, index, relations, ERD) |
| 06 | Gestion multi-tenant (isolation par `tenantId`, 3 lignes de défense) |
| 07 | Authentification (JWT, Refresh Token, RBAC, 2FA, reset password) |
| 08 | Système RBAC complet (rôles, permissions, matrice) |
| 09 | API REST complète (tous les endpoints) |
| 10 | Architecture Socket.IO (namespaces, rooms, événements, scaling) |
| 11 | Architecture Frontend détaillée (conventions Vue 3) |
| 12 | Architecture Backend détaillée (conventions Express, couches) |
| 13 | Sécurité (OWASP, rate limiting, chiffrement, CSRF/XSS/injection) |
| 14 | Qualité de code (ESLint, Prettier, Husky, SOLID, DRY, KISS) |
| 15 | Plan de développement (phases) |
| 16 | Checklist complète cochable |
| 17 | Standards de documentation |
| 18 | Bonnes pratiques & scalabilité (trajectoire vers plusieurs milliers de restaurants) |

---

## 3. Revue d'architecture critique — documents 19 à 36 + ADR + rapport

Une revue complète a été menée en simulant un comité d'architecture (Staff Engineers Data/Infra, Payments/Compliance, Platform/SaaS, Frontend/DX), remettant en question chaque décision plutôt que de la confirmer par défaut.

| Doc | Contenu |
|---|---|
| 19 | **Revue critique** — chaque décision structurante réexaminée (Pourquoi / Alternative / Avantages / Inconvénients / Verdict) |
| 20 | Architecture Event-Driven & Event Bus interne (pattern Transactional Outbox) |
| 21 | State Machines de toutes les entités à cycle de vie (Order, Payment, Reservation, Subscription, Employee, Restaurant, Table) |
| 22 | Stratégie de versioning (menus/prix, permissions, plans SaaS, API) |
| 23 | Politique globale de Soft Delete (deletedAt/deletedBy/restoredAt, RGPD) |
| 24 | Séparation Audit Technique vs Audit Métier |
| 25 | Observabilité (Logging, Metrics, Tracing, Health Checks, Alerting) |
| 26 | Stratégie Cache Redis complète (convention de clés, TTL, invalidation) |
| 27 | Stratégie de recherche (Text Search, autocomplétion, pagination cursor) |
| 28 | Domain-Driven Design — Bounded Contexts, Aggregates, Value Objects |
| 29 | Objectifs de performance & SLO chiffrés |
| 30 | Engineering Handbook (conventions Git/TS/Vue/Express, DoR, DoD) |
| 31 | Architecture des tests complète (unitaires, intégration, E2E, charge, sécurité, Socket.IO) |
| 32 | Définition précise MVP / V1 / V1.5 / V2 / V3 |
| 33 | Comparaison marché (Toast, Square, Lightspeed, GloriaFood, Loyverse) |
| 34 | Backlog détaillé — Epics/Features/User Stories/tâches ≤1 jour |
| 35 | Internationalisation, géolocalisation & multi-devise |
| 36 | Architecture de l'information & Parcours utilisateurs (inventaire d'écrans, flux critiques) |
| 99 | Rapport de synthèse de la revue (documents créés/modifiés, risques, points PO) |
| `adr/0001` à `0010` | 10 Architecture Decision Records formels |

### Corrections concrètes issues de la revue

- Verrouillage optimiste des commandes trop grossier → remplacé par des opérations atomiques MongoDB ciblées.
- Incohérence de pagination (offset partout) → deux modes (offset pour listes de config, cursor pour listes à fort volume).
- Ajout d'une liste de révocation JWT d'urgence dans Redis.
- Séparation stricte audit métier (MongoDB) / audit technique (hors MongoDB).

---

## 4. Décisions Product Owner actées (2026-07-13)

| # | Décision | Impact |
|---|---|---|
| 1 | Domaine `quicktable.io` | Configuration CORS, cookies, DNS |
| 2 | Comptes d'infrastructure facturés personnellement par le PO | — |
| 3 | Paiement : **Stripe + Mobile Money**, mais UI/flux complets dès le MVP avec confirmation manuelle ; intégration API réelle différée en V1 | `PaymentProviderAdapter` avec provider `manual` en MVP, `StripeAdapter`/`MobileMoneyAdapter` en V1 (doc 34 §34.7) |
| 4 | Email : **Nodemailer + Brevo** (plan gratuit, 300/jour) | doc 04 §4.1, trigger de bascule vers Amazon SES documenté |
| 5 | Marché prioritaire **Bénin**, mais portée mondiale dès la conception : langues **FR/EN/IT/ES**, devise dérivée automatiquement du pays du restaurant (saisie manuelle ou géolocalisation à l'inscription) | Nouveau **doc 35** ; champs `restaurants.country/locale`, collection `countryDefaults` |
| 6 | Règles métier confirmées dès le MVP : **split bill** (égal/par article), **pourboires**, **annulation d'un plat déjà envoyé en cuisine** tant qu'il n'est pas encore en préparation | Correction de la state machine `OrderItem` (doc 21 §21.1) — ajout de l'état intermédiaire `queued` |
| 7 | Grille tarifaire (essai, prix, accès par fonctionnalité) entièrement pilotée depuis le dashboard Super Admin, avec **conversion automatique de devise** | Currency Conversion Service (doc 35 §35.6), endpoints CRUD `subscriptionPlans` |

Ces décisions ont remonté au **MVP** (doc 32) des éléments initialement prévus en V2/V3 : split bill, pourboires, multi-langue et multi-devise sont désormais des exigences MVP, pas des extensions futures.

---

## 5. Design UI/UX — `docs/design/` (artefacts publiés, liens directs)

Rôle endossé : Head of Product Design / Principal UX Designer / Lead UI Designer. Un système de design complet a été créé (palette Encre/Porcelaine/Ambre + 4 couleurs sémantiques, typographie système, espacement en grille de 4px, iconographie maison, clair/sombre géré par tokens), puis appliqué écran par écran.

| # | Fichier | Artefact publié | Contenu |
|---|---|---|---|
| 00 | `00-design-system.html` | [Voir](https://claude.ai/code/artifact/dd267249-81ff-4b55-9763-c438c14696f9) | Fondations complètes + bibliothèque de composants (boutons, champs, badges de statut, cartes, tableaux, navigation, onglets, modales, notifications, skeleton/vide/erreur) |
| 01 | `01-authentification.html` | [Voir](https://claude.ai/code/artifact/4e49bc25-d6a5-4f42-aa5e-628a457e43c1) | Connexion (desktop/tablette/mobile réels via container queries), mot de passe oublié, réinitialisation, 2FA, choix du restaurant (multi-membership) |
| 02 | `02-dashboard.html` | [Voir](https://claude.ai/code/artifact/2aa4d6ad-1972-422a-bfc1-76df35ca3e95) | App Shell (sidebar + topbar) réutilisé par tous les écrans back-office suivants, KPIs, graphique de CA en SVG, activité temps réel, alertes stock, état de la salle |
| 03 | `03-serveur.html` | [Voir](https://claude.ai/code/artifact/4b5ce341-25f0-4df0-8d1c-683ae6c7a317) | Plan de salle, prise de commande (panier persistant), suivi de commande avec la règle d'annulation post-cuisine rendue visible |
| 04 | `04-cuisine-kds.html` | [Voir](https://claude.ai/code/artifact/1528a082-c839-404b-beb4-37ef79cc3974) | Kitchen Display System — tableau de tickets, thème sombre assumé en permanence (choix produit justifié), minuteurs colorés par seuil |
| 05 | `05-caisse.html` | [Voir](https://claude.ai/code/artifact/c46b493a-5606-4e1b-bca8-a741e6ed3a53) | File d'attente encaissement, paiement unique, split bill (égal/par article) avec pourboire, confirmation & reçu |
| 06 | `06-client-qrcode.html` | [Voir](https://claude.ai/code/artifact/b2228d34-547d-4fdc-ac51-fa41cb231205) | Accueil après scan, menu (photo prioritaire, filtres allergènes, actions flottantes), suivi de commande, avis, réservation |
| 07 | `07-menu-tables.html` | [Voir](https://claude.ai/code/artifact/dcad5c6f-8609-4c64-90b1-35a195158214) | Gestion du menu (désactivation auto liée au stock), plan visuel des salles/tables avec QR code |
| 08 | `08-employes-reservations.html` | [Voir](https://claude.ai/code/artifact/a07bc84e-b044-4853-a335-5f7cb0015091) | Gestion des employés (rôles, invitation, statuts), réservations avec détection de conflit de table |
| 09 | `09-stock-clients.html` | [Voir](https://claude.ai/code/artifact/c94b758c-6ca1-421a-b232-58c92e9264dc) | Stock (ingrédients, seuils, mouvements, fournisseurs, alerte rupture), fiche client (historique, fidélité) |
| 10 | `10-statistiques-parametres.html` | [Voir](https://claude.ai/code/artifact/b0ac33b3-899a-4e16-8292-c63c5b5545d2) | Statistiques détaillées avec feature gating par plan (panneau verrouillé Business), Paramètres (général, langue/devise, notifications) |
| 11 | `11-abonnement-audit.html` | [Voir](https://claude.ai/code/artifact/810147a3-3d36-4fb8-935d-72bef7d39892) | Abonnement & Billing (comparatif de plans, factures), Journal d'audit (liste filtrable + détail avant/après) |
| 12 | `12-platform-admin.html` | [Voir](https://claude.ai/code/artifact/96298a43-d133-4220-9b31-7cf7f94f5fbb) | Platform Admin (Super Admin) : liste des restaurants, plans d'abonnement (CRUD), pays de référence (CRUD), statistiques globales cross-tenant |

### Principes de design appliqués systématiquement

- **Palette nommée et délibérée** : Encre (neutre chaud), Porcelaine (fond clair chaud), Ambre (accent unique, actions/marque), Basilic/Curcuma/Paprika/Acier (sémantique — jamais utilisées pour la marque).
- **Typographie** : famille système pour l'UI (excellent support FR/EN/IT/ES), famille mono dédiée aux données chiffrées (prix, horaires) avec `tabular-nums`.
- **Clair/sombre** géré par tokens CSS à trois niveaux (défaut, `prefers-color-scheme`, override explicite du viewer) — jamais un simple inversement de couleurs.
- **Chaque écran pensé pour son appareil réel** (doc 36 §36.6) : back-office desktop/tablette, Serveur/Client mobile portrait, Caisse tablette/desktop paysage, KDS tablette murale paysage exclusivement.
- **États systématiques** : chargement (skeleton), vide, erreur (avec message actionnable, jamais générique), succès — sur chaque groupe d'écrans.
- **Contenu réel, jamais de lorem ipsum** : menu béninois authentique (Poulet Yassa, Attiéké Poisson, Riz au Gras, Poisson Braisé, Jus de Bissap...), noms et villes du Bénin.

---

## 5bis. Audit UX senior (2026-07-13) — `docs/design/AUDIT-UX.md`

Relecture critique des 13 artefacts, quatre axes : accessibilité, cohérence de navigation, optimisation des parcours, cohérence visuelle. Détail complet dans `docs/design/AUDIT-UX.md`. Corrections appliquées et republiées sur les 13 artefacts :

- **Design System (v1.1)** : nouvelle section Accessibilité (règle "jamais de `<div>` interactif", contraste, `aria-live` pour le temps réel), navigation back-office canonique (source unique de vérité), panneau de notifications enfin documenté, correctif de contraste `--turmeric-soft-ink` en sombre, correctif du composant interrupteur (utilisait l'Ambre en violation de sa propre règle — corrigé vers le Basilic).
- **Navigation** : dérive réelle corrigée — les sidebars des écrans 02/07/08/09/10/11 avaient des listes incomplètes ou une entrée orpheline « Paiements » ; toutes alignées sur la spécification canonique du doc 36.
- **Accessibilité appliquée** : boutons flottants et notation du Client QR Code (06), sélecteurs de méthode/pourboire/split de la Caisse (05), et toute la navigation back-office converties de `<div>` en `<button>` sémantiques avec `aria-label`/`aria-pressed`/`role="radiogroup"` selon le cas.
- **Platform Admin (12)** : drapeaux emoji retirés (rendu non fiable selon OS/police) et remplacés par un badge ISO texte ; ligne sélectionnée ajoutée.
- **Cohérence** : état « ligne sélectionnée » ajouté partout où un tiroir édite une ligne existante (09, 12) ; bouton « Renvoyer » de l'écran mot de passe oublié (01) visuellement désactivé pendant le compte à rebours.

## 6. Inventaire du doc 36 §36.2 — couverture design

Tous les écrans identifiés dans l'architecture de l'information (doc 36) sont désormais couverts par au moins une maquette haute-fidélité :

- [x] Stock (ingrédients, fournisseurs, mouvements, seuils)
- [x] Clients (profil, historique, fidélité)
- [x] Statistiques (au-delà du dashboard — rapports détaillés, exports)
- [x] Paramètres (taxes, notifications, intégrations, langue/devise)
- [x] Abonnement & Billing (upgrade de plan, factures SaaS)
- [x] Journal d'audit (consultation, détail avant/après)
- [x] Platform Admin (back-office Super Admin — liste des tenants, gestion des plans, `countryDefaults`, statistiques globales)

**Les 6 interfaces du doc 36 §36.2 sont toutes couvertes** : Back-office Admin/Manager (docs 02, 07, 08, 09, 10, 11), Serveur (doc 03), Kitchen Display System (doc 04), Caisse (doc 05), Client QR Code (doc 06), Platform Admin (doc 12).

## 6bis. Backlog complet à granularité tâche (2026-07-13)

À la demande du Product Owner, le doc 34 (backlog) a été étendu : **tous** les Epics (0 à 12, donc MVP → V1 → V1.5 → V2 → V3) sont désormais découpés en tâches ≤1 jour, organisées par module métier (doc 04) à l'intérieur de chaque Epic. Auparavant, seuls les Epics 0-5 (MVP) avaient ce niveau de détail. Pour les Epics 11-12 (V2/V3), le contenu n'étant pas encore validé avec le Product Owner, les tâches sont explicitement marquées **provisoires**. Au passage, l'Epic 11 a été corrigé : split bill et pourboires y figuraient encore par erreur alors qu'ils ont été remontés au MVP lors du cadrage du 2026-07-13.

## 7. Points encore ouverts (issus du rapport doc 99 et du cadrage PO)

**Tous les points ci-dessous ont été tranchés avec le Product Owner le 2026-07-13 (doc 00-INDEX v2.4). Plus aucun point bloquant avant le démarrage du développement de l'Epic 0.**

- Choix de l'hôte SMTP définitif pour Nodemailer : **tranché → Brevo**.
- Sélection concrète de l'agrégateur Mobile Money pour le Bénin (doc 34 §34.7, Feature 5.2) : **tranché → FedaPay** (doc adr/0011) — couvre MTN MoMo + Moov Money + cartes via une seule intégration ; Kkiapay documenté comme option de repli si les conditions tarifaires FedaPay s'avéraient défavorables au cadrage détaillé de la Feature 5.2 (V1).
- Durées de rétention légales de l'audit métier (doc 24 §24.4) : **tranché → rétention différenciée** — 10 ans pour les actions comptables/fiscales (`payment.*`, `invoice.*`, art. 23 AUDCIF/OHADA, applicable au Bénin), 3 ans pour le reste, permanente pour les actions RGPD. Reste une recommandation d'architecture, pas une validation juridique formelle si des volumes/litiges significatifs survenaient.
- Identité de marque visuelle : **tranché → confirmée**. La palette Encre/Porcelaine/Ambre du Design System (doc 00) est désormais l'identité de marque officielle de QuickTable, pas seulement une proposition de travail.
- Choix d'outil d'observabilité/secrets pour la V1.5 (doc 25 §25.1bis, doc 13 §13.8bis) : **tranché → budget serré** — Infisical (secrets, gratuit/open source) + Grafana Cloud (logs/métriques/traces, plan gratuit) + Sentry (erreurs, plan gratuit). Migration vers Doppler/Datadog réévaluable si le volume dépasse les paliers gratuits.
