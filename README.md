# Budget – Dépenses fixes

Petite PWA pour voir ses dépenses fixes (abonnements, loyer, assurances…) et **ce qu'il faut prévoir ce mois-ci ou le mois prochain**, pour ne rien oublier.

## Fonctionnalités

L'app sépare clairement deux choses, chacune dans son onglet :

### 🔁 Abonnements (ce qui revient)
- Mensuels, trimestriels, semestriels ou annuels, avec date de fin optionnelle.
- **Ce mois / Mois prochain** : les prélèvements du mois, le total, ce qui est payé et ce qu'il reste à payer, et un total par catégorie.
- Alerte quand un abonnement non mensuel (assurance annuelle, taxe…) tombe dans le mois.
- **Tous** : la liste complète avec le coût moyen par mois et par an.

### 📅 À prévoir (dépenses ponctuelles)
- Une dépense unique à une date (contrôle technique, cadeau, vacances…).
- Regroupées par mois (ce mois-ci, mois prochain, plus tard) avec le total de chaque mois et le reste à payer.
- Les dépenses passées sont repliées.

### Pour les deux
- **Payé automatiquement** : une échéance se coche toute seule le jour où sa date arrive (on peut la décocher ou la cocher en avance à la main).
- **Catégories personnalisées** : tu crées les tiennes (nom, emoji, couleur) dans Réglages ou directement depuis le formulaire.
- **Hors-ligne** et installable sur l'écran d'accueil.
- **Données stockées uniquement sur le téléphone** (aucun compte, aucun serveur), avec export / import JSON pour les sauvegarder.

## Mise en ligne avec GitHub Pages

1. Sur GitHub : **Settings → Pages**.
2. *Source* : **Deploy from a branch**, choisir la branche `main` et le dossier `/ (root)`, puis **Save**.
3. Après une minute, l'app est disponible sur `https://<utilisateur>.github.io/budget/`.

## Installer sur le téléphone

- **iPhone** : ouvrir l'adresse dans Safari → bouton Partager → « Sur l'écran d'accueil ».
- **Android** : ouvrir dans Chrome → menu ⋮ → « Installer l'application ».

## Développement

Aucune dépendance ni étape de build : HTML, CSS et JavaScript.

```sh
python3 -m http.server 8000   # puis ouvrir http://localhost:8000
```

Après une modification des fichiers, incrémenter `CACHE` dans `sw.js` pour que les téléphones récupèrent la nouvelle version.
