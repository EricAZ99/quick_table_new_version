# ADR 0007 — Vercel pour l'hébergement frontend

Statut : Accepté (contrainte du cahier des charges)
Date : 2026-07-11

## Contexte

Le cahier des charges impose Vercel pour `apps/web`. Vercel est optimisé pour les frameworks front modernes (Vue/Vite inclus) avec CDN Edge natif et previews par PR.

## Alternatives considérées

1. **Netlify** : fonctionnalités très proches, pas de différenciateur clair pour ce projet.
2. **Auto-hébergement (Nginx + CDN manuel)** : contrôle total, coût opérationnel injustifié pour une SPA statique.
3. **Vercel** (choix retenu, imposé).

## Décision

Conserver Vercel pour les deux fronts (back-office et interface client QR Code, doc 02 §2.1), avec code-splitting strict entre les deux (doc 11 §11.4) pour tirer parti du CDN Edge sur la surface la plus sensible à la performance (interface client, doc 29 §29.3).

## Conséquences

- **Positif** : previews automatiques par PR (doc 14 §14.1), CDN Edge natif, zéro configuration d'infrastructure frontend.
- **Négatif accepté** : coût qui croît avec la bande passante à très grande échelle (doc 18) — non bloquant aux paliers MVP/V1/V1.5, à réévaluer si le trafic client (scans QR Code) devient très élevé.
