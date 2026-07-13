# 9. API REST

## 9.1 Conventions générales

- **Base URL versionnée** : `https://api.quicktable.io/api/v1/...`. Toute rupture de contrat impose un `/v2`, jamais de breaking change silencieux sur `/v1`.
- **Format des réponses (enveloppe standard)** :

Succès :
```json
{
  "success": true,
  "data": { },
  "meta": { "page": 1, "limit": 20, "total": 134 }
}
```

Erreur :
```json
{
  "success": false,
  "error": {
    "code": "ORDER_NOT_FOUND",
    "message": "Commande introuvable.",
    "details": []
  }
}
```

- **Codes HTTP standards utilisés dans toute l'API** :

| Code | Usage |
|---|---|
| `200` | Succès lecture/mise à jour |
| `201` | Création réussie |
| `204` | Suppression réussie (pas de contenu) |
| `400` | Requête invalide (validation Zod échouée) — `details[]` liste les champs |
| `401` | Non authentifié / token expiré (`code: TOKEN_EXPIRED`) |
| `402` | Fonctionnalité non incluse dans le plan (`code: PLAN_UPGRADE_REQUIRED`) |
| `403` | Authentifié mais permission insuffisante (`code: FORBIDDEN`) |
| `404` | Ressource introuvable **ou** hors du tenant courant (jamais de distinction — anti-IDOR, voir doc 06) |
| `409` | Conflit (ex. transition de statut invalide, ressource déjà verrouillée) |
| `422` | Règle métier violée (ex. stock insuffisant) |
| `429` | Rate limit dépassé |
| `500` | Erreur serveur inattendue (loggée avec `correlationId`, jamais de stacktrace exposée au client) |

- **Pagination — deux modes, précisés suite à la revue d'architecture (doc 19 §19.10, détail complet doc 27 §27.5)** :
  - **Offset** (`?page=1&limit=20`, défaut `limit=20`, max `100`) pour les listes de configuration bornées (`employees`, `rooms`, `tables`, `categories`, `suppliers`, `ingredients`) — permet de sauter directement à une page.
  - **Cursor** (`?cursor=<opaque>&limit=20`, réponse `meta: { nextCursor, hasMore }`) pour les listes à fort volume ou triées par récence : `orders` (historique), `payments` (historique), `notifications`, `audit-logs`, résultats de recherche. Un `skip()` élevé sur ces listes dégraderait les performances de façon croissante avec le volume (doc 27 §27.5) — inacceptable pour une trajectoire à plusieurs milliers de tenants (doc 18).
  - Chaque endpoint de liste ci-dessous précise implicitement son mode via sa nature (listes de configuration = offset, listes transactionnelles/historiques = cursor) ; en cas de doute, se référer au doc 27 §27.5.
- **Filtrage/tri** : `?sort=-createdAt&status=open` — conventions communes documentées une fois, appliquées uniformément par un middleware `parseQuery.middleware.ts`.
- **Idempotence** : les endpoints d'écriture financière (`POST /payments`) acceptent un header `Idempotency-Key` pour éviter un double encaissement en cas de retry réseau.
- **Tous les endpoints ci-dessous sont préfixés `/api/v1` et implicitement protégés par Auth + Tenant Resolver + RBAC (doc 06/07/08) sauf mention explicite "Public".**

## 9.2 Auth

Voir détail complet doc 07 §7.10.

## 9.3 Platform (Super Admin uniquement)

| Méthode | Endpoint | Description | Permission |
|---|---|---|---|
| GET | `/platform/restaurants` | Liste tous les tenants | `platform:manage_restaurants` |
| POST | `/platform/restaurants` | Crée un tenant (provisioning, doc 06 §6.7) | `platform:manage_restaurants` |
| GET | `/platform/restaurants/:id` | Détail d'un tenant | `platform:manage_restaurants` |
| PATCH | `/platform/restaurants/:id/suspend` | Suspend un tenant | `platform:manage_restaurants` |
| PATCH | `/platform/restaurants/:id/reactivate` | Réactive un tenant | `platform:manage_restaurants` |
| DELETE | `/platform/restaurants/:id` | Archive (soft delete) un tenant | `platform:manage_restaurants` |
| GET | `/platform/statistics` | Statistiques cross-tenants (filtrable par `country`) | `platform:view_global_statistics` |
| GET | `/platform/subscriptions` | Vue globale des abonnements | `platform:manage_subscriptions` |
| GET/POST/PATCH | `/platform/subscription-plans` | Gestion complète des plans depuis le dashboard : prix de base, devise de référence, période d'essai, limites, accès par fonctionnalité (doc 35 §35.6) | `platform:manage_subscriptions` |
| GET/POST/PATCH | `/platform/country-defaults` | Gestion de la table de référence pays → devise/langue/fuseau (doc 35 §35.3) | `platform:manage_restaurants` |

