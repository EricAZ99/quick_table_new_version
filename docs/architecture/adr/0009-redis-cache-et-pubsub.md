# ADR 0009 — Redis comme cache, pub/sub et broker de queue

Statut : Accepté
Date : 2026-07-11

## Contexte

Plusieurs besoins distincts émergent dès le MVP : diffusion Socket.IO multi-instance (doc 10 §10.6), cache applicatif (doc 26), rate limiting distribué (doc 13 §13.2), file d'attente de jobs asynchrones (doc 12 §12.5).

## Alternatives considérées

1. **Une brique par besoin** (ex. RabbitMQ pour les queues, Memcached pour le cache, un service pub/sub managé séparé pour Socket.IO) : trois technologies à opérer pour trois besoins qui, au stade actuel, tiennent largement dans les capacités d'un seul Redis.
2. **Redis unique multi-usage** (choix retenu).

## Décision

Un service Redis managé (Railway Redis ou Upstash) sert de cache applicatif (doc 26), d'adaptateur pub/sub Socket.IO (doc 10 §10.6), de store de rate limiting (doc 13 §13.2) et de broker BullMQ pour les jobs asynchrones (doc 12 §12.5). Séparation en deux instances (pub/sub Socket.IO isolé du reste) prévue au palier "5 000 restaurants" (doc 26 §26.6) si la contention devient mesurable.

## Conséquences

- **Positif** : une seule technologie à opérer, monitorer et sauvegarder pour plusieurs besoins transverses ; coût minimal au démarrage.
- **Négatif accepté** : couplage de charge entre usages tant que l'instance n'est pas séparée (un pic de cache invalidation pourrait théoriquement affecter la latence pub/sub) — mitigé par le plan de séparation déjà documenté (doc 26 §26.6), pas une improvisation en cas d'incident.
- **Garde-fou explicite** : aucune donnée dans Redis n'est une source de vérité métier irremplaçable (doc 26 §26.6) — en cas de perte totale de Redis, le système redevient dégradé (pas de cache, pas de temps réel multi-instance) mais ne perd aucune donnée métier persistée en MongoDB.
