# ADR 0002 — Express.js comme framework backend

Statut : Accepté
Date : 2026-07-11

## Contexte

Le cahier des charges impose Node.js/Express/TypeScript. La revue a évalué si ce choix reste pertinent face à des alternatives plus modernes (Fastify, NestJS, Hono).

## Alternatives considérées

1. **Fastify** : meilleures performances brutes, schéma-first natif.
2. **NestJS** : structure opinionated proche de Spring/Angular, DI native, mais plus lourd conceptuellement.
3. **Express** (choix retenu, imposé).

## Décision

Conserver Express, structuré selon les couches Controller/Service/Repository (doc 12) qui compensent l'absence de structure imposée par le framework lui-même. La structure de module (doc 03/12) apporte la discipline qu'un framework comme NestJS aurait imposée nativement, sans le coût d'apprentissage et la verbosité des décorateurs.

## Conséquences

- **Positif** : écosystème mature, immense disponibilité de développeurs, flexibilité totale sur l'organisation du code (compensée par les conventions du doc 12/30).
- **Négatif accepté** : aucune structure imposée par le framework — le risque de dérive est mitigé par les règles ESLint custom (imports internes de module, doc 12 §12.1) et la revue de code (doc 14 §14.8).
- Si l'équipe grossit fortement ou si la performance brute devient un goulot d'étranglement mesuré (doc 29), une migration progressive vers Fastify est possible **route par route** grâce à la séparation Controller/Service (le service ne connaît pas Express, doc 12 §12.2) — coût de migration limité par construction.
