# ADR 0004 — Socket.IO pour le temps réel

Statut : Accepté (confirmé après revue, doc 19 §19.5)
Date : 2026-07-11

## Contexte

Le temps réel (cuisine, statuts de commande, appel serveur) est un flux critique du produit (doc 10 §10.1). Le cahier des charges impose Socket.IO.

## Alternatives considérées

1. **Server-Sent Events (SSE)** pour les flux unidirectionnels (Kitchen Display, dashboard).
2. **Service managé** (Ably, Pusher) en lieu et place d'un déploiement auto-hébergé.
3. **WebSocket natif** sans librairie d'abstraction.
4. **Socket.IO auto-hébergé** (choix retenu).

## Décision

Conserver Socket.IO comme canal unique (pas de double protocole SSE+WS), auto-hébergé avec adaptateur Redis pour le scaling horizontal (doc 10 §10.6).

## Conséquences

- **Positif** : reconnexion automatique gérée côté client, rooms natives adaptées au modèle multi-tenant (doc 10 §10.3), un seul protocole à maintenir côté frontend et backend.
- **Négatif accepté** : coût opérationnel de l'adaptateur Redis et des sticky sessions à gérer soi-même (vs un service managé qui l'abstrairait) — accepté car un service managé facturé par connexion active devient défavorable économiquement à l'échelle visée (doc 18, plusieurs milliers de tenants).
- **Garde-fou retenu** : Socket.IO n'est jamais la source de vérité d'un état métier ("REST fait foi", doc 10 §10.7) — limite l'impact d'une éventuelle défaillance du canal temps réel à une dégradation d'UX, jamais à une perte de donnée.
