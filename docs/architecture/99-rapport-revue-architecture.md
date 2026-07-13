# 99. Rapport de revue d'architecture — Synthèse

**Date** : 2026-07-11
**Portée** : revue critique complète de l'ensemble du dossier d'architecture QuickTable (docs 01-18), réalisée en simulant un comité d'architecture Staff Engineers (Data/Infra, Payments/Compliance, Platform/SaaS, Frontend/DX), suivie de l'enrichissement de la documentation sur 20 axes demandés.

## 1. Documents créés (16 + 10 ADR + ce rapport = 27 fichiers)

| Document | Objet |
|---|---|
| 19-revue-architecture-critique.md | Réexamen de chaque décision structurante (Pourquoi/Alternative/Avantages/Inconvénients/Verdict) |
| 20-event-driven-architecture.md | Domain Events, Event Bus interne, pattern Transactional Outbox |
| 21-state-machines.md | State machines de Order, Payment, Reservation, Subscription, Employee, Restaurant, Table |
| 22-versioning-strategy.md | Versioning menus/prix, recettes, permissions, plans SaaS, configuration, API |
| 23-soft-delete-policy.md | Politique globale deletedAt/deletedBy/restoredAt/restoredBy + archivage + RGPD |
| 24-audit-technique-metier.md | Séparation audit métier (`businessAuditLogs`) / audit technique (hors MongoDB) |
| 25-observabilite.md | Logging, Metrics, Tracing, Health Checks, Alerting |
| 26-cache-redis.md | Convention de clés Redis unifiée, TTL, invalidation |
| 27-recherche.md | Text Search, autocomplétion, filtres/tri, pagination cursor |
| 28-ddd-bounded-contexts.md | Bounded Contexts, Aggregates, Entities, Value Objects, Repositories, Factories, Domain Services |
| 29-performance-slo.md | Objectifs chiffrés de performance et disponibilité |
| 30-engineering-handbook.md | Conventions de travail quotidien, DoR, DoD, checklist PR |
| 31-architecture-tests.md | Pyramide de tests complète (dont Socket.IO et sécurité dédiés) |
| 32-mvp-versions.md | Définition précise MVP/V1/V1.5/V2/V3 |
| 33-comparaison-marche.md | Comparaison Toast/Square/Lightspeed/GloriaFood/Loyverse, écarts et différenciateurs |
| 34-backlog-epics-features.md | Epics → Features → User Stories → tâches ≤1 jour (MVP détaillé, V1-V3 en Feature/Story) |
| adr/0001 à 0010 | 10 Architecture Decision Records formels |

## 2. Documents modifiés

| Document | Nature de la modification |
|---|---|
| 00-INDEX.md | Réécriture complète : nouveau sommaire (34 documents + 10 ADR), décisions structurantes mises à jour, journal des révisions ajouté |
| 04-modules.md | Ajout d'un amendement précisant le passage à un couplage majoritairement événementiel (doc 20) sur le graphe de dépendances |
| 05-database-mongodb.md | Nouvelle §5.8 : transactions multi-documents obligatoires, verrouillage optimiste restreint aux transitions de statut (abandon du verrou document-entier sur `orders.items[]`), TTL consolidé, sharding readiness, nouvelles collections listées |
| 09-api-rest.md | Précision de la convention de pagination : offset (listes de config) vs cursor (listes à fort volume) |
| 13-securite.md | Ajout §13.8bis Secrets Management (gap identifié, absent de la version initiale) |
| 14-qualite-code.md | Section tests §14.6 réduite à un renvoi vers le doc 31 (suppression du doublon) |
| 15-plan-developpement.md | Alignement explicite sur doc 32 (MVP/V1/V1.5) et doc 34 (backlog) ; Phase 4 et Phase 10 enrichies (state machines, opérations atomiques, Outbox, observabilité) ; ajout des Phases 11 (V2) et 12 (V3), absentes de la version initiale |
| 18-bonnes-pratiques-scalabilite.md | Tableau de paliers remplacé par la grille précise demandée : 500 / 5 000 / 50 000 / 500 000 restaurants, avec trigger explicite pour Microservices / Message Broker / Kubernetes / CDN / Object Storage à chaque palier |

