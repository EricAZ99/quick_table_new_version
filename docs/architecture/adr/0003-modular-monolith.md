# ADR 0003 — Modular Monolith plutôt que Microservices

Statut : Accepté (confirmé après revue, doc 19 §19.2)
Date : 2026-07-11

## Contexte

L'ambition affichée (produit comparable à Toast/Square/Lightspeed, doc 33) pourrait suggérer une architecture microservices dès le départ. L'équipe de développement visée est de 2-4 personnes (doc 15).

## Alternatives considérées

1. **Microservices dès le jour 1**, un service par module (doc 04).
2. **Modular Monolith** (choix retenu) avec Event Bus interne (doc 20).

## Décision

Démarrer en Modular Monolith avec des frontières de module strictes (doc 04, doc 12 §12.1 : un seul point d'entrée public par module) et une communication majoritairement événementielle (doc 20). Extraire un module en service séparé uniquement quand un signal concret l'exige (doc 18 §18.6) : profil de charge radicalement différent, besoin de scaling indépendant, ou équipe dédiée.

## Conséquences

- **Positif** : coût opérationnel minimal au démarrage, cohérence transactionnelle simple (une seule base, transactions MongoDB natives, doc 05 §5.8), vélocité de développement maximale pour une petite équipe.
- **Négatif accepté** : pas d'isolation de panne native entre modules (un bug mémoire dans `statistics` peut affecter `orders` s'ils partagent le même process) — mitigé par les workers séparés pour les tâches lourdes (doc 12 §12.5) et par la discipline modulaire qui limite le risque de fuite d'un module à l'autre.
- **Trajectoire de sortie documentée** : l'Event Bus (doc 20) et la règle "un module ne dépend que du service public d'un autre module" (doc 12 §12.1) rendent une extraction future mécanique — changement de transport, pas de logique métier.
