# ADR 0006 — Railway pour l'hébergement backend

Statut : Accepté (contrainte du cahier des charges, réévaluation programmée)
Date : 2026-07-11

## Contexte

Le cahier des charges impose Railway pour l'API et les workers. Railway est une plateforme PaaS simple, adaptée à une petite équipe, mais avec moins de contrôle fin qu'un déploiement Kubernetes/ECS.

## Alternatives considérées

1. **Kubernetes** (EKS/GKE) : contrôle total, coût opérationnel élevé, injustifié pour la taille d'équipe actuelle.
2. **Fly.io** : proche de Railway en simplicité, meilleure présence multi-région native.
3. **Railway** (choix retenu, imposé).

## Décision

Conserver Railway pour les Phases 0-9 (MVP à V1.5, doc 32). Le passage à une infrastructure plus contrôlable (Kubernetes ou équivalent) est planifié comme un **trigger explicite** au palier "50 000 restaurants" (doc 18 §18.2) ou plus tôt si un besoin multi-région (doc 18 §18.9) apparaît avant ce palier.

## Conséquences

- **Positif** : mise en production rapide, scaling automatique suffisant pour les paliers 0-1000 tenants (doc 18 §18.2), pas d'ingénierie infra dédiée nécessaire tôt.
- **Négatif accepté** : moins de contrôle sur le placement géographique des instances, limites de configuration réseau fine (utile pour le multi-région futur).
- **Revue programmée** : ce choix doit être ré-audité explicitement à l'entrée en Epic 10/11 (doc 34 §34.12-34.13), pas laissé comme une dérive silencieuse.