## 3. Nouvelles décisions d'architecture issues de la revue

1. **Verrouillage optimiste restreint** : abandon du verrou document-entier sur les commandes au profit d'opérations atomiques MongoDB ciblées (`$push`/`$set` positional/`$pull`) — élimine les faux conflits de concurrence en rush de service (doc 19 §19.4, doc 05 §5.8).
2. **Event Bus interne avec pattern Transactional Outbox** — les modules communiquent désormais majoritairement par Domain Events plutôt que par appel direct de service, avec fiabilité garantie par une collection `eventOutbox` transactionnelle (doc 20).
3. **Liste de révocation JWT d'urgence dans Redis** (`auth:revoked:{jti}`) pour couvrir le cas de licenciement/compromission sans réintroduire une dépendance Redis systématique (doc 19 §19.6, doc 26 §26.2).
4. **Séparation stricte audit métier / audit technique** — l'audit technique ne transite jamais par MongoDB (doc 24), correction d'un anti-pattern de la conception initiale.
5. **Deux modes de pagination** (offset vs cursor) selon le volume et le pattern d'accès de chaque liste (doc 19 §19.10, doc 27 §27.5) — incohérence de la conception initiale corrigée.
6. **Versioning explicite des permissions par rôle** (`roleDefinitions`) et des plans SaaS (`subscriptionPlans.version`), pour permettre l'audit historique et éviter qu'une modification de plan n'affecte rétroactivement les abonnés existants (doc 22).
7. **Vocabulaire DDD formalisé** (Bounded Contexts, Aggregates) comme outil de raisonnement pour les revues futures, sans renommage de code (doc 28).
8. **Roadmap étendue à V2/V3** avec contenu défini par la comparaison concurrentielle (doc 32, 33, 34) — la version initiale s'arrêtait à un horizon "MVP + durcissement" sans vision produit au-delà.

## 4. Ce qui a été explicitement confirmé sans changement (et pourquoi c'est important de le savoir)

- **MongoDB** comme base primaire (doc 19 §19.1, ADR 0001) — avec trajectoire d'entrepôt analytique si le reporting financier devient un besoin lourd, plutôt qu'une migration de base.
- **Modular Monolith** plutôt que microservices (doc 19 §19.2, ADR 0003) — l'ambition "comparable à Toast/Square" n'implique pas une architecture microservices day-1 ; Toast et Square eux-mêmes n'ont pas démarré ainsi.
- **Multi-tenant Pool** avec `tenantId` partagé (doc 19 §19.3, ADR 0008) — le modèle Database-per-tenant a été explicitement écarté pour un SaaS visant plusieurs milliers de tenants.
- **Socket.IO auto-hébergé** plutôt qu'un service managé ou un second protocole SSE (doc 19 §19.5, ADR 0004).
- **RBAC statique** plutôt qu'un moteur ABAC — suffisant pour le MVP/V1, le modèle de données est déjà prêt pour une évolution ultérieure (doc 19 §19.7).

Documenter ces confirmations a la même valeur que les changements : cela évite qu'un futur développeur ou un nouvel architecte remette en cause ces choix sans connaître le débat déjà eu et ses conclusions.

## 5. Risques restants (non résolus par cette revue, à surveiller activement)

