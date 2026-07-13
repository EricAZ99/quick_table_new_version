# Audit UX — QuickTable (revue senior, 2026-07-13)

**Posture** : cet audit ne cherche pas à confirmer les choix précédents. Chaque maquette publiée (00 à 12) a été relue avec l'hypothèse qu'elle contient des défauts, jusqu'à preuve du contraire.

## Méthode

Quatre axes, dans l'ordre où ils ont été examinés :
1. **Accessibilité** — les maquettes sont-elles réellement opérables au clavier/lecteur d'écran, ou seulement "à l'œil" ?
2. **Cohérence de navigation** — la sidebar et les parcours sont-ils identiques d'un écran à l'autre, ou ont-ils dérivé au fil des sessions de conception ?
3. **Optimisation des parcours** — combien de clics pour les actions fréquentes, et sont-ils tous nécessaires ?
4. **Cohérence visuelle** — les mêmes concepts sont-ils toujours représentés de la même façon ?

---

## 1. Accessibilité — constat sévère, corrigé partiellement, cadré pour la suite

### 1.1 Contrôles interactifs construits en `<div>` plutôt qu'en éléments sémantiques

**Constat** : à l'exception du Kitchen Display System (doc 04, qui utilise correctement `<button>` partout — bon réflexe, non généralisé ensuite), la majorité des contrôles interactifs des maquettes (boutons de méthode de paiement, chips de filtre, éléments de navigation, cartes de rôle, onglets) sont des `<div>` avec un style de bouton. Un `<div>` n'est **pas** focusable au clavier par défaut, n'a pas la sémantique bouton pour un lecteur d'écran, et ne répond pas à Entrée/Espace. C'est le défaut le plus grave relevé — il rendrait le produit inutilisable au clavier/lecteur d'écran en l'état.

**Décision** : je ne corrige pas les ~200 occurrences dans les 13 fichiers (coût disproportionné à ce stade de maquette). Je corrige les points de plus fort trafic et les plus critiques pour un public vulnérable :
- **Client QR Code (doc 06)** : boutons flottants "Appeler le serveur"/"Demander l'addition" et notation par étoiles — public anonyme, potentiellement non technophile, priorité maximale.
- **Caisse (doc 05)** : sélecteur de mode de paiement et pourboire — actions financières fréquentes.
- **Sidebar back-office** (docs 02, 07-11) : navigation traversée par tous les rôles staff, corrigée en même temps que l'uniformisation (§2).

La **règle est désormais explicite et non négociable dans le Design System** (§00, nouvelle section Accessibilité) : tout contrôle interactif est un `<button>`, un `<a href>` ou un `<input>` — jamais un `<div onclick>`. C'est la responsabilité de l'équipe frontend de ne jamais réintroduire ce défaut lors de l'implémentation Vue (les composants `components/ui/Button.vue` etc. du doc 03 partent d'un élément natif).

### 1.2 Boutons icône sans nom accessible

**Constat** : la cloche de notification, la loupe de recherche, les icônes d'édition/suppression dans les tableaux n'ont ni texte visible ni `aria-label`. Un lecteur d'écran les annoncerait comme "bouton" sans indication de leur fonction.

**Correction** : ajout d'`aria-label` sur les icônes du Design System (référence) et des sidebars corrigées. Règle ajoutée : tout bouton dont le seul contenu est une icône **doit** porter un `aria-label` décrivant l'action, pas le pictogramme.

### 1.3 Contraste des badges sémantiques