## 9.4 Restaurants

| Méthode | Endpoint | Description | Permission |
|---|---|---|---|
| GET | `/restaurants/me` | Détail du tenant courant | `restaurants:read` |
| PATCH | `/restaurants/me` | Mise à jour (nom, horaires, logo, coordonnées) | `restaurants:update` |
| PATCH | `/restaurants/me/settings` | Paramètres avancés | `restaurants:manage_settings` |
| GET | `/restaurants/detect-location` | Détection du pays/ville par géolocalisation IP, à appeler depuis l'écran d'inscription avant soumission (doc 35 §35.2) — pré-remplit sans jamais appliquer silencieusement | Public (non authentifié, rate limité) |

**Paramètres `POST /platform/restaurants`** (création, doc 09 §9.3) inclut désormais `{ country, countryDetectionMethod: "manual"|"geoip" }` obligatoire — `locale`/`currency`/`timezone` dérivés automatiquement depuis `countryDefaults` sauf surcharge explicite (doc 35 §35.3).
**Erreurs spécifiques** : `409 RESTAURANT_LOCKED` si modification concurrente détectée (verrouillage optimiste sur `updatedAt`) ; `400 UNSUPPORTED_COUNTRY` si le pays n'a pas d'entrée dans `countryDefaults` et qu'aucune devise/langue n'est fournie manuellement en repli.

## 9.5 Employees

| Méthode | Endpoint | Description | Permission |
|---|---|---|---|
| GET | `/employees` | Liste paginée, filtrable par `role`, `status` | `employees:read` |
| POST | `/employees` | Invite/crée un employé (membership) | `employees:create` |
| GET | `/employees/:id` | Détail | `employees:read` |
| PATCH | `/employees/:id` | Mise à jour (poste, salaire, statut) | `employees:update` |
| DELETE | `/employees/:id` | Désactive (soft delete du membership) | `employees:delete` |

**Paramètres `POST /employees`** : `{ email, fullName, role, jobTitle?, salary? }` → si l'email n'existe pas dans `users`, un compte est créé et un email d'invitation envoyé (mot de passe initial via lien d'activation, jamais généré en clair côté serveur).
**Erreurs** : `409 EMPLOYEE_LIMIT_REACHED` si `subscriptionPlans.limits.maxEmployees` atteint.

## 9.6 Rooms

| Méthode | Endpoint | Description | Permission |
|---|---|---|---|
| GET | `/rooms` | Liste des salles | `rooms:read` |
| POST | `/rooms` | Création | `rooms:create` |
| PATCH | `/rooms/:id` | Modification | `rooms:update` |
| DELETE | `/rooms/:id` | Suppression (refuse si tables actives liées) | `rooms:delete` |

## 9.7 Tables

