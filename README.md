# Budget – Dépenses fixes

Petite PWA pour voir ses dépenses fixes (abonnements, loyer, assurances…) et **ce qu'il faut prévoir ce mois-ci ou le mois prochain**, pour ne rien oublier.

## Fonctionnalités

- **Vue du mois** : toutes les échéances du mois, triées par date, avec le total, ce qui est déjà payé et ce qu'il reste à payer.
- **Mois prochain** en un clic, et navigation libre entre les mois.
- **Alerte « à prévoir »** quand une dépense non mensuelle (annuelle, trimestrielle, ponctuelle) tombe dans le mois.
- **Payé automatiquement** : une échéance se coche toute seule le jour où sa date arrive (on peut la décocher ou la cocher en avance à la main).
- **Fréquences** : mensuelle, trimestrielle, semestrielle, annuelle ou ponctuelle (avec date de fin optionnelle).
- **Catégories personnalisées** : tu crées les tiennes (nom, emoji, couleur) dans Réglages ou directement depuis le formulaire, avec totaux par catégorie.
- **Vue « Mes dépenses »** : coût fixe moyen par mois et par an, prochaine échéance de chaque dépense.
- **Hors-ligne** et installable sur l'écran d'accueil.
- **Données stockées uniquement sur le téléphone** (aucun compte, aucun serveur), avec export / import JSON pour les sauvegarder.

## Mise en ligne avec GitHub Pages

1. Sur GitHub : **Settings → Pages**.
2. *Source* : **Deploy from a branch**, choisir la branche et le dossier `/ (root)`, puis **Save**.
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
