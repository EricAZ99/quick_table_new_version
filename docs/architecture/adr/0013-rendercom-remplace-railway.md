# ADR 0013 — Render.com remplace Railway pour l'hébergement backend

Statut : Accepté (dérogation au cahier des charges, autorisée par le Product Owner)
Date : 2026-07-14
Supersède : [ADR 0006](./0006-railway-hebergement-backend.md)

## Contexte

Railway a supprimé son palier gratuit depuis la rédaction de l'ADR 0006 (aujourd'hui carte bancaire + abonnement payant requis dès le premier service, y compris en développement). Pour un lancement bootstrap (doc 25 §25.1bis, doc 32), le budget prime sur le respect littéral du cahier des charges sur ce point précis — décision prise avec le Product Owner (ticket 7, Feature 0.1).

Contrainte non négociable pour le remplaçant : `apps/api` héberge un serveur Socket.IO (doc 10) qui exige des connexions WebSocket **persistantes** — élimine d'office toute plateforme serverless (Vercel, AWS Lambda, Cloudflare Workers) pour ce service.

## Alternatives considérées

1. **Payer Railway** (~5$/mois, palier Hobby) : conforme au cahier des charges tel quel, mais contradictoire avec la contrainte budgétaire bootstrap explicitement posée ailleurs (doc 25 §25.1bis : "Infisical + Grafana Cloud + Sentry, budget serré").
2. **Fly.io** : proche de Railway en simplicité (déjà écarté par l'ADR 0006 sur ce critère), mais carte bancaire également requise pour la vérification de compte, même sur le palier gratuit.
3. **Render.com** (choix retenu) : conteneur persistant réel (pas serverless), support WebSocket natif, palier gratuit sans carte bancaire.

## Décision

Render.com remplace Railway comme cible de déploiement d'`apps/api` (staging + production), à budget nul. Limite connue et acceptée : le service gratuit s'endort après 15 minutes d'inactivité (cold start ~30-50s au réveil) — non gênant en développement/démo, à réévaluer avant tout premier client payant réel (trigger de revue, même logique que l'ADR 0006 qu'il remplace).

## Conséquences

- **Positif** : coût nul, aucun changement d'architecture applicative (Express + Socket.IO tourne tel quel sur un conteneur persistant, contrairement à une bascule vers du serverless).
- **Négatif accepté** : cold start après inactivité sur le palier gratuit ; moins d'écosystème/outillage que Railway pour l'instant (pas de Redis managé natif équivalent — Upstash reste la solution retenue par l'ADR 0009 dans ce cas).
- **Dette documentaire assumée** : l'ADR 0006 et les mentions techniques de Railway spécifiques à sa plateforme (sticky sessions du load balancer doc 10 §10.6, service worker séparé doc 03/12, collecte de logs doc 25, triggers de scaling doc 18/99) ne sont **pas** repropagées vers Render.com dans ce ticket — seuls ce document, l'ADR 0006 (marqué "Superseded") et le doc 02 §2.7 (référence de déploiement principale) sont mis à jour immédiatement. Le reste sera corrigé au fil de l'eau, au moment où chaque fonctionnalité concernée (workers, Socket.IO multi-instance, observabilité) sera effectivement développée — pas de réécriture spéculative maintenant.
- **Revue programmée** : ré-auditer ce choix avant le premier client payant réel, ou plus tôt si le cold start s'avère gênant en usage réel (retour utilisateur/support).
