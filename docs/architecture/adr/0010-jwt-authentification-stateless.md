# ADR 0010 — JWT stateless + Refresh Token rotatif

Statut : Accepté (confirmé après revue avec amendement, doc 19 §19.6)
Date : 2026-07-11

## Contexte

L'authentification doit rester performante en environnement multi-instance sans dépendance dure à un store partagé pour chaque requête, tout en permettant une révocation de sécurité fiable (doc 07).

## Alternatives considérées

1. **Sessions opaques server-side** (Redis), consultées à chaque requête : révocation instantanée mais latence et dépendance dure à Redis pour l'authentification elle-même.
2. **JWT stateless + Refresh Token rotatif** (choix retenu).

## Décision

Access Token JWT courte durée (15 min), Refresh Token rotatif longue durée (30 jours, cookie `httpOnly`), avec **amendement de la revue** : ajout d'une liste de révocation courte durée dans Redis (`auth:revoked:{jti}`, doc 26 §26.2) pour couvrir le cas d'urgence (licenciement, compromission) sans réintroduire une dépendance Redis systématique sur chaque requête en usage normal.

## Conséquences

- **Positif** : scalabilité horizontale native (aucune session à répliquer entre instances API, doc 02), latence minimale en usage normal (pas d'aller-retour Redis systématique).
- **Négatif accepté** : fenêtre de 15 minutes où un token émis avant une révocation standard (changement de permission) reste valide sans le mécanisme d'urgence — couverte par `permissionsVersion` (doc 07 §7.2) pour les changements de permission, et par la liste de révocation Redis pour les cas d'urgence explicite.
- **Risque résiduel accepté** : la liste de révocation d'urgence n'est utilisée que pour les cas à fort impact (pas systématiquement), pour ne pas réintroduire la dépendance dure à Redis que ce choix cherchait justement à éviter.
