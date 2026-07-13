# 18. Bonnes pratiques & scalabilité — viser plusieurs milliers de restaurants sans refonte

## 18.1 Cadrage

L'ambition affichée est de rivaliser à terme avec Toast POS, Square for Restaurants, GloriaFood ou Lightspeed Restaurant. Ces produits opèrent des dizaines à centaines de milliers de tenants. QuickTable n'a pas besoin d'atteindre ce niveau d'infrastructure dès le jour 1 (ce serait de la sur-ingénierie coûteuse et un frein à la vélocité initiale, doc 02 §2.1), mais **chaque décision structurante de ce dossier a été prise pour ne jamais bloquer cette trajectoire** — c'est le sens de la demande explicite du client. Ce document liste les leviers, dans l'ordre où ils deviennent nécessaires.

## 18.2 Trajectoire de montée en charge (paliers précis, mis à jour suite à la revue d'architecture doc 19)

| Palier | Composant sous tension | Microservices ? | Message Broker ? | Kubernetes ? | CDN ? | Object Storage ? |
|---|---|---|---|---|---|---|
| **500 restaurants** | Aucun — instance API unique, MongoDB Atlas tier standard (replica set) suffisent | Non — Modular Monolith (doc 02 §2.1, ADR 0003) | Non — EventEmitter in-process + Outbox (doc 20 §20.3) suffit | Non — Railway (ADR 0006) | Oui, natif via Vercel Edge (doc 02 §2.7) dès le jour 1 | Oui, natif via Firebase Storage (ADR 0005) dès le jour 1 |
| **5 000 restaurants** | MongoDB (working set), Redis (pub/sub + cache combinés) | Non, toujours Modular Monolith | Non, mais Outbox + BullMQ renforcés (files séparées par priorité, doc 12 §12.5) | Non, Railway avec scaling horizontal de l'API (plusieurs instances + adaptateur Redis, doc 10 §10.6) | Inchangé | Inchangé — surveiller le coût d'egress Firebase (doc 19 §19.8) |
| **50 000 restaurants** | MongoDB (contention en écriture sur les collections chaudes `orders`/`payments`), instance Redis unique (pub/sub vs cache) | **Oui, ciblé** : extraction de `orders`/`kitchen` et/ou `notifications` en services séparés (doc 18 §18.6, ADR 0003) — pas une réécriture complète, seulement les modules à profil de charge distinct | **Oui** : passage de BullMQ à un broker dédié (RabbitMQ/Kafka) si le volume d'événements dépasse ce que Redis peut absorber en pub/sub fiable | **À évaluer** : Railway peut atteindre ses limites de contrôle fin (placement, isolation réseau) — trigger de réévaluation explicite (ADR 0006) | CDN renforcé si multi-région (doc 18 §18.9) | Réévaluer Firebase vs Cloudflare R2/S3 pour l'egress (doc 19 §19.8, ADR 0005) |
| **500 000 restaurants** | Cluster MongoDB shardé par `tenantId` haché (doc 05 §5.8, doc 06 §6.6), multi-région complet | **Oui, généralisé** : architecture de services alignée sur les Bounded Contexts (doc 28), équipes dédiées par contexte | **Oui, central** : broker de production (Kafka le plus probable à ce volume d'événements) comme colonne vertébrale de l'Event Bus (doc 20) | **Oui** : orchestration Kubernetes multi-région pour le contrôle fin de placement, d'isolation et de résilience que Railway ne peut plus offrir à ce volume | CDN multi-région avec edge caching agressif du menu public (doc 26 §26.5) | Migration vers un stockage objet multi-région avec réplication géographique |

Le point clé : **aucun de ces paliers ne nécessite de réécrire le domaine métier** (services, RBAC, modèle de données) — seule l'infrastructure d'exécution évolue, précisément parce que les frontières (doc 04 dépendances entre modules, doc 28 Bounded Contexts, `tenantId` en tête d'index, communication par événements plutôt que couplage direct, doc 20) ont été posées dès la conception. Chaque case "Oui" ci-dessus est un **trigger conditionné à un signal de charge mesuré** (doc 25 §25.7 alerting), jamais une anticipation calendaire — activer une brique avant son palier réel est le même anti-pattern que ne pas l'activer à temps (doc 19, principe du comité : pas de changement sans bénéfice net démontrable).

## 18.3 Cache

- **Redis en cache applicatif** dès que la Phase 8 (statistiques) est en production : `dailyStatistics`, permissions résolues (`permissionsVersion`, doc 07), sessions de rate limiting.
- **Cache HTTP** sur les endpoints publics peu volatils (`GET /public/qr/:token/menu`) avec invalidation ciblée à la modification d'un `menuItem` — réduit fortement la charge sur MongoDB pour la route la plus fréquemment appelée du produit (chaque scan client).
- **CDN pour les assets Firebase Storage** (photos de plats, logos) via un cache-control long + invalidation par nom de fichier versionné (jamais de mutation d'un fichier existant, toujours un nouvel upload).

## 18.4 Files d'attente et traitement asynchrone

- Toute opération non requise pour la réponse immédiate à l'utilisateur est déportée en job BullMQ (doc 12 §12.5) : email, PDF, agrégation de stats, notifications push.
- À l'échelle, séparer les workers par **priorité** (queue `critical` pour les notifications temps-sensible type alerte stock en plein service, queue `batch` pour les agrégations nocturnes) pour qu'un pic sur l'une n'affame pas l'autre.
- **Idempotency keys** (doc 09 §9.1) systématisées sur toute opération financière pour supporter les retries de queue sans double effet.

## 18.5 Base de données à grande échelle

- **Read replicas MongoDB Atlas** pour absorber la charge de lecture (dashboards, statistiques, exports) sans contendre avec le trafic transactionnel (commandes, paiements) — bascule via préférence de lecture (`readPreference: secondaryPreferred`) sur les requêtes non critiques en fraîcheur immédiate.
- **Sharding par `tenantId` haché** : rendu mécanique par le choix initial de préfixer tous les index par `tenantId` (doc 05 §5.7, doc 06 §6.6) — activé uniquement quand un cluster replica set atteint ses limites (taille de working set, IOPS), pas par anticipation excessive.
- **Archivage à froid** des données transactionnelles anciennes (commandes/paiements de plus de N mois) vers un stockage moins coûteux (ex. export périodique), avec accès à la demande plutôt que dans le chemin chaud — garde les index principaux compacts et performants.
- **Statistiques en modèle proche du CQRS** : `dailyStatistics` (doc 05) est un modèle de lecture déconnecté du modèle d'écriture transactionnel (`orders`, `payments`) — c'est déjà un CQRS-lite, qui s'étend naturellement à un vrai pipeline de projections (ex. MongoDB Change Streams → agrégats) si le volume l'exige.

## 18.6 Extraction en microservices — quand et comment

Ne pas extraire par anticipation (doc 02 §2.1). Extraire un module (doc 04) quand **au moins un** de ces signaux apparaît :
1. Le module a un profil de charge radicalement différent des autres (ex. `orders`/`kitchen` en pic pendant le service, `statistics` en pic la nuit) et cohabiter complique le dimensionnement.
2. Le module doit scaler indépendamment (ex. Socket.IO/`kitchen` nécessite beaucoup plus d'instances que `billing`).
3. Une équipe dédiée se forme autour du module et a besoin d'un cycle de déploiement indépendant.

Grâce à la discipline "un module ne communique avec un autre que via son `index.ts` public" (doc 12 §12.1) et à la préférence pour la communication événementielle plutôt que l'appel direct pour éviter les cycles (doc 04 §4.5), l'extraction consiste à : remplacer l'appel in-process par un appel réseau (REST interne ou message broker), déplacer le repository et le modèle Mongoose concernés, sans toucher à la logique métier du service.

## 18.7 Observabilité à grande échelle

- **Tracing distribué** (OpenTelemetry) branché sur le `correlationId` déjà en place (doc 12 §12.8) dès que plus d'un service existe.
- **Dashboards par tenant à fort volume** : détection proactive des "noisy neighbors" (doc 06 §6.6) avec alerte automatique et proposition de bascule en mode Silo.
- **SLO/SLI définis** dès la commercialisation (ex. latence P95 < 300ms sur `POST /orders`, disponibilité 99.9%) pour objectiver la qualité de service vendue aux clients Business/Premium.

## 18.8 Feature flags et déploiement progressif

- Système de feature flags **découplé du feature gating d'abonnement** (doc 08 §8.6) : les flags servent à faire des rollouts progressifs d'une nouvelle fonctionnalité (ex. 5% des tenants), le feature gating sert à monétiser un plan. Les deux mécanismes sont complémentaires, pas fusionnés, pour ne pas mélanger une décision produit commerciale et une décision de déploiement technique.
- **Déploiements Blue-Green / Canary** sur Railway une fois le volume de tenants actifs rendant un déploiement risqué en heures de service (le rush du soir, doc 01, est justement la pire fenêtre pour un déploiement classique).

## 18.9 Extension du modèle SaaS

- **Silo pour comptes Enterprise** (doc 06 §6.1) : cluster MongoDB dédié, éventuellement instance API dédiée, pour les clients avec exigences de conformité/latence spécifiques — sans changement de code, seulement de configuration de routage (`restaurants.clusterId`).
- **API publique et Webhooks** (identifiés comme manquants au doc 01 §1.4) : à activer en Phase Premium, avec un système de signature de webhook (HMAC) et de retry, réutilisant l'infrastructure de queue déjà en place (§18.4).
- **Marketplace d'intégrations** (imprimantes, comptabilité, terminaux de paiement physiques) : conséquence naturelle d'une API publique bien conçue, alignée sur l'ambition de comparaison à Toast/Square.
- **Multi-région** : si l'expansion géographique le justifie (latence, souveraineté des données), la même logique de routage par `clusterId`/région s'étend à un routage par région, avec réplication contrôlée des données de référence (plans, configuration plateforme) et isolation stricte des données transactionnelles par région.

## 18.10 Continuité d'activité

- **Sauvegardes automatiques** MongoDB Atlas (Point-in-Time Recovery) + tests de restauration réguliers (doc 17 §17.6) — une sauvegarde jamais testée n'est pas une sauvegarde.
- **Plan de reprise d'activité (DR)** documenté avec RTO/RPO cibles, réévalués à mesure que le nombre de tenants (et donc l'impact d'un incident) croît.
- **Chaos engineering léger** (ex. tests de coupure Redis, de latence MongoDB artificielle) une fois le produit en production réelle, pour valider que les mécanismes de dégradation gracieuse (doc 10 §10.7 "Socket.IO notifie, REST fait foi") tiennent réellement leurs promesses.

## 18.11 Conformité et confiance (condition de vente B2B à grande échelle)

- **Trajectoire vers une certification de type SOC 2 Type II** (ou équivalent local) dès que la base de clients B2B devient significative — l'audit trail (doc 05/13), la gestion des accès (doc 08), et le chiffrement (doc 13 §13.6) déjà prévus dans ce dossier sont les prérequis techniques de cette certification, pas des ajouts séparés.
- **Politique de rétention et de suppression des données** formalisée (doc 06 §6.7 cycle de vie du tenant), nécessaire pour toute clientèle soumise à des obligations de protection des données personnelles.
- **Transparence opérationnelle** : page de statut public (status page) une fois le volume de clients justifiant une communication proactive en cas d'incident.

## 18.12 Ce qu'il ne faut surtout pas faire

Pour clore ce dossier sur un principe directeur : la meilleure garantie de scalabilité à plusieurs années n'est pas d'anticiper toutes les briques d'infrastructure ci-dessus dès le premier commit, mais de **ne jamais violer les frontières posées dans ce dossier** (isolation tenant, séparation des couches, modules communiquant par contrats explicites, aucune donnée de paiement sensible stockée). Une architecture simple qui respecte ses propres frontières scale en ajoutant des briques d'infrastructure ; une architecture qui triche sur ses frontières pour aller plus vite aujourd'hui se paie systématiquement par une refonte demain — précisément ce que le client a demandé d'éviter.
