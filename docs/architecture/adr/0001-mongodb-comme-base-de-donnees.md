# ADR 0001 — MongoDB comme base de données primaire

Statut : Accepté (confirmé après revue, doc 19 §19.1)
Date : 2026-07-11

## Contexte

QuickTable est un SaaS multi-tenant dont le domaine (catalogue de menu, commandes, stock) est en partie flexible et en partie fortement relationnel (facturation, paiements). Le cahier des charges impose MongoDB. La revue d'architecture (doc 19) a réexaminé ce choix indépendamment de la contrainte contractuelle, pour vérifier qu'il reste défendable techniquement.

## Alternatives considérées

1. **PostgreSQL** avec `tenant_id` + Row-Level Security native.
2. **Modèle hybride** : Postgres pour le financier, MongoDB pour le catalogue.
3. **MongoDB seul** (choix retenu).

## Décision

Conserver MongoDB comme base primaire unique, avec deux amendements : (a) usage explicite des transactions multi-documents MongoDB pour toute opération financière/multi-collection (doc 05 §5.8) ; (b) tout besoin de reporting comptable lourd futur passe par un entrepôt analytique en lecture seule alimenté par ETL, jamais par une migration de la base primaire (doc 18 §18.5, doc 19 §19.1).

## Conséquences

- **Positif** : cohérence avec le modèle multi-tenant "Pool" (doc 06), flexibilité de schéma pendant les phases 0-9, une seule technologie à opérer/sauvegarder/monitorer.
- **Négatif accepté** : l'intégrité référentielle stricte (contraintes FK) n'est pas native — compensée par la discipline applicative (`BaseRepository`, doc 12) et les tests d'intégration (doc 31).
- **Risque résiduel** : si le reporting financier devient un besoin critique avant qu'un entrepôt analytique soit en place, un contournement manuel (exports) sera temporairement nécessaire — accepté comme dette technique gérée.