| Méthode | Endpoint | Description | Permission |
|---|---|---|---|
| GET | `/tables` | Liste, filtrable par `roomId`, `status` | `tables:read` |
| POST | `/tables` | Création | `tables:create` |
| PATCH | `/tables/:id` | Modification (numéro, capacité, salle) | `tables:update` |
| PATCH | `/tables/:id/status` | Changement de statut | `tables:change_status` |
| DELETE | `/tables/:id` | Suppression | `tables:delete` |
| POST | `/tables/:id/qrcode/regenerate` | Régénère le token QR (invalide l'ancien) | `qrcode:regenerate` |
| GET | `/tables/:id/qrcode` | Retourne l'image QR Code (PNG/SVG) | `tables:read` |

**Erreurs** : `409 TABLE_NUMBER_ALREADY_EXISTS` ; `422 TABLE_LIMIT_REACHED` (plan Starter).

## 9.8 Categories & Menu Items

| Méthode | Endpoint | Description | Permission |
|---|---|---|---|
| GET | `/categories` | Liste ordonnée | `menus:read` |
| POST | `/categories` | Création | `menus:create` |
| PATCH | `/categories/:id` | Modification / réordonnancement | `menus:update` |
| DELETE | `/categories/:id` | Suppression | `menus:delete` |
| GET | `/menu-items` | Liste, filtrable par `categoryId`, `isAvailable` | `menus:read` |
| POST | `/menu-items` | Création (upload photo via `uploads` en amont) | `menus:create` |
| GET | `/menu-items/:id` | Détail | `menus:read` |
| PATCH | `/menu-items/:id` | Modification | `menus:update` |
| PATCH | `/menu-items/:id/availability` | Toggle rapide disponibilité | `menus:toggle_availability` |
| DELETE | `/menu-items/:id` | Suppression | `menus:delete` |

## 9.9 Stock

| Méthode | Endpoint | Description | Permission |
|---|---|---|---|
| GET | `/stock/ingredients` | Liste, filtrable par `belowThreshold=true` | `stock:read` |
| POST | `/stock/ingredients` | Création | `stock:manage_ingredients` |
| PATCH | `/stock/ingredients/:id` | Modification (seuils, fournisseur) | `stock:manage_ingredients` |
| POST | `/stock/movements` | Enregistre un mouvement (in/out/adjustment) | `stock:record_movement` |
| GET | `/stock/movements` | Historique, filtrable par `ingredientId` | `stock:read` |
| GET | `/stock/suppliers` | Liste fournisseurs | `stock:read` |
| POST | `/stock/suppliers` | Création | `stock:manage_suppliers` |

**Erreurs** : `422 INSUFFICIENT_STOCK` renvoyée par le module `orders` (pas `stock` directement) au moment de l'envoi en cuisine si un ingrédient requis est sous le seuil bloquant (règle configurable : bloquant vs alerte simple).

## 9.10 Orders

| Méthode | Endpoint | Description | Permission |
|---|---|---|---|
| GET | `/orders` | Liste, filtrable par `status`, `tableId`, `waiterId`, `dateFrom/dateTo` | `orders:read` |
| POST | `/orders` | Création (ouverture d'une commande sur une table) | `orders:create` |
| GET | `/orders/:id` | Détail complet | `orders:read` |
| POST | `/orders/:id/items` | Ajoute un article | `orders:update` |
| PATCH | `/orders/:id/items/:itemId` | Modifie quantité/notes d'un article (si statut `pending`) | `orders:update` |
| DELETE | `/orders/:id/items/:itemId` | Retire un article (si non envoyé en cuisine, statut `pending`) | `orders:update` |
| POST | `/orders/:id/send-to-kitchen` | Envoie les articles `pending` en cuisine (transition vers `queued`, doc 21 §21.1) | `orders:change_status` |
| POST | `/orders/:id/items/:itemId/cancel` | **Nouveau (cadrage PO 2026-07-13)** : annule un article déjà envoyé en cuisine, uniquement si son statut est `queued` (pas encore pris en charge par la cuisine) | `orders:cancel` |
| PATCH | `/orders/:id/status` | Transition manuelle de statut | `orders:change_status` |
| POST | `/orders/:id/transfer` | Transfère la commande vers une autre table | `orders:transfer_table` |
| POST | `/orders/:id/cancel` | Annule la commande entière (motif requis) | `orders:cancel` |

**Paramètres `POST /orders`** : `{ tableId?, source: "waiter"|"qrcode", customerId? }`.
**Paramètres `POST /orders/:id/items/:itemId/cancel`** : `{ reason: string }` (motif obligatoire, tracé en audit métier doc 24).
**Réponse** : objet `Order` complet (voir doc 05 §5.5).
**Erreurs** : `409 ORDER_ALREADY_OPEN_ON_TABLE` ; `409 INVALID_STATUS_TRANSITION` (machine à état violée, doc 21) ; `409 ITEM_ALREADY_IN_PREPARATION` (tentative d'annulation d'un article déjà `preparing`) ; `422 INSUFFICIENT_STOCK`.
**Concurrence** : `PATCH /orders/:id/status` exige un header `If-Match: <updatedAt>` (verrouillage optimiste) → `409 ORDER_MODIFIED_CONCURRENTLY` si la valeur ne correspond plus. Les opérations sur `items[]` (ajout/retrait/annulation) utilisent des opérations atomiques ciblées sans ce header (doc 05 §5.8, doc 19 §19.4).

## 9.11 Kitchen

| Méthode | Endpoint | Description | Permission |
|---|---|---|---|
| GET | `/kitchen/tickets` | Vue agrégée des commandes actives, triée `priority\|time\|waiter\|table` | `kitchen:read_tickets` |
| PATCH | `/kitchen/tickets/:orderId/items/:itemId/status` | Change le statut d'un article (`preparing`, `ready`) | `kitchen:update_item_status` |

Le détail temps réel (diffusion instantanée sans polling) est dans le doc 10.

## 9.12 Payments

| Méthode | Endpoint | Description | Permission |
|---|---|---|---|
| GET | `/payments` | Liste, filtrable par `orderId`, `method`, `dateFrom/dateTo` | `payments:read` |
| POST | `/payments` | Encaisse tout ou partie d'une commande (header `Idempotency-Key` requis) — supporte le split bill (doc 21 §21.2) | `payments:create` |
| GET | `/payments/:id` | Détail | `payments:read` |
| POST | `/payments/:id/refund` | Remboursement (total ou partiel) | `payments:refund` |
| GET | `/payments/:id/receipt` | Génère/retourne le reçu (PDF) | `payments:print_receipt` |

**Paramètres `POST /payments`** : `{ orderId, method, amount, tipAmount?, tipRecipientId?, splitCount?, coveredItemIds?, providerToken? }`.
- `splitCount` (split égal) et `coveredItemIds` (split par article) sont mutuellement exclusifs — omis tous les deux pour un paiement intégral classique.
- `providerToken` est le jeton retourné par le SDK du prestataire de paiement (Stripe Elements, etc.), jamais un numéro de carte brut (voir doc 13). **En MVP (cadrage PO 2026-07-13), les méthodes `card`/`mobile_money` n'appellent aucune API de prestataire réel** — le caissier confirme manuellement la réception du paiement (`providerToken` absent, `providerRef` renseigné manuellement) ; l'intégration réelle Stripe/Mobile Money arrive en V1 (doc 32 §32.3, doc 34 §34.7) sans changement de contrat pour ce endpoint.
**Erreurs** : `422 AMOUNT_MISMATCH` (montant ≠ part attendue de la commande) ; `422 AMOUNT_EXCEEDS_ORDER_TOTAL` (somme des paiements > `orders.total`, doc 05 §5.5) ; `402 PAYMENT_PROVIDER_DECLINED` (V1+) ; `409 ORDER_ALREADY_PAID`.

## 9.13 Reservations

| Méthode | Endpoint | Description | Permission |
|---|---|---|---|
| GET | `/reservations` | Liste, filtrable par `date`, `status` | `reservations:read` |
| POST | `/reservations` | Création | `reservations:create` |
| PATCH | `/reservations/:id` | Modification | `reservations:update` |
| PATCH | `/reservations/:id/confirm` | Confirmation + assignation de table | `reservations:update` |
| POST | `/reservations/:id/cancel` | Annulation | `reservations:cancel` |
| PATCH | `/reservations/:id/no-show` | Marque comme no-show | `reservations:update` |

**Erreurs** : `409 TABLE_ALREADY_RESERVED` (conflit de créneau, doc 05 index `{tenantId, tableId, dateTime}`).

## 9.14 Customers

| Méthode | Endpoint | Description | Permission |
|---|---|---|---|
| GET | `/customers` | Liste, recherche par `phone`/`email`/`name` | `customers:read` |
| POST | `/customers` | Création | `customers:create` |
| GET | `/customers/:id` | Détail | `customers:read` |
| PATCH | `/customers/:id` | Modification | `customers:update` |
| GET | `/customers/:id/history` | Historique commandes/réservations/dépenses | `customers:view_history` |

## 9.15 Statistics

| Méthode | Endpoint | Description | Permission |
|---|---|---|---|
| GET | `/statistics/dashboard` | KPIs synthétiques du jour | `statistics:view_basic` |
| GET | `/statistics/revenue?period=` | Chiffre d'affaires sur une période | `statistics:view_basic` |
| GET | `/statistics/top-products` | Classement plats | `statistics:view_basic` |
| GET | `/statistics/top-waiters` | Classement serveurs | `statistics:view_advanced` |
| GET | `/statistics/profitability` | Analyse de bénéfice (coût ingrédients vs prix vente) | `statistics:view_advanced` |
| GET | `/statistics/trends?granularity=daily\|monthly` | Évolution dans le temps | `statistics:view_advanced` |

Toutes ces routes lisent en priorité `dailyStatistics` (doc 05) et ne recalculent en direct que la fenêtre "aujourd'hui" non encore agrégée par le worker nocturne (doc 12/18).

## 9.16 Subscriptions & Billing

| Méthode | Endpoint | Description | Permission |
|---|---|---|---|
| GET | `/subscriptions/plans` | Liste des plans disponibles | Public (authentifié) |
| GET | `/subscriptions/me` | Abonnement courant du tenant | `subscriptions:read` |
| PATCH | `/subscriptions/me` | Upgrade/downgrade de plan | `subscriptions:manage` |
| POST | `/subscriptions/me/cancel` | Résiliation (effective en fin de période) | `subscriptions:manage` |
| GET | `/billing/invoices` | Historique de facturation SaaS | `billing:read` |
| GET | `/billing/payment-methods` | Moyens de paiement enregistrés | `billing:read` |
| POST | `/billing/payment-methods` | Ajoute un moyen de paiement | `billing:manage_payment_method` |

## 9.17 Notifications

| Méthode | Endpoint | Description | Permission |
|---|---|---|---|
| GET | `/notifications` | Liste, filtrable par `isRead` | `notifications:read` |
| PATCH | `/notifications/:id/read` | Marque comme lue | `notifications:read` |
| PATCH | `/notifications/read-all` | Marque tout comme lu | `notifications:read` |
| GET | `/notifications/preferences` | Préférences courantes | `notifications:manage_preferences` |
| PATCH | `/notifications/preferences` | Mise à jour des préférences | `notifications:manage_preferences` |

## 9.18 Audit Logs

| Méthode | Endpoint | Description | Permission |
|---|---|---|---|
| GET | `/audit-logs` | Liste filtrable par `resource`, `actorId`, `dateFrom/dateTo` | `audit-logs:read` |

## 9.19 Uploads

| Méthode | Endpoint | Description | Permission |
|---|---|---|---|
| POST | `/uploads` | Upload multipart (retourne l'URL Firebase) | Authentifié (toute permission de création du module appelant) |
| DELETE | `/uploads/:fileId` | Suppression d'un fichier | Authentifié + propriétaire de la ressource associée |

**Validations** : type MIME whitelist (`image/png`, `image/jpeg`, `image/webp`), taille max 5 Mo, scan antivirus optionnel en Phase ultérieure (voir doc 18).

## 9.20 Endpoints publics (QR Code — non authentifiés)

Préfixe distinct : `/api/v1/public/qr/:qrCodeToken/...`. Rate limiting renforcé (doc 13), résolution de tenant via `publicTenant.middleware.ts` (doc 06).

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/public/qr/:token/menu` | Menu complet du restaurant (catégories + produits disponibles) |
| POST | `/public/qr/:token/orders` | Le client passe une commande directement (si `restaurants.settings.allowCustomerOrdering`) |
| GET | `/public/qr/:token/orders/:orderId` | Suivi du statut de sa commande |
| POST | `/public/qr/:token/call-waiter` | Déclenche une notification temps réel "appel serveur" |
| POST | `/public/qr/:token/request-bill` | Déclenche une notification "demande d'addition" |
| POST | `/public/qr/:token/reviews` | Laisse un avis (soumis à modération, `reviews.isPublished = false` par défaut) |

**Erreurs spécifiques** : `410 QR_CODE_REVOKED` (token régénéré) ; `423 TABLE_OUT_OF_SERVICE`.
