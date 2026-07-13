# 13. Sécurité

## 13.1 Couverture OWASP Top 10 (2021) — mapping QuickTable

| Risque OWASP | Mesure QuickTable |
|---|---|
| A01 Broken Access Control | RBAC multi-couches (doc 08) + isolation multi-tenant à 3 lignes de défense (doc 06) + tests d'isolation CI |
| A02 Cryptographic Failures | Argon2id pour mots de passe, AES-256-GCM pour secrets 2FA, TLS partout (HTTPS forcé), aucune donnée de carte stockée |
| A03 Injection | Mongoose (requêtes paramétrées, jamais de concaténation), `express-mongo-sanitize` contre l'injection d'opérateurs Mongo (`$where`, `$gt` via body), validation stricte Zod sur tout input |
| A04 Insecure Design | Ce dossier d'architecture lui-même — menace modélisée dès la conception (doc 01 §1.5 Risques), pas après coup |
| A05 Security Misconfiguration | `helmet()`, CORS whitelist stricte, headers de sécurité, `env.ts` fail-fast (doc 12 §12.9), pas de mode debug en production |
| A06 Vulnerable/Outdated Components | `npm audit`/Dependabot en CI, gel des versions majeures, revue mensuelle des dépendances |
| A07 Identification & Authentication Failures | JWT + refresh rotatif + 2FA obligatoire pour rôles sensibles (doc 07), rate limiting login |
| A08 Software & Data Integrity Failures | CI avec build reproductible, signatures de commit recommandées, migrations versionnées et revues |
| A09 Security Logging & Monitoring Failures | Audit trail immuable (doc 05/06), logs structurés + corrélation (doc 12), alerting Sentry |
| A10 Server-Side Request Forgery | Aucun endpoint ne récupère une URL arbitraire fournie par l'utilisateur (uploads passent par Firebase SDK, pas de fetch d'URL externe côté serveur sur input utilisateur) |

## 13.2 Rate limiting

Plusieurs niveaux, tous basés sur Redis (`rate-limit-redis` + `express-rate-limit`) pour rester cohérents en multi-instance (doc 02) :

| Portée | Limite indicative | Fenêtre |
|---|---|---|
| Global par IP | 300 req | 1 min |
| `/auth/login` par `(email, IP)` | 5 tentatives, verrouillage progressif | 15 min |
| `/auth/forgot-password` par IP | 3 | 1 h |
| Routes publiques `/public/qr/*` par IP | 60 req | 1 min |
| `POST /public/qr/:token/orders` par table | 10 commandes | 10 min |
| Par tenant (protection "noisy neighbor", doc 06 §6.6) | seuil configurable selon plan | 1 min |

Réponse standard `429` avec header `Retry-After`.

## 13.3 En-têtes et transport

- **Helmet** activé avec configuration stricte : `Content-Security-Policy` (whitelist des origines Vercel/Firebase/prestataire de paiement uniquement), `X-Frame-Options: DENY` (anti-clickjacking), `Strict-Transport-Security` (HSTS, `max-age` long, `includeSubDomains`).
- **CORS** : whitelist explicite des origines frontend (`app.quicktable.io`, domaines de preview Vercel via pattern contrôlé), jamais `origin: '*'` sur les routes authentifiées. Les routes publiques QR Code peuvent avoir une politique CORS plus ouverte mais restent protégées par le rate limiting dédié.
- **HTTPS forcé** de bout en bout (Vercel/Railway/Atlas le fournissent nativement) ; redirection HTTP→HTTPS au niveau infrastructure.

## 13.4 Validation et sanitization

