# 37. Audit CTO — Pré-Développement

**Auteur** : CTO / Chief Software Architect / Principal Software Engineer (revue d'entrée en fonction)
**Date** : 2026-07-13
**Statut du projet à la date de l'audit** : conception terminée (docs 00-36, `adr/0001-0011`, `docs/design/00-12` + `AUDIT-UX.md`, `RESUME-SESSION.md`, `CHECKLIST-DEVELOPPEMENT.md`), **aucune ligne de code applicatif écrite**.
**Portée de cet audit** : lecture intégrale de l'ensemble des documents listés ci-dessus. Aucun code n'est produit dans ce document.

**Mise à jour du 2026-07-13** : les 4 constats bloquants (F1/F11, F3, F8/F9, F10) ont été corrigés le jour même de l'audit — voir la note dans chaque section concernée et le récapitulatif en fin de §6. Ce document est conservé tel qu'écrit au moment de l'audit (y compris les constats déjà résolus) pour garder une trace fidèle du raisonnement ; il ne doit pas être réécrit a posteriori (même principe que les ADR, doc 17 §17.7 : statut "résolu" plutôt que suppression).

---

## 0. Résumé exécutif

Le travail de conception est **inhabituellement complet** pour un projet qui n'a pas encore ouvert un seul fichier de code : architecture applicative réexaminée par une revue critique (doc 19), 36 documents thématiques cohérents entre eux dans leur immense majorité, 11 ADR, un Design System et 13 maquettes haute-fidélité déjà construites et auditées UX, un backlog détaillé jusqu'à la tâche ≤1 jour pour l'intégralité du produit (MVP → V3). Ce n'est pas le profil habituel d'un projet qui échoue faute de préparation.

Cela dit, un audit d'entrée en fonction n'a de valeur que s'il ne se contente pas de valider ce qui a déjà été validé deux fois. Cette lecture ligne à ligne fait remonter **15 constats concrets**, dont **aucun ne remet en cause un choix d'architecture fondamental**, mais dont **quatre sont bloquants** au sens strict : ils doivent être réglés avant ou pendant l'Epic 0/1, pas après, sous peine de reproduire en code une incohérence déjà présente dans la documentation.

**Verdict** : **GO conditionnel**. Voir §6 pour le détail des conditions et la liste exacte des ajustements requis avant le premier commit.

---

## 1. Méthodologie

Lecture intégrale et séquentielle de :
- `docs/architecture/00-INDEX.md` à `36-architecture-information-parcours-utilisateurs.md` (37 documents numérotés, y compris `99-rapport-revue-architecture.md`)
- `docs/architecture/adr/0001` à `0011`
- Vérification croisée (`grep`) de la propagation des décisions structurantes (renommage de collections, décisions Product Owner, cohérence terminologique) à travers l'ensemble du dossier
- Vérification de l'existence et du référencement de `docs/design/` (Design System + 13 maquettes + audit UX) et des fichiers racine `RESUME-SESSION.md` / `CHECKLIST-DEVELOPPEMENT.md`

Aucune hypothèse n'a été retenue sans vérification texte-à-texte dans le document source correspondant.

---

## 2. Ce qui est solide (constat positif, à ne pas re-litiger)

- **Isolation multi-tenant à trois lignes de défense indépendantes** (doc 06 §6.4) — modèle rigoureux, cohérent avec les standards SaaS B2B (AWS Tenant Isolation), testé nommément en CI bloquante.
- **Toute entité à cycle de vie est une State Machine explicite** (doc 21) — y compris les sous-machines (`orders.items[].status`) avec le correctif `queued` issu du cadrage Product Owner correctement propagé dans le schéma, le catalogue d'événements et les parcours (doc 36 §36.3 Parcours 4).
- **Event-Driven avec pattern Transactional Outbox** correctement borné (doc 20 §20.5 : exceptions synchrones documentées et justifiées, pas un dogme appliqué aveuglément).
- **Sécurité** : couverture OWASP Top 10 mappée point par point (doc 13 §13.1), aucune donnée de paiement sensible stockée, 2FA obligatoire pour les rôles à fort impact, Secrets Management outillé avec un choix concret (Infisical) plutôt qu'un renvoi vague.
- **Revue critique réelle** (doc 19) : les décisions ne sont pas seulement listées mais réexaminées avec alternative, avantages/inconvénients, verdict — y compris des verdicts qui remettent en cause l'implémentation initiale (verrouillage optimiste `orders`, pagination).
- **Design System + 13 maquettes haute-fidélité + audit UX auto-critique déjà mené** (`docs/design/`) — un niveau de maturité produit rarement atteint avant le premier commit.
- **Backlog exploitable immédiatement** : Epic 0 à Epic 9 détaillés à la tâche ≤1 jour, dépendances explicites, checklist de sortie par Epic.
- **Décisions Product Owner réellement intégrées structurellement**, pas seulement notées : le split bill, les pourboires, l'annulation post-cuisine, l'i18n, FedaPay, la politique de rétention d'audit ont chacun modifié un schéma, un endpoint ou une state machine — pas seulement une ligne de texte.

---

## 3. Constats détaillés

### 3.1 Cohérence documentaire — Renommage `auditLogs` → `businessAuditLogs` non propagé

**F1 — Gravité : Élevée — ✅ Corrigé le 2026-07-13** (doc 00-INDEX changelog v2.5)

Le doc 24 (Audit Technique vs Métier) renomme formellement `auditLogs` en `businessAuditLogs`, redéfinit son schéma (ajout `actorRole`, `reason`, `expiresAt`) et sa politique de rétention (différenciée 3 ans / 10 ans / permanente, décidée avec le Product Owner). **Cinq autres documents n'ont jamais été mis à jour en conséquence** :

| Document | Problème concret |
|---|---|
| `05-database-mongodb.md` §5.3 | Conserve la définition complète de l'**ancien** schéma `auditLogs` (sans `actorRole`/`reason`/`expiresAt`) — un développeur qui lit ce document en premier implémente le mauvais schéma. |
| `13-securite.md` §13.7 | Décrit une politique de rétention **à plat, 12 mois**, qui contredit frontalement la politique différenciée du doc 24. Aggravant : doc 13 §13.9 qualifie ce document de "non contournable" en revue de code. |
| `16-checklist.md` | Item "Actions sensibles tracées dans `auditLogs`" — nom de collection obsolète dans une checklist censée être cochée littéralement. |
| `22-versioning-strategy.md` §22.6 | Référence `auditLogs` (nom obsolète) pour la traçabilité de configuration. |
| `23-soft-delete-policy.md` §23.3-23.5 | Trois occurrences de `auditLogs`, y compris dans le diagramme de purge (§23.4). |

**Impact** : risque concret de double définition de collection en base, ou d'implémentation de la politique de rétention la plus ancienne (12 mois flat) au lieu de celle réellement actée avec le Product Owner (rétention comptable 10 ans sur base légale OHADA).

**Solution** : passe de correction dédiée sur les 5 fichiers, faire de doc 24 la référence explicite unique (les autres documents doivent **renvoyer** à doc 24, jamais redéfinir).

**Priorité** : **Bloquant** — coût de correction très faible (recherche/remplacement + une phrase de contexte par fichier), aucune raison de laisser cette dette connue entrer en phase de code.

---

### 3.2 RBAC — mécanisme de filtrage "propriétaire" non spécifié

**F3 — Gravité : Élevée — ✅ Corrigé le 2026-07-13** (nouveau doc 08 §8.8, renvoi ajouté doc 06 §6.4)

La matrice de permissions (doc 08 §8.4) accorde `orders:read` et `orders:update` au rôle `waiter` avec la mention **"✅ (les siennes)"** — c'est-à-dire un filtrage au niveau ligne (ownership), pas seulement au niveau ressource. Or le modèle RBAC documenté dans son intégralité (doc 06, doc 08, doc 12) est un modèle **`resource:action` au niveau collection**, sans aucune dimension de portée par propriétaire décrite nulle part : ni dans `BaseRepository` (doc 06 §6.4, doc 12 §12.2), ni dans le middleware RBAC (doc 08 §8.7), ni dans un Domain Service dédié (doc 28 §28.5).

**Impact** : en l'absence de spécification technique, ce filtrage sera soit oublié (un serveur voit les commandes de tous ses collègues — pas une fuite inter-tenant, mais une fuite intra-tenant non souhaitée), soit réinventé différemment par chaque développeur qui touche au module `orders`.

**Solution** : ajouter une section explicite (doc 08 ou doc 12) décrivant le mécanisme retenu — par exemple une méthode `findScoped(context, { ownedOnly: true })` sur le repository, activée par une métadonnée de permission (`orders:read:own` vs `orders:read:all`), à trancher avant l'implémentation.

**Priorité** : **Bloquant avant l'Epic 4** (module `orders`, cœur du MVP).

---

### 3.3 Friction opérationnelle sur l'annulation d'article `queued`

**F4 — Gravité : Moyenne**

`POST /orders/:id/items/:itemId/cancel` (doc 09 §9.10) exige la permission `orders:cancel`, accordée par défaut à Owner/Manager uniquement (`🔒` override requis pour `waiter`, doc 08 §8.4). Or la règle métier tout juste actée avec le Product Owner (annuler un plat tant qu'il n'est pas encore en préparation) répond typiquement à un besoin de rapidité en plein service — la personne la mieux placée pour agir dans les secondes qui suivent une erreur de commande est le serveur qui l'a prise, pas nécessairement un manager disponible immédiatement.

**Impact** : la fonctionnalité fraîchement obtenue du Product Owner perd une partie de sa valeur pratique si elle nécessite systématiquement d'appeler un manager.

**Solution** : clarifier avec le Product Owner si `orders:cancel` doit être accordé par défaut au `waiter` **pour ses propres commandes tant que l'article est `queued`** (cohérent avec le filtrage "les siennes" de F3), la restriction manager-only étant réservée aux annulations `sent_to_kitchen`/`served` (déjà le cas, doc 21 §21.1).

**Priorité** : à trancher avant l'Epic 4 (le ticket de développement existe déjà dans le backlog, seule la valeur de la permission par défaut doit être décidée).

---

### 3.4 Gaps dans la spécification API (doc 09)

**F5 — Gravité : Moyenne.** La sous-machine `items[].status` (doc 21 §21.1) prévoit une transition `ready → served` déclenchée par `PATCH /orders/:id/status` "niveau article", mais doc 09 ne définit **aucun endpoint de ce type au niveau article** — seuls existent `PATCH /kitchen/tickets/:orderId/items/:itemId/status` (réservé cuisine, statuts `preparing`/`ready` uniquement) et `PATCH /orders/:id/status` (niveau commande globale). Un développeur ne saura pas quel contrat implémenter pour cette transition.
→ **Solution** : ajouter explicitement l'endpoint manquant à doc 09, ou clarifier que le "service" d'un article individuel reste une information d'affichage sans transition d'état persistée séparément.

**F6 — Gravité : Moyenne.** Le backlog (doc 34, Feature 7.3) promet une "modération back-office (`isPublished` toggle)" pour les avis clients, mais doc 09 ne contient **aucun endpoint de lecture/modération des reviews côté staff** (`GET /reviews`, `PATCH /reviews/:id`) — seul l'endpoint public de soumission existe (§9.20).
→ **Solution** : ajouter une section `9.x Reviews (back-office)` à doc 09 avant l'Epic 7.

**Priorité (F5, F6)** : à corriger avant Epic 4 et Epic 7 respectivement — non bloquant pour Epic 0-3.

---

### 3.5 Planning — la Feature 5.2 (intégration réelle des prestataires de paiement) n'a pas de créneau dans le Gantt

**F2 — Gravité : Moyenne-Élevée**

Le doc 15 (Plan de développement) décrit encore la Phase 5 comme une intégration complète du prestataire de paiement ("Module `payments`, intégration prestataire... aucune donnée de carte stockée, vérifié explicitement avant mise en production"), sans tenir compte du fait que le MVP (doc 32 §32.2, doc 34 §34.7) n'utilise qu'un `ManualProviderAdapter` — l'intégration réelle Stripe/FedaPay (Feature 5.2) est un chantier V1 distinct. **Aucune des Phases 6 à 9 du doc 15 ne mentionne explicitement ce chantier.**

**Impact** : risque concret de "trou" de planning — la V1 pourrait être annoncée prête sans que l'intégration réelle des paiements ait été budgétée dans le calendrier, faute d'avoir été rattachée à une phase précise.

**Solution** : ajouter Feature 5.2 explicitement au Gantt (candidat naturel : début de Phase 9, avant l'ouverture commerciale self-service), aligner doc 15 sur doc 34 §34.7.

**Priorité** : à corriger avant la planification détaillée de la V1 — non bloquant pour le démarrage de l'Epic 0.

---

### 3.6 Fragmentation documentaire — le Design System et les maquettes sont invisibles depuis le point d'entrée

**F8 — Gravité : Élevée — ✅ Corrigé le 2026-07-13** (section "Design & Maquettes" ajoutée à doc 00-INDEX)

`docs/architecture/00-INDEX.md` est explicitement désigné comme le document à lire **avant toute ligne de code**, avec une section "Comment lire ce dossier selon votre rôle". Il **ne mentionne jamais** l'existence de `docs/design/` (Design System + 13 écrans haute-fidélité + `AUDIT-UX.md`), ni de `RESUME-SESSION.md`, ni de `CHECKLIST-DEVELOPPEMENT.md` — vérifié par recherche exhaustive, zéro occurrence.

**Impact** : un nouveau développeur, un designer externe ou un investisseur technique qui suit strictement le protocole de lecture recommandé par le projet lui-même ne découvrira **jamais** qu'un travail de design complet, cohérent et déjà audité existe. Risque concret de redemander ou de refaire ce travail, ou de développer un frontend sans jamais consulter les maquettes qui existent pourtant.

**F9 — Gravité : Moyenne (conséquence directe de F8) — ✅ Corrigé le 2026-07-13** (doc 36 §36.7 réécrit). Le doc 36 §36.7 ("Ce qui reste ouvert — décisions de design visuel") liste encore comme non résolus : *"Identité de marque : logo, palette de couleurs précise, typographie — nécessaire avant toute maquette réelle"* et *"Maquettes haute fidélité — à produire par un designer UI/UX"*. Ces deux points sont **résolus** (identité de marque confirmée, 13 maquettes produites et auditées) mais doc 36 n'a jamais été mis à jour pour le refléter.

**Solution** : ajouter une section "Design & Maquettes" à `00-INDEX.md` pointant vers `docs/design/00-design-system.html` à `12-platform-admin.html` et `AUDIT-UX.md` ; corriger doc 36 §36.7 ; ajouter un renvoi vers `RESUME-SESSION.md`/`CHECKLIST-DEVELOPPEMENT.md`.

**Priorité** : **Bloquant avant le premier commit** — coût de correction de l'ordre de quelques minutes, risque de perte de contexte élevé si ignoré.

---

### 3.7 Absence de stratégie d'environnement de développement local

**F10 — Gravité : Moyenne — ✅ Corrigé le 2026-07-13** (nouvel ADR 0012, propagé aux docs 03, 15, 16, `CHECKLIST-DEVELOPPEMENT.md`)

Aucune occurrence de "Docker", "docker-compose" ou "Dockerfile" dans l'intégralité de `docs/architecture/`. Le doc 15 (Phase 0) mentionne uniquement "MongoDB Atlas provisionné (dev/staging/prod)" et "Redis provisionné" — ce qui, en l'absence de toute mention alternative, laisse entendre que même le développement individuel dépendrait d'un cluster cloud partagé (Atlas "dev" + Redis "dev").

**Impact** :
- Plusieurs développeurs partageant un unique environnement cloud "dev" risquent de se marcher dessus (données de test partagées, migrations concurrentes non isolées).
- Aucune capacité de développement hors-ligne.
- Onboarding plus lent (dépendance à des credentials cloud dès le premier jour plutôt qu'un `docker-compose up` local).

**Solution** : trancher explicitement entre (a) MongoDB + Redis conteneurisés localement via Docker Compose pour le développement individuel, Atlas/Redis cloud réservés à staging/production, ou (b) assumer consciemment un environnement "dev" cloud partagé unique — option défendable pour une équipe de 2-4 personnes, mais qui doit être **un choix documenté**, pas un silence.

**Priorité** : **Bloquant avant l'Epic 0** — c'est littéralement le tout premier livrable du projet (Feature 0.1/0.2 de la checklist).

---

### 3.8 Incohérence des paliers de scalabilité entre doc 18 et doc 29

**F7 — Gravité : Faible-Moyenne**

Doc 18 §18.2 (Bonnes pratiques & scalabilité) utilise la grille **500 / 5 000 / 50 000 / 500 000** restaurants. Doc 29 §29.7 (Budget de performance) utilise une grille différente : **100 / 1 000 / 10 000 / 50 000+** restaurants. Aucune table de correspondance entre les deux.

**Impact** : confusion lors d'une décision de scaling réelle ("on est à quel palier, celui du doc 18 ou celui du doc 29 ?"), risque de déclencher une brique d'infrastructure au mauvais seuil.

**Solution** : harmoniser sur une seule grille (recommandation : conserver celle du doc 18, plus détaillée sur les leviers techniques, et réaligner doc 29 §29.7 dessus).

**Priorité** : peut attendre l'Epic 10 (V1.5) — coût de correction faible, à ne pas oublier.

---

### 3.9 Autres constats mineurs (non bloquants)

| # | Constat | Gravité | Priorité |
|---|---|---|---|
| F12 | Le Runbook opérationnel (doc 17 §17.6) n'a qu'un sommaire — son contenu réel (procédure de rollback de migration, étapes d'incident) n'existe pas encore. | Moyenne | Avant V1.5 (Epic 10) |
| F13 | Le module `settings` (doc 04 §4.4) est très sous-spécifié comparé aux autres modules (un seul endpoint générique). | Faible | Au cadrage de sa phase |
| F14 | Aucune suite de test formelle (doc 31) ne couvre le comportement de dégradation en cas de panne Redis totale ; le choix fail-open vs fail-closed du rate limiting en cas de panne Redis n'est documenté nulle part. | Moyenne | Avant V1.5 (Epic 10) |
| F15 | Cas limite non traité : recalcul des statistiques déjà agrégées si `restaurants.timezone` change après coup. | Faible | Si le cas se présente |

---

## 4. Vérification transversale (par thème demandé)

| Thème | Statut | Note |
|---|---|---|
| Architecture générale | ✅ Solide | Modular Monolith réexaminé et confirmé (doc 19 §19.2), trajectoire d'extraction claire (doc 18 §18.6) |
| Design System | ✅ Solide | Tokens, thèmes clair/sombre, palette confirmée officielle — non référencé depuis l'index (F8) |
| UX | ✅ Solide | Audit UX auto-critique déjà mené (`AUDIT-UX.md`), corrections appliquées — non référencé depuis l'index (F8) |
| UI | ✅ Solide | 13 écrans haute-fidélité couvrant les 6 interfaces (doc 36 §36.2) |
| Roadmap | ⚠️ Réserves | Complète et priorisée (doc 32/34), mais gap de planning calendaire sur Feature 5.2 (F2) |
| API REST | ⚠️ Réserves | Très complète (9.1-9.20), deux gaps ponctuels (F5, F6) |
| MongoDB | ✅ Solide | Modélisation rigoureuse (transactions, TTL, sharding readiness) ; divergence de schéma `businessAuditLogs` corrigée (F1) |
| Socket.IO | ✅ Solide | Rooms, auth au handshake, resynchronisation, tests multi-instance spécifiés |
| Firebase | ✅ Solide | Couplage isolé au seul module `uploads` (ADR 0005), risque d'egress identifié et mitigé |
| Redis | ⚠️ Réserves | Convention de clés centralisée et rigoureuse (doc 26), mais comportement de panne non testé (F14) |
| Docker | ✅ Solide | Stratégie de dev local tranchée et documentée (F10, ADR 0012) — Docker Compose local, Atlas/Redis cloud réservés à staging/prod |
| CI/CD | ✅ Solide | Pipeline, environnements, migrations hors boot, tout spécifié (doc 02 §2.7, doc 12 §12.7) |
| RBAC | ⚠️ Réserves | Matrice complète et feature-gating bien pensé ; mécanisme d'ownership désormais spécifié (F3, doc 08 §8.8) ; permission d'annulation d'article encore à clarifier avec le Product Owner (F4) |
| Billing (SaaS) | ✅ Solide | Versioning des plans, prix figé à la souscription, conversion de devise avec cache (doc 22, doc 35) |
| Abonnements | ✅ Solide | State machine complète, cron de suspension automatique |
| QR Code | ✅ Solide | Namespace public isolé, rate limiting dédié, token opaque régénérable |
| Stock | ✅ Solide | Décrément synchrone justifié (doc 20 §20.5), append-only pour l'historique |
| Cuisine (KDS) | ⚠️ Réserves | Bien conçu, mais gap d'endpoint sur le "service" d'un article individuel (F5) |
| Dashboard | ✅ Solide | Statistiques précalculées (CQRS-lite), pas de calcul lourd synchrone |
| Notifications | ✅ Solide | Domain Events → notifications bien cartographiés (doc 20 §20.4) |
| Paiements | ⚠️ Réserves | Architecture d'adaptateur exemplaire (`PaymentProviderAdapter`), mais planning V1 à combler (F2) |
| Statistiques | ✅ Solide | Modèle de projection en lecture seule, jamais de calcul synchrone en heure de pointe |

---

## 5. Checklist GO / NO-GO

### ✅ Prêt
- Architecture générale, choix techniques et leur justification (docs 01-02, 19, ADR 0001-0010)
- Modèle multi-tenant et ses trois lignes de défense (doc 06)
- State machines de toutes les entités à cycle de vie (doc 21)
- Event-Driven / Outbox (doc 20), simplifié en MVP par choix assumé et documenté
- Sécurité (doc 13), à l'exception de F1/F11
- RBAC — structure et matrice (doc 08), à l'exception de F3/F4
- API REST (doc 09), à l'exception de F5/F6
- Design System, maquettes, audit UX (`docs/design/`)
- Backlog exploitable à la tâche (`34-backlog-epics-features.md`, `CHECKLIST-DEVELOPPEMENT.md`)
- Décisions Product Owner intégrées structurellement (paiement, email, marché, i18n, tarification, FedaPay, rétention, marque, observabilité)

### ⚠️ Pas encore prêt (mais correction rapide)
- Cohérence documentaire audit logs (F1, F11) — 5 fichiers
- Cross-référencement design ↔ architecture (F8, F9) — 2 fichiers
- Mécanisme RBAC ownership (F3) — 1 section à rédiger
- Permission d'annulation d'article (F4) — décision à confirmer avec le Product Owner
- Stratégie d'environnement de développement local (F10) — 1 décision à trancher

### 🔴 Bloquant (à régler avant/pendant Epic 0-1, pas après) — ✅ les 4 points ont été corrigés le 2026-07-13
1. **F10** — stratégie de dev local (bloque le tout premier livrable, Epic 0) — ✅ Corrigé (ADR 0012)
2. **F8/F9** — cross-référencement `00-INDEX.md` ↔ `docs/design/` (risque de perte du travail de design déjà produit) — ✅ Corrigé
3. **F1/F11** — cohérence du renommage `auditLogs` → `businessAuditLogs` (dette documentaire connue, coût de correction minime, à ne pas reporter) — ✅ Corrigé
4. **F3** — mécanisme RBAC d'ownership, à spécifier avant que l'Epic 4 (module `orders`) ne soit codé — ✅ Corrigé (doc 08 §8.8)

### Peut attendre (sans bloquer le démarrage)
F2 (avant planification V1), F4 (décision produit, avant Epic 4), F5/F6 (avant Epic 4/7), F7 (avant Epic 10), F12/F14 (avant Epic 10), F13/F15 (au fil de l'eau)

---

## 6. Décision officielle du CTO

**Le développement est autorisé à démarrer.**

Cette conception ne présente aucun défaut d'architecture fondamental qui justifierait un refus : les choix structurants ont été pris, réexaminés une fois par une revue critique dédiée, et tiennent la route à la lecture intégrale. Les 15 constats de cet audit sont, à une exception près (F3, un gap de spécification RBAC réel — désormais comblé), des problèmes de **cohérence documentaire** ou de **planning**, pas des problèmes de **conception**. C'est le profil d'un projet prêt à coder, pas d'un projet à renvoyer en conception.

**Mise à jour du 2026-07-13 — conditions levées** : les 4 conditions ci-dessous ont été traitées le jour même de l'audit, avant tout premier commit de code applicatif :

1. ✅ Stratégie d'environnement de développement local tranchée et documentée (F10) — ADR 0012 : Docker Compose local pour MongoDB/Redis, Atlas/Redis cloud réservés à staging/production. Propagé aux docs 03, 15, 16 et à `CHECKLIST-DEVELOPPEMENT.md`.
2. ✅ Section "Design & Maquettes" ajoutée à `00-INDEX.md`, référençant `docs/design/` et les fichiers racine (`RESUME-SESSION.md`, `CHECKLIST-DEVELOPPEMENT.md`) ; doc 36 §36.7 corrigé (F8/F9).
3. ✅ Renommage `auditLogs` → `businessAuditLogs` propagé dans les 5 fichiers concernés (05, 13, 16, 17, 22, 23) ; `13-securite.md` §13.7 ne contredit plus doc 24 sur la politique de rétention (F1/F11).
4. ✅ Nouveau doc 08 §8.8 spécifiant le mécanisme RBAC de filtrage "ownership" (portée `own`/`all` résolue par le middleware, appliquée au niveau repository) ; renvoi ajouté doc 06 §6.4 (F3).

**Plus aucun point bloquant.** Les autres constats (F2, F4, F5, F6, F7, F12, F13, F14, F15) n'empêchent pas de commencer l'Epic 0 aujourd'hui — ils restent replanifiés à leur Epic respectif dans le §5 ci-dessus, avec la même exigence : ne pas laisser une incohérence connue devenir une décision arbitraire prise en silence dans le code (doc 30 §30.12, principe déjà posé par ce dossier lui-même). En particulier, F4 (permission par défaut d'annulation d'un article `queued` pour le rôle `waiter`) reste une décision produit à trancher avec le Product Owner avant l'Epic 4, distincte du mécanisme technique F3 qui, lui, est désormais prêt à l'accueillir quel que soit l'arbitrage.

**Prochaine étape** : démarrer l'Epic 0 — Feature 0.1 (Monorepo & CI/CD) de `CHECKLIST-DEVELOPPEMENT.md`.