| Risque | Nature | Mitigation en place | Ce qui reste ouvert |
|---|---|---|---|
| Zones grises métier non tranchées (split bill, pourboires, annulation post-cuisine) | Produit | Identifiées dès doc 01, reportées explicitement en V2 (doc 32 §32.5) | Doivent être cadrées avec le Product Owner avant le début de la Phase 11 |
| Choix du prestataire de paiement et du prestataire email/SMS | Technique/Fournisseur | Architecture agnostique du prestataire (doc 04 module `payments`/`notifications`) | Décision non prise — bloque le démarrage effectif de l'Epic 5 (doc 34 §34.7) |
| Choix du marché de lancement prioritaire | Produit/Business | La comparaison concurrentielle (doc 33) et le contenu de V2 en dépendent | Décision Product Owner requise avant priorisation définitive de V2 |
| Conformité RGPD/protection des données au-delà de l'export/anonymisation de base | Légal/Conformité | Traitement de base prévu en V1.5 (doc 23 §23.6) | La juridiction cible détermine des obligations plus précises (durées de rétention exactes, doc 24 §24.4) non figées |
| Outil de gestion des secrets et d'observabilité (Doppler/Vault, Grafana/Datadog) | Technique/Coût | Principes posés (doc 13 §13.8bis, doc 25) | Choix d'outil non arbitré — dépend du budget |
| Fiabilité réelle du pattern Outbox sous charge extrême | Technique | Conçu et documenté (doc 20 §20.3) | Non encore éprouvé — à valider par les tests de charge de la Phase 10 (doc 31 §31.4) |
| Dépendance à Railway au-delà du palier 50 000 restaurants | Infrastructure | Trigger de réévaluation documenté (doc 18 §18.2, ADR 0006) | Décision réelle seulement nécessaire à un horizon lointain — à ne pas anticiper prématurément |

## 6. Points à valider avec le Product Owner avant le début du développement

1. **Règles métier précises** : split bill, gestion des pourboires, annulation d'un article déjà envoyé en cuisine, politique exacte de remboursement (doc 01 §1.7, doc 32 §32.5).
2. **Marché de lancement prioritaire** (impact sur la priorisation V2, doc 33 §33.6, et sur les obligations RGPD/fiscales, doc 23 §23.6, doc 24 §24.4).
3. **Prestataire de paiement et prestataire email/SMS** à sélectionner avant le démarrage effectif de l'Epic 5/Feature 1.2 (doc 34).
4. **Durées de rétention légales exactes** par catégorie d'audit métier (comptable, RH, sécurité — doc 24 §24.4), dépendantes de la juridiction.
5. **Fenêtre de récupération contractuelle** pour un tenant archivé (30 jours proposés, doc 23 §23.5) — à confirmer comme engagement commercial.
6. **Budget observabilité/secrets** (Grafana Loki vs Datadog, Doppler vs Vault) — arbitrage coût/fonctionnalité à trancher avant la Phase 10 (doc 25, doc 13 §13.8bis).
7. **Contenu et ordre exact de la V2** (split bill vs impression ticket vs mode offline en premier) — dépend du retour des restaurants pilotes du MVP, à réévaluer plutôt qu'à figer maintenant (doc 32 §32.8).
8. **Validation des SLO chiffrés** (doc 29) comme engagement réel envers les premiers clients pilotes, ou comme simple cible interne à ce stade.

### Mise à jour du 2026-07-13 — points tranchés

Les points **1, 2, 3** ont été tranchés lors du cadrage Product Owner du 2026-07-13 (doc 00-INDEX v2.1/v2.4) : règles métier confirmées en MVP, marché de lancement = Bénin, Nodemailer + Brevo pour l'email, Stripe + FedaPay pour le paiement (doc adr/0011). Le point **4** est tranché : rétention différenciée 10 ans (finance, art. 23 AUDCIF/OHADA) / 3 ans (reste) / permanente (RGPD), doc 24 §24.4. Le point **6** est tranché : Infisical (secrets) + Grafana Cloud + Sentry (observabilité), budget serré priorisé pour un lancement bootstrap, doc 13 §13.8bis, doc 25 §25.1bis. Les points **5, 7, 8** restent ouverts — à trancher respectivement avant la commercialisation contractuelle, avant le cadrage détaillé de la V2, et avant l'engagement de SLO envers des clients pilotes réels.

## 7. Conclusion

L'architecture initiale (docs 01-18) s'est avérée globalement solide à la revue : aucune décision structurante majeure n'a été renversée. La valeur de cette revue tient dans (a) la formalisation d'angles morts réels (event-driven, state machines, versioning, audit, observabilité, cache, recherche, DDD, performance, tests, ADR — tous absents ou seulement esquissés), (b) la correction de deux points techniques concrets (verrouillage optimiste trop grossier sur les commandes, incohérence de pagination), et (c) l'ajout d'une couche produit qui manquait entièrement (MVP/versions, comparaison concurrentielle, backlog actionnable). Le dossier est désormais prêt à servir de référence multi-années pour une équipe de développement, conformément à l'objectif fixé.
