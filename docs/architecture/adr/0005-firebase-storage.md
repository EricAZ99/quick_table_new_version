# ADR 0005 — Firebase Storage pour le stockage de fichiers

Statut : Accepté (contrainte du cahier des charges, confirmé après revue, doc 19 §19.8)
Date : 2026-07-11

## Contexte

Le cahier des charges impose Firebase Storage pour les photos de plats, logos, avatars. Ce choix introduit une dépendance à Google Cloud distincte du reste de la stack (Vercel/Railway/Atlas).

## Alternatives considérées

1. **AWS S3** ou **Cloudflare R2** (egress moins coûteux à grande échelle).
2. **Firebase Storage** (choix retenu, imposé).

## Décision

Conserver Firebase Storage, mais imposer que **seul le module `uploads`** (doc 04) importe le SDK Firebase — aucun autre module n'accède directement au stockage de fichiers.

## Conséquences

- **Positif** : conformité au cahier des charges, mise en œuvre rapide (SDK mature, URLs signées natives).
- **Négatif accepté** : risque de coût d'egress à grande échelle (doc 18), couplage à un prestataire externe au reste de la stack.
- **Mitigation structurelle** : l'encapsulation stricte dans `modules/uploads/` (doc 04 §4.1) rend un changement futur de prestataire de stockage (ex. migration vers Cloudflare R2 au palier "50 000 restaurants", doc 18 §18.2) une modification confinée à un seul module, jamais une réécriture transverse.
