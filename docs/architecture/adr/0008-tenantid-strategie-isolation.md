# ADR 0008 — `tenantId` partagé (mode Pool) comme stratégie d'isolation multi-tenant

Statut : Accepté (confirmé après revue, doc 19 §19.3)
Date : 2026-07-11

## Contexte

QuickTable est un SaaS multi-tenant qui vise plusieurs milliers de restaurants (doc 18). L'isolation des données entre tenants est la contrainte de sécurité n°1 du projet (doc 01 §1.5, doc 06).

## Alternatives considérées

1. **Database-per-tenant** : isolation physique totale, mais gestion de milliers de connexions/migrations à grande échelle, coûteux sur MongoDB Atlas (limites de bases par cluster).
2. **Collection-per-tenant** : explosion du nombre de collections/index gérés, anti-pattern documenté à grande échelle.
3. **`tenantId` partagé (mode Pool)** (choix retenu) avec trajectoire Bridge/Silo pour les gros comptes.

## Décision

Isolation logique par `tenantId` sur toutes les collections tenant-scoped, appliquée à trois niveaux indépendants (doc 06 §6.4) : Tenant Resolver (JWT), `BaseRepository` (fusion obligatoire), plugin Mongoose `tenantScope` (garde-fou ORM) — plus une suite de tests d'isolation non contournable (doc 31 §31.5).

## Conséquences

- **Positif** : coût d'infrastructure minimal, standard éprouvé des SaaS B2B (Shopify, Salesforce sur certains modules), sharding par `tenantId` haché mécaniquement disponible si nécessaire (doc 18 §18.5) car tous les index sont préfixés `tenantId` (doc 05 §5.7).
- **Négatif accepté** : l'isolation dépend de la discipline applicative (trois lignes de défense), pas d'une garantie native du moteur de données comme le serait le Row-Level Security de PostgreSQL (doc 19 §19.1) — compensé par les tests automatisés bloquants.
- **Trajectoire de sortie documentée** : mode Bridge (cluster dédié pour un tenant Enterprise via `restaurants.clusterId`) et mode Silo (instance dédiée) disponibles sans changement de code applicatif, seulement de configuration de routage (doc 06 §6.1, doc 18 §18.9).