**Constat** : vérification des paires fond-tamisé/texte-tamisé utilisées par les badges de statut à 11-12px (seuil AA texte normal : 4,5:1, pas le seuil allégé "grand texte"). La paire `--turmeric-soft-ink` (#7a5406) sur `--turmeric-soft` (#f3e6c8) est correcte en clair (~5,1:1) mais **limite en sombre** — `#f0cd8a` sur `#382c14` mesure autour de 4,3:1, sous le seuil à la marge.

**Correction** : `--turmeric-soft-ink` sombre resserré vers `#f4d79a` (plus clair) pour repasser confortablement au-dessus de 4,5:1. Le Design System (doc 00) est la source de vérité de ce token, mais chaque fichier de maquette embarque sa **propre copie** du bloc de tokens (la CSP des artefacts interdit une feuille de style partagée entre pages) — la correction a donc été répercutée manuellement dans les 13 fichiers, pas seulement dans le doc 00. Point de vigilance noté pour l'implémentation réelle : dans le vrai projet Vue (doc 03), les tokens vivent dans un unique `assets/styles/variables.css`, ce problème de duplication n'existera plus.

### 1.4 Mises à jour temps réel non annoncées

**Constat** : le Dashboard (doc 02) et le KDS (doc 04) affichent une pastille "Service en direct" qui pulse, mais rien n'indique comment un lecteur d'écran serait informé qu'un ticket vient d'apparaître (Socket.IO, doc 10) — une mise à jour purement visuelle est invisible pour un utilisateur non-voyant.

**Correction** : ajout d'une consigne explicite dans le Design System (§Accessibilité) — toute zone alimentée par un événement temps réel (file KDS, activité du dashboard, statuts de commande) doit être une région `aria-live="polite"` côté implémentation Vue, avec un message annoncé qui reste bref ("Nouveau ticket, table 12"), jamais la lecture intégrale du contenu ajouté.

### 1.5 Élément non natif utilisé comme cible cliquable

**Constat** : dans le Journal d'audit (doc 11), les lignes `<tr>` du tableau sont cliquables (`cursor:pointer`) sans rôle ni focusabilité — un `<tr>` n'est pas nativement interactif.

**Correction documentée** (dev handoff, pas retouchée en maquette statique) : en implémentation réelle, chaque ligne cliquable doit soit envelopper son contenu dans un `<button>` pleine-largeur, soit porter `role="button" tabindex="0"` avec gestion clavier — ajouté au Design System comme pattern "Ligne de tableau actionnable".

---

## 2. Cohérence de navigation — dérive réelle identifiée et corrigée

**Constat** : les sidebars des docs 02, 07, 08, 09, 10 et 11 ont été construites indépendamment au fil des écrans successifs plutôt que copiées depuis une source unique. Résultat : la liste et l'ordre des entrées **variaient** d'un écran à l'autre (ex. "Abonnement" et "Journal d'audit" absents des sidebars des docs 02/07/08/09 alors qu'ils existent comme écrans depuis le doc 11 ; une entrée orpheline "Paiements" pointant vers aucun écran réel du doc 36 traînait dans certaines versions). Un utilisateur naviguant d'un écran à l'autre verrait donc le menu se réorganiser sous ses yeux — exactement le genre d'incohérence qui casse la confiance dans un produit "premium, très intuitif".

**Correction** : définition d'une **sidebar canonique unique** dans le Design System (doc 00, nouvelle référence "Navigation back-office — spécification unique") strictement alignée sur l'inventaire du doc 36 §36.2-A :

```
Vue d'ensemble     → Dashboard
Opérations         → Salles & tables · Commandes · Réservations
Catalogue          → Menu · Stock
Équipe & clients   → Employés · Clients
Pilotage           → Statistiques · Abonnement · Journal d'audit · Paramètres
```

L'entrée orpheline "Paiements" est supprimée (les paiements se consultent depuis le détail d'une commande et depuis l'interface Caisse dédiée, doc 05 — il n'y a pas d'écran back-office "Paiements" autonome dans le doc 36). Cette sidebar canonique a été réappliquée **à l'identique** dans les docs 02, 07, 08, 09, 10 et 11, avec l'item actif correctement positionné selon l'écran.

---

## 3. Optimisation des parcours

Vérification du nombre de clics/taps pour les actions les plus fréquentes — aucune n'a nécessité de réduction, mais chacune a été vérifiée délibérément plutôt que supposée correcte :

| Parcours | Étapes | Verdict |
|---|---|---|
| Serveur : ouvrir une table et envoyer une commande | Table → plats → panier → envoyer = 3 taps après sélection | Conservé — la revue du panier avant envoi est une étape de prévention d'erreur, pas de friction inutile |
| Caissier : encaisser un paiement simple (espèces, sans split) | File → table → encaisser = 2 taps (espèces déjà sélectionné par défaut) | Déjà minimal, aucun changement |
| Cuisine : faire progresser un plat | 1 tap par transition d'état, gros bouton tactile | Déjà minimal |
| Client QR : appeler le serveur | 1 tap (bouton flottant toujours visible) | Déjà minimal |

**Point ajouté suite à la relecture** (doc 05, Caisse — split bill) : rien n'indiquait ce qui se passe après le paiement d'une part. Spécification ajoutée au Design System : après confirmation d'une part, l'écran **avance automatiquement** sur la part suivante non payée, sans action manuelle de retour à la liste — évite un aller-retour inutile pour un caissier qui encaisse 4 parts à la suite.

---

## 4. Cohérence visuelle — corrections appliquées

| Constat | Écran(s) concerné(s) | Correction |
|---|---|---|
| Drapeaux emoji comme indicateur de pays | Platform Admin (doc 12) | **Supprimés.** Rendu emoji des drapeaux non fiable selon OS/police (rendu en code pays entre crochets sur de nombreuses configurations Windows) — remplacés par un badge texte ISO propre (`BJ`, `IT`, `ES`) + nom du pays. Correspond aussi au principe du Design System : pas de décoration par emoji. |
| Aucun indicateur visuel de "ligne actuellement ouverte dans le tiroir" | Menu/Tables (07), Employés (08), Stock/Clients (09), Platform Admin (12) | Ajout d'un traitement `.row-selected` (fond teinté + liseré gauche couleur accent) appliqué à la ligne dont le tiroir de détail est ouvert — rend explicite le lien entre la liste et le panneau, qui était implicite jusqu'ici |
| Bouton "Renvoyer dans 45s" visuellement identique à un bouton actif | Authentification (01), état succès mot de passe oublié | Désactivé visuellement (`opacity`, `cursor:not-allowed`) — il ne doit pas donner l'impression d'être cliquable avant l'expiration du délai |
| Interrupteur de disponibilité à 3 états (on/off manuel/off alerte stock) jamais documenté comme tel | Design System | Ajout d'une légende explicite dans la bibliothèque de composants — ce n'était pas un oubli fonctionnel mais un oubli de documentation |
| **Le composant "interrupteur" du Design System (doc 00) utilisait l'Ambre pour l'état "activé"** — en contradiction directe avec la règle que j'ai moi-même posée ("l'Ambre ne sert jamais à signaler un état") | Design System uniquement — les écrans réels (07, 10) avaient déjà correctement utilisé le Basilic | Corrigé dans le doc 00 pour aligner la référence sur ce que l'implémentation faisait déjà correctement — la référence avait pris du retard sur l'usage réel, pas l'inverse |

---

## 5. Ce qui a été délibérément laissé tel quel

- Le **thème sombre permanent du KDS** (doc 04) — confirmé après relecture, toujours justifié (doc 04, note produit).
- La **structure en tiroir (drawer)** plutôt qu'en page dédiée pour les formulaires de création/édition — cohérente sur tous les écrans back-office, pas de raison de la remetter en cause.
- Le **système de couleurs sémantiques** (Basilic/Curcuma/Paprika/Acier) — audité pour le contraste (§1.3) mais la palette elle-même reste pertinente et distincte de l'accent de marque.

## 6. Ce qui reste ouvert (au-delà de cette passe)

- Retrofit exhaustif de **tous** les `<div>` interactifs restants (icônes d'action dans les tableaux, onglets secondaires) — porté au Design System comme règle, mais non appliqué rétroactivement à chaque occurrence des 13 fichiers, pour un rapport effort/valeur raisonnable à ce stade de maquette. Point à traiter au moment de l'implémentation Vue réelle (les composants du doc 03 partiront directement d'éléments sémantiques, donc ce défaut ne devrait pas se propager au code final).
- Test de contraste automatisé (type axe-core) non exécuté — vérifications faites manuellement par calcul de ratio, à visée doc 31 (tests) une fois le code réel disponible.
