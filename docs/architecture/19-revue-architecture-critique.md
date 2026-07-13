# 19. Revue d'architecture critique (Architecture Review Board)

**Format** : comité fictif — un Staff Engineer Data/Infra (profil Google/Amazon), un Staff Engineer Payments/Compliance (profil Stripe), un Staff Engineer Platform/SaaS (profil Shopify), un Staff Engineer Frontend/DX (profil Microsoft). Chaque décision structurante des docs 01-18 est réexaminée selon : *Pourquoi ce choix ? Alternative ? Avantages/Inconvénients ? Verdict.*

**Règle du comité** : une décision n'est modifiée que si l'alternative apporte un bénéfice net démontrable, pas par principe de contrarian. Plusieurs décisions initiales sont confirmées explicitement ci-dessous — les confirmer avec leurs contre-arguments a autant de valeur que de les changer, car cela évite qu'un futur développeur les remette en cause sans connaître le débat déjà eu.

---

## 19.1 MongoDB comme base de données unique

**Pourquoi ce choix (doc 02/05)** : flexibilité de schéma pour un domaine encore mouvant (Phase 0-9), alignement naturel avec le modèle multi-tenant "un tenant = un champ", cahier des charges l'imposait déjà.

**Alternative sérieuse** : PostgreSQL avec `tenant_id` + Row-Level Security natif, ou un modèle hybride (Postgres pour le transactionnel/financier, MongoDB pour le catalogue/flexible).

**Avantages de l'alternative** : RLS Postgres est une isolation multi-tenant *appliquée par le moteur*, pas seulement par la discipline applicative (doc 06 §6.4) — élimine une classe entière de bugs d'isolation. Les données financières (paiements, facturation, doc 05 §5.5-5.6) sont naturellement relationnelles et bénéficieraient de contraintes d'intégrité référentielle strictes et de transactions ACID multi-tables sans les limitations des transactions MongoDB.

**Inconvénients de l'alternative** : stack imposée par le cahier des charges (doc 01) — un changement de SGBD n'est pas dans le mandat de ce projet. Un modèle hybride ajoute une complexité opérationnelle (deux bases à sauvegarder, deux pools de connexion, cohérence cross-base) disproportionnée pour la taille d'équipe actuelle.

**Verdict : MongoDB confirmé**, mais avec deux amendements :
1. Les transactions MongoDB multi-documents (disponibles depuis MongoDB 4.0 sur replica set) doivent être **utilisées explicitement** sur toute opération qui touche plusieurs collections de façon atomique (ex. `payment.completed` + `order.status = paid` + `stockMovement` + `dailyStatistics` increment) — précisé au doc 05 §5.8 (nouveau).
2. Si le reporting comptable/financier devient un besoin lourd (Phase 9+, doc 18), la réponse n'est **pas** de migrer la base primaire mais d'alimenter un **entrepôt de données analytique** (ETL périodique MongoDB → BigQuery/Postgres analytique) en lecture seule — ceci est déjà cohérent avec le CQRS-lite du doc 18 §18.5 et évite une réécriture.

## 19.2 Modular Monolith vs Microservices

**Pourquoi ce choix (doc 02 §2.1)** : coût opérationnel des microservices non justifié pour la taille d'équipe (2-4 devs, doc 15), cohérence transactionnelle plus simple en monolithe.

**Alternative** : microservices dès le départ (aligné avec l'ambition "produit comparable à Toast/Square").

**Avantages de l'alternative** : scalabilité indépendante par domaine dès le jour 1, isolation de panne native (`kitchen` down n'affecte pas `billing`), équipes autonomes si l'équipe grossit vite.

**Inconvénients de l'alternative** : complexité de déploiement, observabilité distribuée, cohérence transactionnelle (sagas) à gérer avant même d'avoir un seul client payant — un anti-pattern documenté (voir Martin Fowler, "MonolithFirst") pour une équipe de cette taille. Toast et Square eux-mêmes ont démarré en architecture bien plus monolithique que leur forme actuelle.

