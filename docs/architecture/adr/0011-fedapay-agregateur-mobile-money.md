# ADR 0011 — FedaPay comme agrégateur Mobile Money pour le marché béninois

Statut : Accepté
Date : 2026-07-13

## Contexte

Le marché de lancement prioritaire de QuickTable est le Bénin (cadrage Product Owner du 2026-07-13, doc 35). Le paiement électronique y passe très majoritairement par le Mobile Money (MTN Mobile Money, Moov Money) plutôt que par la carte bancaire. Le module Paiement (doc 04, doc 09 §9.12) définit une interface `PaymentProviderAdapter` implémentée en MVP par un `ManualProviderAdapter` (confirmation manuelle, sans appel API) puis, en V1 (Feature 5.2, doc 34 §34.7), par un `MobileMoneyAdapter` réel — il fallait choisir le prestataire concret derrière cet adaptateur.

## Alternatives considérées

1. **Intégration directe des API MTN MoMo et Moov Money** : pas d'intermédiaire ni de commission d'agrégateur, mais deux intégrations et deux certifications distinctes à maintenir, deux comptes marchands à ouvrir, deux jeux de webhooks/formats de réponse à gérer côté `MobileMoneyAdapter`.
2. **FedaPay** (choix retenu) : fintech basée à Cotonou (Bénin), agrège MTN MoMo, Moov Money et le paiement carte derrière une API unique, documentation orientée développeur, adoption établie chez des startups ouest-africaines comparables. Support local en français.
3. **Kkiapay** : alternative béninoise équivalente en couverture (MTN, Moov, cartes) — conservée comme option de repli si les conditions commerciales de FedaPay (frais, délais de règlement) s'avéraient défavorables lors du cadrage détaillé de la Feature 5.2.
4. **CinetPay / PayDunya** : agrégateurs panafricains (Côte d'Ivoire / Sénégal) — couverture multi-pays plus large, pertinente seulement en cas d'expansion hors Bénin, ce qui n'est pas la priorité actuelle (doc 32 §32.8).

## Décision

`MobileMoneyAdapter` (doc 34 §34.7, Feature 5.2) implémente `PaymentProviderAdapter` au-dessus de l'API **FedaPay**, qui couvre à elle seule MTN Mobile Money, Moov Money et les cartes bancaires pour le marché béninois. Un seul jeu d'identifiants marchands et un seul format de webhook à intégrer, ce qui réduit la surface de la Feature 5.2 par rapport à une intégration directe multi-opérateurs.

## Conséquences

- **Positif** : une seule intégration à maintenir pour couvrir MTN + Moov + carte, prestataire local avec support en français, cohérent avec la stratégie de lancement Bénin-first (doc 35).
- **Négatif accepté** : commission d'agrégateur (variable selon volume) plutôt qu'un accès direct aux API opérateurs — jugé acceptable au vu du gain d'intégration et de maintenance pour une équipe réduite en phase de lancement.
- **Risque résiduel** : les conditions tarifaires exactes de FedaPay (frais par transaction, délais de règlement) n'ont pas été formellement contractualisées à la date de cet ADR — à valider avant le développement effectif de la Feature 5.2 (V1), sans remise en cause du choix architectural de l'adaptateur. Kkiapay reste l'option de repli documentée si ce point bloquait.
- Aucune donnée de carte ou de compte Mobile Money ne transite ni n'est stockée par le backend QuickTable (doc 13 §13.6) — FedaPay est appelé via redirection/tokenisation, comme prévu pour `StripeAdapter`.
