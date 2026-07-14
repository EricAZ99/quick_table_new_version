# ADR 0013 — Render.com remplace Railway pour l'hébergement backend

Statut : **Rejeté** (2026-07-14, même jour que la proposition) — Railway reste le fournisseur (ADR 0006). Conservé pour l'historique de la décision (doc 17 §17.7), pas comme référence active.
Date : 2026-07-14

## Contexte

Railway a supprimé son palier gratuit depuis l'ADR 0006 (carte bancaire + abonnement payant requis dès le premier service). Pour un lancement bootstrap, le budget prime sur le respect littéral du cahier des charges sur ce point précis — proposition faite avec le Product Owner (ticket 7, Feature 0.1).

Contrainte non négociable pour tout remplaçant : `apps/api` héberge un serveur Socket.IO (doc 10) qui exige des connexions WebSocket **persistantes** — élimine d'office toute plateforme serverless (Vercel, AWS Lambda, Cloudflare Workers) pour ce service.

## Alternatives considérées

1. **Payer Railway** (~5$/mois, palier Hobby) : conforme au cahier des charges tel quel.
2. **Render.com** (choix initialement retenu) : conteneur persistant réel, support WebSocket natif, mais **demande finalement aussi une carte bancaire** pour vérification (autorisation temporaire de 1$) avant d'activer même l'instance Free — découvert seulement en essayant réellement de créer le service, pas anticipé au moment de la rédaction initiale de cette ADR.
3. **Koyeb** (envisagé en remplacement de Render.com) : non essayé, abandonné dès que l'option 4 est apparue.
4. **Crédit d'essai gratuit Railway** (choix final) : Railway propose un crédit d'essai unique (utilisable sans engagement de carte au démarrage) suffisant pour le développement/la démo — résout la contrainte budgétaire **sans** dévier du cahier des charges.

## Décision

**Rejeté.** Le crédit d'essai gratuit de Railway couvre le besoin actuel sans nécessiter de dérogation au cahier des charges. Railway reste le fournisseur d'hébergement backend (ADR 0006, statut "Accepté" réinstauré). Cette ADR est conservée pour documenter la démarche : la découverte tardive (après avoir commencé à configurer Render.com) que "gratuit" n'y signifie pas "sans carte" est une leçon utile pour de futures évaluations de fournisseur — vérifier ce point _avant_ de documenter un changement d'architecture, pas après.

## Conséquences

- **Aucune** sur l'architecture ou le code — ADR proposée et rejetée le même jour, avant toute configuration réelle de Render.com.
- **Revue programmée inchangée** : le crédit d'essai Railway est one-shot. Avant son épuisement, il faudra soit passer sur le palier payant Railway (~5$/mois, conforme au cahier des charges), soit rouvrir cette évaluation — trigger à documenter au moment venu (ticket de suivi, pas anticipé ici).