**Verdict : Modular Monolith confirmé.** Amendement : la discipline de découplage est renforcée par l'introduction de l'Event Bus (doc 20, nouveau) — les modules `orders`, `stock`, `kitchen`, `notifications`, `statistics` communiquent déjà en grande partie par **événements de domaine** plutôt que par appel direct de service, ce qui rapproche encore l'extraction future d'un simple changement de transport (in-process → message broker) sans toucher à la logique métier. Le doc 04 §4.5 (graphe de dépendances) est mis à jour en conséquence (voir §19.9 ci-dessous).

## 19.3 Modèle d'isolation multi-tenant : Pool (tenantId partagé)

**Pourquoi ce choix (doc 06)** : coût d'infra minimal, standard des SaaS B2B jusqu'à plusieurs milliers de tenants.

**Alternative** : Database-per-tenant (une base MongoDB par restaurant) ou Collection-per-tenant.

**Avantages de l'alternative** : isolation physique totale (zéro risque de fuite inter-tenant par bug applicatif), sauvegarde/restauration par tenant triviale, suppression d'un tenant = suppression d'une base.

**Inconvénients de l'alternative** : à 1000+ tenants, la gestion de milliers de connexions/pools, de milliers de jobs de migration de schéma exécutés en boucle, et de la surveillance associée devient un projet d'ingénierie à part entière (c'est un problème documenté chez tous les SaaS qui l'ont tenté à grande échelle). MongoDB Atlas facture et limite le nombre de bases par cluster, rendant ce modèle coûteux à grande échelle.

**Verdict : Pool confirmé**, avec la trajectoire Bridge/Silo déjà prévue (doc 06 §6.1) comme échappatoire pour les comptes Enterprise à exigence spécifique — c'est exactement le compromis retenu par la majorité des SaaS B2B matures (Shopify, Salesforce sur certains modules). Aucun changement.

## 19.4 `orders.items[]` embarqué + verrouillage optimiste "document entier"

**Pourquoi ce choix (doc 05 §5.5, doc 09 §9.10)** : simplicité de lecture (une commande = un document), cohérence de lecture atomique côté cuisine/serveur.