- **Zod** comme unique bibliothèque de validation, appliquée à *tous* les inputs (body, query, params) via `validate.middleware.ts` (doc 12) — aucune route n'accède à `req.body` brut.
- **`express-mongo-sanitize`** pour retirer les clés commençant par `$` ou contenant `.` dans les objets entrants, protection contre l'injection d'opérateurs MongoDB.
- **Échappement systématique côté rendu** assuré nativement par Vue (pas de `v-html` sur du contenu utilisateur non filtré — règle ESLint dédiée côté frontend) contre le XSS stocké (ex. commentaire d'avis client, doc 04 module `reviews`).
- **Limite de taille de payload** (`express.json({ limit: '1mb' })`, plus restrictif sur les routes publiques) contre les attaques par payload surdimensionné.

## 13.5 Protection CSRF

Le modèle d'authentification (Access Token en mémoire côté client, jamais en cookie lisible ; Refresh Token en cookie `httpOnly` + `SameSite=Strict`) réduit fortement la surface CSRF : un cookie `SameSite=Strict` n'est pas envoyé sur une requête cross-site initiée par un tiers. En complément, toute route d'état-mutant sensible (paiement, changement de mot de passe) vérifie un header custom (`X-Requested-With`) que seul un appel JavaScript same-origin peut poser facilement, en défense en profondeur.

## 13.6 Chiffrement

- **En transit** : TLS 1.2+ partout (front↔back, back↔MongoDB Atlas, back↔Redis, back↔Firebase).
- **Au repos** : chiffrement natif MongoDB Atlas + Firebase Storage. Champs additionnels chiffrés applicativement : `users.twoFactorSecret` (AES-256-GCM, clé de chiffrement applicative stockée hors base, rotation documentée).
- **Aucune donnée de paiement sensible** (PAN, CVV, date d'expiration) ne transite ni ne persiste sur les serveurs QuickTable — uniquement des jetons émis par le prestataire de paiement (Stripe Elements ou équivalent), condition nécessaire pour rester **hors du périmètre PCI-DSS complet (SAQ A)**.

## 13.7 Audit et journalisation

- Collection `auditLogs` (doc 05) append-only, alimentée automatiquement par le plugin `auditable` (doc 12 §12.7) pour toute mutation sur les ressources sensibles (`employees`, `payments`, `subscriptions`, `settings`, `restaurants`).
- Rétention minimale de 12 mois (ajustable par obligation légale locale), export possible par tenant (doc 06 §6.5).
- Alerting temps réel (via le worker de notification) sur des patterns suspects : multiples échecs de login, remboursements anormalement fréquents par un même caissier, changement de rôle vers `restaurant_owner`.

## 13.8 Sécurité de l'espace public (QR Code)

Surface d'attaque distincte à traiter avec un niveau de suspicion plus élevé que le back-office (doc 06 §6.2, doc 09 §9.20) :
- Rate limiting dédié, plus strict (§13.2).
- Aucune information sensible exposée dans la réponse `GET /public/qr/:token/menu` (pas de coût, pas de marge, pas de données d'un autre client).
- Le `qrCodeToken` est un identifiant opaque haute entropie, régénérable à tout moment (`POST /tables/:id/qrcode/regenerate`) en cas de suspicion de fuite/impression frauduleuse.
- Toute commande créée depuis l'espace public passe par les **mêmes validations métier** (stock, disponibilité) que côté staff — aucun raccourci de validation pour "juste un client".

## 13.8bis Secrets Management (ajouté suite à la revue d'architecture, doc 19 §19.11-17)

Gap identifié lors de la revue : la gestion des secrets (clé de signature JWT, credentials MongoDB/Redis/Firebase, clés du prestataire de paiement, clé de chiffrement `twoFactorSecret`) n'était mentionnée qu'en creux (doc 12 §12.9). Politique formalisée :

- **Aucun secret en clair dans le dépôt Git**, même chiffré (pas de fichier `.env` commité) — vérifié par un scanner automatisé (`gitleaks`) en CI, bloquant (doc 31 §31.5).
- **Stockage** : variables d'environnement injectées par la plateforme d'hébergement (Vercel/Railway secrets), pas de fichier de configuration partagé entre développeurs par email/chat.
- **Rotation** : la clé de signature JWT et la clé de chiffrement applicative (`twoFactorSecret`, doc 13 §13.6) doivent pouvoir être rotées sans interruption de service — implique un support de **double clé active** transitoire côté vérification (l'ancienne clé reste valide en lecture pendant une fenêtre de transition après émission de la nouvelle).
- **Séparation des environnements** : secrets strictement distincts entre `dev`/`staging`/`production`, aucune credential de production n'existe en local développeur.
- **Accès restreint** : les secrets de production ne sont accessibles qu'à un nombre minimal de personnes (Tech Lead + astreinte), via le contrôle d'accès natif de Railway/Vercel — pas de partage informel.
- **Outil retenu pour le palier V1.5** (doc 32 §32.4, décision Product Owner du 2026-07-13, budget serré priorisé pour un lancement bootstrap) : **Infisical** (gestionnaire de secrets open source, plan gratuit couvrant les besoins d'une équipe réduite) dès que le nombre de secrets/environnements rend la gestion manuelle via les dashboards Railway/Vercel source d'erreur. Migration réévaluable vers Doppler/HashiCorp Vault si le volume ou les exigences de conformité dépassent le plan gratuit d'Infisical.

## 13.9 Sécurité organisationnelle et process

- **Revue de code obligatoire** sur toute PR touchant `middlewares/`, `modules/*/[...].service.ts` en lien avec paiement/permissions, ou `database/models/plugins/`.
- **Scan de dépendances automatisé** (Dependabot/Snyk) en CI, bloquant sur vulnérabilité critique.
- **Tests d'isolation multi-tenant** (doc 06 §6.4) et **tests de permissions RBAC** (doc 16) exécutés à chaque PR, non contournables (branch protection).
- **Plan de réponse à incident** documenté (doc 17) : qui prévenir, comment révoquer des sessions massivement, comment communiquer à un tenant affecté.
- **Divulgation responsable** : une adresse `security@quicktable.io` et une politique de disclosure publiée dès l'ouverture commerciale du produit.
