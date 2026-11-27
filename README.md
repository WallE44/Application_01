# Application_01 · Pluie Trajet

Application web installable (PWA) pour Android (Samsung S21 Ultra) qui répond chaque matin à une question : **faut-il prendre ses vêtements de pluie pour l'aller et le retour du travail ?**

- Trajet A → B saisi par adresse, sur la carte ou par « ma position » ; horaires matin et soir ; jours de travail.
- Mode à pied, trottinette, vélo (vitesses réglées par l'admin) ou vitesse manuelle.
- Météo Open-Meteo en A, à mi-parcours et en B, à l'heure de passage, à l'aller et au retour.
- Verdict à 3 niveaux (pas nécessaire, conseillée, indispensable), risque de pluie maximal, conseil gants hiver ou été.
- Notification quotidienne (7h30 par défaut), fonctionnement hors-ligne avec la dernière prévision horodatée.
- Deux profils : administrateur (paramètres, comptes, journaux) et utilisateur.
- Sans serveur : toutes les données restent sur le téléphone. Français, unités métriques, thème sombre.

Documents de référence : EDB v0.1 et SDB v0.2 (validées le 26/11/2026), [cahier de développement](docs/cahier-de-dev.md), [cahier de recette](docs/cahier-de-recette.md).

## Utiliser l'application

1. Ouvrir l'adresse GitHub Pages du dépôt dans **Chrome** sur le téléphone.
2. Menu ⋮ → **Ajouter à l'écran d'accueil** → **Installer**.
3. Au premier lancement, créer le compte administrateur, puis renseigner « Mon trajet ».
4. Dans « Préférences », activer les notifications.

## Mot de passe administrateur oublié

L'application n'a pas de serveur : aucun mot de passe ne peut être récupéré ni réinitialisé à distance. S'il n'existe pas d'autre compte administrateur :

1. Dans Chrome sur le téléphone, ouvrir l'adresse de l'application, puis ⋮ → **Paramètres** → **Paramètres des sites** → **Toutes les données des sites**.
2. Rechercher `walle44.github.io`, puis **Effacer et réinitialiser**.
3. Rouvrir l'application : l'écran de premier lancement réapparaît. Créer de nouveau le compte administrateur, puis ressaisir le trajet et les paramètres (tout a été effacé).

Conseil : créer un second compte administrateur de secours, ou noter le mot de passe dans un gestionnaire de mots de passe.

## Limites connues (v1)

- Les droits administrateur sont contrôlés par l'application sur le téléphone. Une personne ayant le téléphone déverrouillé et les outils de développement de Chrome pourrait les contourner. Risque accepté pour la v1 (Roland, 27/11/2026) ; point majeur des versions suivantes.

## Développement

Aucune dépendance de production, aucun outil de compilation : les fichiers de `app/` sont servis tels quels.

```bash
npm start              # serveur local sur http://127.0.0.1:8080/
npm run test:unit      # tests unitaires + couverture 100 % exigée sur les règles de calcul
npm run test:e2e       # tests fonctionnels dans Chromium (viewport S21 Ultra), services externes simulés
npm test               # les deux
```

Les tests fonctionnels utilisent Playwright (`npm install --no-save playwright` puis `npx playwright install chromium` si besoin).

| Dossier | Contenu |
| --- | --- |
| `app/js/core/` | Règles métier pures (RG-01 à RG-08), météo, adresses, comptes, journaux, stockage |
| `app/js/ui/` | Écrans et navigation |
| `app/sw.js` | Service worker : hors-ligne et notification en arrière-plan |
| `app/vendor/leaflet/` | Carte Leaflet 1.9.4 (licence BSD-2) |
| `tests/unit/`, `tests/e2e/` | Tests unitaires et fonctionnels |
| `docs/` | Cahier de développement et captures d'écran |

## Publication

Le workflow `.github/workflows/ci-pages.yml` lance les tests à chaque pull request et publie `app/` sur GitHub Pages à chaque fusion sur `main`. Activation unique : **Settings → Pages → Source : GitHub Actions**.