**Point faible identifié par le comité (nouveau, non vu initialement)** : le verrouillage optimiste basé sur `updatedAt`/header `If-Match` **sur le document entier** génère des conflits artificiels en rush de service : si le serveur ajoute un article pendant que la cuisine change le statut d'un autre article de la même commande, l'un des deux écrit en second et se voit rejeté (`409 ORDER_MODIFIED_CONCURRENTLY`) alors que les deux modifications ne se chevauchent pas réellement (doc 01 §1.6 avait identifié la concurrence comme complexité majeure, mais la solution initiale n'était pas assez fine).

**Alternative retenue par le comité** : remplacer le verrouillage optimiste "document entier" par des **opérations atomiques MongoDB ciblées** :
- Ajout d'article : `updateOne({_id}, { $push: { items: newItem } })`.
- Changement de statut d'un article existant : `updateOne({_id, "items._id": itemId}, { $set: { "items.$.status": newStatus } })` (positional operator), voire `arrayFilters` pour des mises à jour multiples ciblées.
- Le verrouillage optimiste `If-Match` est **conservé uniquement** pour les transitions de statut global de la commande (`orders.status`), qui sont rares et doivent rester strictement séquentielles (doc 21, State Machine Order).

**Avantages** : élimine la quasi-totalité des faux conflits en rush de service, sans sacrifier la cohérence là où elle compte réellement (transition d'état globale).
**Inconvénients** : logique de repository légèrement plus riche (plusieurs méthodes ciblées au lieu d'un `save()` générique) — coût acceptable, absorbé une fois dans `orders.repository.ts`.

**Verdict : amendement adopté.** Documenté formellement dans doc 05 §5.8 (nouveau) et dans la state machine Order (doc 21).

## 19.5 Socket.IO comme unique canal temps réel

**Pourquoi ce choix (doc 10)** : bidirectionnel, reconnexion automatique gérée côté client, écosystème mature, rooms natives adaptées au modèle multi-tenant.

**Alternative** : Server-Sent Events (SSE) pour les flux unidirectionnels (Kitchen Display, Dashboard), ou service managé (Ably, Pusher) en lieu et place d'un Socket.IO auto-hébergé + Redis adapter.

**Avantages des alternatives** : SSE est plus simple (HTTP standard, pas de protocole propriétaire, traverse mieux certains proxies d'entreprise) pour des flux qui n'ont pas réellement besoin de bidirectionnel (le Kitchen Display *reçoit* des tickets, il n'a pas besoin d'émettre sur le même canal — il émet via REST, doc 09). Un service managé (Ably/Pusher) élimine l'opération du Redis adapter et la gestion des sticky sessions (doc 10 §10.6).

**Inconvénients des alternatives** : deux protocoles temps réel (SSE + WS) complexifient le frontend et le gateway pour un gain marginal — le "appel serveur" client (doc 10 §10.4) reste intrinsèquement bidirectionnel côté client public. Un service managé introduit un coût variable par connexion qui grossit linéairement avec le nombre de tenants actifs simultanément (defavorable à l'ambition "plusieurs milliers de restaurants", doc 18) et un vendor lock-in supplémentaire.

**Verdict : Socket.IO auto-hébergé confirmé** comme canal unique (pas de double protocole). Le point de vigilance retenu : documenter explicitement (doc 10, déjà fait §10.7) que Socket.IO ne doit jamais être la seule source de vérité — ce principe reste la meilleure protection contre la complexité d'un canal unique.

## 19.6 JWT stateless + Refresh Token rotatif

**Pourquoi ce choix (doc 07)** : scalabilité horizontale sans session store partagé obligatoire pour les Access Tokens.

**Alternative** : sessions opaques server-side (stockées Redis), consultées à chaque requête.

**Avantages de l'alternative** : révocation instantanée (pas de fenêtre de 15 min où un token révoqué reste valide), pas de risque de payload JWT obsolète.
**Inconvénients de l'alternative** : un aller-retour Redis à chaque requête authentifiée (latence, dépendance dure à Redis pour l'auth — si Redis tombe, plus personne ne peut s'authentifier), perte du principal avantage du JWT.

**Verdict : JWT confirmé**, mais le comité relève un point faible réel : la fenêtre de 15 minutes où un token révoqué (ex. employé licencié sur le champ) reste valide est **inacceptable pour un cas d'usage précis : révocation d'urgence d'un compte**. Amendement : ajouter une **liste de révocation courte durée dans Redis** (`revoked:accessTokenJti:{jti}`, TTL = durée de vie résiduelle du token) consultée uniquement par `auth.middleware.ts` pour les actions à fort impact (licenciement, compromission suspectée) — pas pour chaque requête en usage normal (le `permissionsVersion`, doc 07, gère déjà le cas "changement de permission"). Documenté dans doc 26 (Cache Redis) §26.2.

## 19.7 RBAC statique (matrice rôle → permission) plutôt qu'un moteur de policy (ABAC)

**Pourquoi ce choix (doc 08)** : simple à raisonner, suffisant pour 5 rôles fixes + overrides ponctuels.

**Alternative** : moteur ABAC (Attribute-Based Access Control) type OPA/Casbin, règles déclaratives combinant attributs utilisateur/ressource/contexte.

**Avantages de l'alternative** : nécessaire dès que la feature `custom_roles` (Premium, doc 08 §8.6) doit vraiment permettre à un client de créer un rôle "Sommelier" avec un sous-ensemble précis de permissions sans intervention développeur.
**Inconvénients de l'alternative** : sur-ingénierie pour le MVP — aucun client ne demande de rôle custom avant la Phase 9+.

**Verdict : RBAC statique confirmé pour V1**, mais le modèle de données (`memberships.permissionsOverrides`, doc 05) est déjà conçu comme le socle d'un futur passage à des rôles réellement custom (stockage de permissions en base, pas en dur dans le code) — donc aucun changement de modèle nécessaire, seulement une évolution du moteur de résolution en V2 (voir doc 32, MVP/V1/V2).

## 19.8 Firebase Storage (imposé) et couplage

**Pourquoi ce choix** : imposé par le cahier des charges.

**Point de vigilance du comité** : Firebase Storage est un choix externe au reste de la stack (Google Cloud vs Vercel/Railway/Atlas) — risque de coût d'egress et de couplage si jamais un changement de prestataire de stockage est nécessaire (ex. passage à Cloudflare R2 moins coûteux en egress à grande échelle, doc 18).

**Verdict : confirmé (contrainte du cahier des charges), mitigation déjà en place** : le module `uploads` (doc 04) est le **seul** point de contact avec le SDK Firebase — aucun autre module n'importe directement le SDK. Un changement de prestataire de stockage ne toucherait que `modules/uploads/`. Ce principe est élevé au rang de règle d'architecture explicite (voir ADR 0005).

## 19.9 Conséquence sur le graphe de dépendances (doc 04)

L'introduction de l'Event Bus (doc 20) change la nature de plusieurs dépendances du doc 04 §4.5, sans changer leur existence :

| Dépendance (doc 04) | Nature avant | Nature après revue |
|---|---|---|
| `orders → stock` | Appel direct de service (décrément synchrone) | **Conservé synchrone** — le décrément doit bloquer l'envoi en cuisine si rupture (règle métier, doc 09 §9.10), ne peut pas être asynchrone |
| `stock → notifications` | Appel direct | **Événementiel** (`StockLevelLow` → `notifications` s'abonne) |
| `orders → kitchen` | Appel direct + Socket.IO | **Événementiel** (`OrderSentToKitchen`) — élimine un couplage direct redondant avec l'émission socket |
| `payments → orders` (mise à jour statut) | Appel direct | **Événementiel** (`PaymentCompleted` → `orders` s'abonne et transite l'état) |
| `reservations → notifications` | Appel direct | **Événementiel** |
| `*  → statistics` | Lecture agrégée a posteriori | **Événementiel** (le worker `statistics` s'abonne à `OrderPaid`, `PaymentCompleted` pour mise à jour incrémentale, doc 12 §12.5) |
| `*  → audit-logs` | Plugin Mongoose `auditable` | **Conservé tel quel** (capture au niveau ORM, pas un flux métier) |

Ce tableau remplace/complète le diagramme du doc 04 §4.5 — voir doc 20 §20.4 pour le diagramme mis à jour.

## 19.10 Pagination : incohérence identifiée

**Constat du comité** : le doc 09 §9.1 impose une pagination `page/limit` uniforme sur toute l'API, alors que certains endpoints à fort volume et à écriture concurrente (historique de commandes d'un tenant à gros volume, notifications, résultats de recherche) souffrent du problème classique du "skip élevé" en pagination par offset (MongoDB doit parcourir puis ignorer N documents, coût croissant linéairement) et du risque de doublons/omissions si des documents sont insérés pendant la pagination.

**Verdict : incohérence corrigée.** Le doc 09 est amendé (§19 ci-dessous appliqué directement au doc) pour introduire une **pagination cursor-based** (basée sur `_id`/`createdAt` opaque encodé) comme mode par défaut sur les listes à fort volume ou triées par récence (`orders`, `notifications`, recherche menu), tandis que la pagination `page/limit` reste appropriée pour les listes de configuration bornées (`employees`, `tables`, `categories` — quelques dizaines à centaines d'items, avec besoin réel de "sauter à la page 5"). Détail complet dans le nouveau doc 27 (Recherche).

## 19.11 Oublis identifiés par le comité (à combler dans cette revue)

1. **Aucune machine à état formalisée** au-delà d'`orders` (doc 04) — Paiement, Réservation, Abonnement, Employé, Restaurant avaient des enums de statut (doc 05) mais pas de règles de transition explicites ni de diagramme. → doc 21.
2. **Aucun mécanisme de versioning** pour les entités dont la valeur historique doit être figée (prix d'un menu au moment d'une vieille commande — déjà dénormalisé, doc 05 — mais pas de vraie stratégie de version pour les permissions, plans SaaS, configuration). → doc 22.
3. **Politique de Soft Delete incomplète** : le plugin `softDelete` (doc 12 §12.7) ajoutait `deletedAt` mais pas `deletedBy`/`restoredAt`/`restoredBy`, ni de politique d'archivage/purge définitive homogène. → doc 23.
4. **Audit non distingué entre technique et métier** : `auditLogs` (doc 05/13) mélangeait un usage de conformité métier (qui a remboursé quoi) et un usage de debug technique (quelle requête a échoué) — deux publics, deux besoins de rétention différents. → doc 24.
5. **Observabilité mentionnée mais non spécifiée** (doc 12 §12.8, doc 18 §18.7 évoquaient le sujet sans détailler métriques/health checks/alertes concrets). → doc 25.
6. **Cache Redis mentionné partout (doc 02, 06, 07, 10, 18) mais jamais centralisé** en une politique unique de clés/TTL/invalidation — risque réel de clés Redis incohérentes entre équipes. → doc 26.
7. **Aucune stratégie de recherche** (recherche menu, recherche client, autocomplete) alors que c'est un besoin quotidien évident dès le MVP. → doc 27.
8. **Aucun vocabulaire DDD explicite** (Bounded Context, Aggregate, Value Object) — les modules (doc 04) sont proches d'un découpage DDD instinctif mais jamais formalisé, ce qui aurait aidé à trancher plus vite certaines des questions ci-dessus (ex. §19.4). → doc 28.
9. **Aucun objectif de performance chiffré** (doc 01 §1.3 l'avait pourtant identifié comme faiblesse du cahier des charges initial — jamais comblé depuis). → doc 29.
10. **Aucun guide développeur unifié** (les conventions étaient éclatées entre doc 03, 11, 12, 14). → doc 30 (Engineering Handbook), qui **consolide sans dupliquer** (renvoie vers les docs sources pour le détail architectural, se concentre sur les conventions de travail quotidien).
11. **Stratégie de tests présente (doc 14 §14.6) mais incomplète** sur les tests Socket.IO et les tests de sécurité dédiés. → doc 31, doc 14 réduit à un renvoi.
12. **Aucune définition formelle de "MVP"** malgré un plan de développement en phases (doc 15) — les phases décrivaient un séquencement technique, pas un scope produit vendable. → doc 32.
13. **Aucune comparaison concurrentielle formelle** malgré la demande explicite du client de viser un produit comparable à Toast/Square/Lightspeed (doc 01 le mentionne en risque mais sans grille comparative). → doc 33.
14. **Roadmap en phases larges (2-4 semaines) sans granularité exploitable par une équipe agile** (pas d'epics/features/user stories/tâches). → doc 34 + réécriture doc 15.
15. **Aucun ADR formel** malgré la mention de leur usage (doc 17 §17.3) — zéro ADR n'existait réellement. → dossier `adr/`.
16. **RGPD / droits des personnes concernées non traités** (export de données personnelles, droit à l'oubli d'un client final) — identifié comme gap dans doc 01 mais jamais adressé concrètement. Traité transversalement dans doc 23 (Soft Delete/purge) et ajouté au backlog (doc 34, Epic "Conformité").
17. **Aucun choix de fournisseur email/SMS** explicite (doc 04 mentionne `notifications` sans prestataire) — ajouté comme décision ouverte à valider avec le Product Owner (voir rapport final).

## 19.12 Décisions confirmées sans changement (pour mémoire, non ré-analysées en détail)

- Argon2id pour les mots de passe (doc 07).
- Modèle `users` + `memberships` séparé plutôt qu'un `role` embarqué dans `users` (doc 05) — validé comme la bonne décision multi-tenant/multi-site.
- Montants en centiers entiers, jamais en flottant (doc 05).
- Aucune donnée de carte bancaire stockée (doc 13).
- Index `tenantId` en tête de tous les index composés (doc 05/06).
- Vercel + Railway + Atlas comme cibles de déploiement (imposées par le cahier des charges).
