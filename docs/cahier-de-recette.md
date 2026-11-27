# Application_01 · Cahier de recette v1.1

Version 1.1 du 27/11/2026 · Recetteur : Rec_A · Pilote : manager_A · Demandeur : Roland

## 1. Objet et périmètre

Recette de l'application « Pluie Trajet » (PWA, dépôt WallE44/Application_01, branche `main` après fusion de la PR 1, commit `2a154c6`) sous quatre angles : technique, sécurité, fonctionnel et métier. Le recetteur se place comme un utilisateur exigeant : un test qui « passe » mais dont le résultat gênerait au quotidien est signalé.

Référentiels :

| Document | Version | Lien |
| --- | --- | --- |
| EDB (étude du besoin) | v0.1 validée | https://claude.ai/artifact/BfbiKQfGSsiJG4pE8W7iY6 |
| SDB (spécification du besoin) | v0.2 validée (EXG-11 « au mieux ») | https://claude.ai/artifact/25djuYQWkUoX82ks7Ey8BM |
| Cahier de développement | v1.0 | docs/cahier-de-dev.md |

## 2. Environnement de recette

| Élément | Valeur |
| --- | --- |
| Environnement de dev | Serveur local `npm start`, Chromium (Playwright 1.63), écran S21 Ultra simulé 384 × 854, fr-FR, Europe/Paris |
| Horloge | Figée par test (ex. vendredi 27/11/2026 07:00) pour rendre les cas reproductibles |
| Services externes | Simulés dans les tests automatiques (l'environnement cloud n'a pas accès à Internet) |
| Services réels | Vérifiés le 26/11/2026 depuis le navigateur intégré de l'ordinateur de Roland : Open-Meteo (3 points), API Adresse, Géoplateforme (recherche et inverse) |
| Mise en ligne GitHub Pages | Non disponible : le déploiement du 26/11 à 23:37 a échoué, la source Pages n'étant pas encore réglée sur « GitHub Actions » |

Rejouer la recette : `npm run test:unit`, `npm run test:e2e`, puis `TZ=Europe/Paris node --test --test-concurrency=1 tests/recette/*.test.mjs` (la liste des constats s'affiche en fin d'exécution).

## 3. Synthèse

| Indicateur | Résultat |
| --- | --- |
| Tests unitaires de Dev_A rejoués | 56 / 56 OK, couverture 100 % des règles de calcul (ENF-08) |
| Tests fonctionnels de Dev_A rejoués | 20 / 20 OK |
| Cas de recette (Rec_A) | 38 cas : 23 OK, 5 KO, 10 réserves |
| Anomalies | 3 majeures (dont 1 limite d'architecture à arbitrer), 6 mineures, 1 évolution |
| Points à arbitrer avec Roland (via manager_A) | 4 |
| Tests à faire sur le S21 Ultra | 13 |

**Mise à jour v1.1 (27/11/2026) : après corrections, toutes les anomalies retenues sont corrigées et vérifiées (section 9). Avis : recette technique, sécurité et fonctionnelle prononcée sur l'environnement de dev ; la validation finale attend les tests sur le S21 Ultra (section 7).**

Avis initial v1.0 : recette NON prononcée, avec réserves. Le cœur métier est juste : les règles RG-01 à RG-08 donnent le bon verdict aux bornes, les profils sont séparés à l'écran, les mots de passe sont correctement hachés et aucun texte externe n'est injecté dans la page. Deux anomalies majeures doivent être corrigées avant la mise en service : un paramètre admin vidé est enregistré à 0 sans prévenir (ANO-01, fausse alerte pluie tous les jours), et une nouvelle version de l'application n'arrive pas sur le téléphone tant que le numéro de cache n'est pas changé à la main (ANO-03, les corrections futures risquent de ne jamais être livrées). Les tests sur le téléphone restent à faire.

## 4. Cas de tests

Statuts : OK conforme · KO anomalie · RÉS réserve (conforme à la SDB mais gênant pour l'utilisateur, ou à confirmer sur le téléphone).

### 4.1 Technique

| ID | Exigence | Scénario | Attendu | Résultat | Statut |
| --- | --- | --- | --- | --- | --- |
| REC-T01 | ENF-03 | Parcours complet, contrôle des scripts et des requêtes | Aucun script en ligne, aucune violation CSP, aucune requête en HTTP | Conforme | OK |
| REC-T02 | ENF-08 | Rejouer `npm run test:unit` | 56 OK, couverture 100 % | 56 OK, 100 % lignes, branches, fonctions | OK |
| REC-T03 | Toutes | Rejouer `npm run test:e2e` | 20 OK | 20 OK | OK |
| REC-T04 | RG-03 | Appel réel Open-Meteo (3 points Nantes, 3 jours) | Format lu par l'app : 3 séries de 72 h, aucune valeur manquante, fuseau Europe/Paris | Conforme ; Open-Meteo arrondit lui-même les points à sa grille (≈ 0,02°) | OK |
| REC-T05 | EXG-04 | Appels réels API Adresse et Géoplateforme depuis une autre origine (CORS) | Réponses 200, libellé « Place Royale 44000 Nantes » | Conforme, y compris le repli Géoplateforme | OK |
| REC-T06 | ENF-05 | Mise à jour de l'app : modifier un écran sans changer `VERSION` dans `sw.js`, recharger 3 fois | La nouvelle version s'affiche | L'ancienne version reste servie indéfiniment | KO (ANO-03) |
| REC-T07 | EXG-01 | Déploiement GitHub Pages | Site en ligne en HTTPS | Workflow « Tests et publication » du 26/11 en échec à l'étape de publication (source Pages non réglée) | RÉS (action Roland) |
| REC-T08 | ENF-06 | Lecture de code : erreurs réseau, délai max 10 s, journalisation | Message clair, pas de plantage | Conforme (et test fonctionnel 17 de Dev_A) | OK |

### 4.2 Sécurité

| ID | Exigence | Scénario | Attendu | Résultat | Statut |
| --- | --- | --- | --- | --- | --- |
| REC-S01 | EXG-13 | `validateSettings` avec champs vides | Refus avec message | Champ vide accepté et converti en 0 | KO (ANO-01) |
| REC-S02 | EXG-03 | Création de compte avec identifiant `<img src=x onerror=…>`, profil « root », mot de passe court, doublon en majuscules | 4 refus | 4 refus avec message clair | OK |
| REC-S03 | EXG-02 | 5 mauvais mots de passe puis le bon | Blocage 30 s, puis connexion possible | Conforme | OK |
| REC-S04 | EXG-03 | Rétrograder ou supprimer le dernier administrateur, se supprimer soi-même | Refus | Refus | OK |
| REC-S05 | ENF-01 | Temps de réponse d'un refus : identifiant existant ou inconnu | Identique | 51 ms contre 0,1 ms : on devine si l'identifiant existe | RÉS (ANO-07) |
| REC-S06 | ENF-09 | Précision des coordonnées envoyées à Open-Meteo | Le strict nécessaire | 4 décimales (≈ 11 m) : le domicile est localisable, alors que la grille météo fait ≈ 2 km | RÉS (ANO-08) |
| REC-S07 | EXG-13 | Écran Paramètres : vider « Cumul indispensable », enregistrer | Refus | « Paramètres enregistrés », valeur stockée 0 mm | KO (ANO-01) |
| REC-S08 | ENF-02 | Compte utilisateur : menu et URL `#/admin/parametres`, `comptes`, `journaux` | Menu absent, « Accès refusé » | Conforme | OK |
| REC-S09 | ENF-02 | Compte utilisateur qui modifie la base locale (outils du navigateur) pour se donner le profil admin | Refus | L'écran admin s'ouvre | RÉS (ANO-02, limite du « sans serveur ») |
| REC-S10 | ENF-01 | Contrôle du stockage et des journaux (test 4 de Dev_A) + lecture de `crypto.js` | PBKDF2-SHA256, sel aléatoire 16 octets, jamais en clair | PBKDF2-SHA256, 310 000 itérations, sel 16 octets, comparaison à temps constant | OK |
| REC-S11 | Sécurité | Recherche de `innerHTML`, `eval`, `new Function`, `http://` dans le code | Aucun | Aucun : tout texte passe par `textContent` ; libellé d'adresse piégé affiché en texte (test 8 de Dev_A) | OK |
| REC-S12 | Sécurité | Politique CSP | Scripts limités au site, connexions limitées aux 3 services | Conforme (`script-src 'self'`, `connect-src` restreint, `object-src 'none'`) | OK |

### 4.3 Fonctionnel

| ID | Exigence | Scénario | Attendu | Résultat | Statut |
| --- | --- | --- | --- | --- | --- |
| REC-F01 | RG-04 | Probabilité 0, 29, 30, 50, 51 % ; cumul 0,5 et 0,6 mm | 0, 0, 1, 1, 2 ; 0 ; 2 | Conforme | OK |
| REC-F02 | RG-05 | 6 points dont un seul à 55 % | « Indispensable », risque 55 % | Conforme | OK |
| REC-F03 | RG-03 | Passage à 08:29, 08:30, 23:45 | 08:00, 09:00, 00:00 du lendemain | Conforme | OK |
| REC-F04 | EXG-06 | Trajet enregistré sans aucun jour coché | Avertissement | Accepté sans rien dire : plus jamais de verdict | KO mineur (ANO-05) |
| REC-F05 | EXG-05 | Matin 18:00, soir 08:00 | Avertissement | Accepté sans rien dire | KO mineur (ANO-06) |
| REC-F06 | EXG-11 | Fenêtre : 07:29, 07:30, 17:30, déjà notifié, samedi | Non, oui, non, non, non | Conforme | OK |
| REC-F07 | EXG-14 | 205 événements | 200 conservés, le plus récent en tête | Conforme | OK |
| REC-F08 | EXG-12 | Prévision de la veille 18:00, ouverture vendredi 07:00 sans réseau | Verdict, bandeau « périmée », heure de mise à jour non ambiguë | Bandeau présent, mais « Mis à jour à 18:00 » sans la date | RÉS (ANO-04) |
| REC-F09 | EXG-08 | Ouverture à 21:00 un vendredi | Information utile pour le lendemain | Verdict du jour écoulé, rien pour le lundi | RÉS (ANO-09, évolution) |
| REC-F10 | EXG-11 | Lecture de code : notification sans réseau | Le texte signale une prévision ancienne | La notification part avec la prévision en cache sans le dire | RÉS (ANO-10) |
| REC-F11 | EXG-07 | Vitesse manuelle 0, 41, vide, 12,5 | Refus, refus, refus, accepté | Conforme en simulation (test 14 de Dev_A) ; la virgule du clavier Samsung est à vérifier | RÉS (test D09) |
| REC-F12 | EXG-04/05 | Saisie A et B par adresse, carte, position ; heures 24 h (test 11 de Dev_A) | Coordonnées enregistrées et affichées | Conforme | OK |
| REC-F13 | EXG-08/09/10 | Verdict, 6 points, gants (test 13 de Dev_A) | Conforme à RG-01 à RG-06 | Conforme | OK |
| REC-F14 | EXG-15 | Thème sombre et clair, contraste ≥ 4,5 (test 20 de Dev_A) | Lisible | Conforme | OK |

### 4.4 Métier (regard utilisateur)

| ID | Situation vécue | Constat | Statut |
| --- | --- | --- | --- |
| REC-M01 | « Je pars à 8 h, j'ouvre l'app à 7 h 30 » | Réponse claire en couleur, risque max, conseil gants, détail aller et retour : la question du besoin est bien traitée | OK |
| REC-M02 | « Le dimanche soir je prépare mon sac pour lundi » | Pas de verdict le dimanche, pas de vue du lendemain | RÉS (ANO-09) |
| REC-M03 | « J'ai oublié mon mot de passe admin » | Aucune récupération possible : seul recours, effacer les données du site, donc perdre trajet et réglages | RÉS (point à arbitrer P4) |
| REC-M04 | « Mon trajet fait 2 km » | A, mi-parcours et B tombent souvent dans la même maille météo (≈ 2 km) : 3 appels pour une même valeur, sans incidence sur le verdict | OK (information) |

## 5. Anomalies

Gravité : Majeure (à corriger avant mise en service) · Mineure (à corriger, ne bloque pas) · Évolution (hors SDB).

| ID | Gravité | Description et reproduction | Correction proposée | Pour |
| --- | --- | --- | --- | --- |
| ANO-01 | Majeure | Admin → Paramètres : vider un champ numérique (ex. « Cumul indispensable » ou « Seuil conseillée ») puis Enregistrer. L'app affiche « Paramètres enregistrés » et stocke 0. Conséquence : seuil « conseillée » à 0 % = vêtements de pluie conseillés tous les jours ; cumul à 0 mm = « indispensable » à la moindre goutte. Cause : `Number('')` vaut 0 dans `validateSettings`. | Décision de Roland (27/11/2026) : aucun champ vide accepté ; un champ vidé reprend la valeur par défaut de la SDB (ex. 0,5 mm, 30 %), affichée à l'admin avant enregistrement. Ajouter le cas aux tests unitaires. | Dev_A |
| ANO-03 | Majeure | Une nouvelle version publiée n'arrive pas sur le téléphone si `VERSION` n'est pas modifiée à la main dans `sw.js` (cache « d'abord » sur tous les fichiers). Vérifié : après 3 rechargements, l'ancien écran reste affiché. Les corrections de cette recette risquent donc de ne jamais être livrées. | Dériver le nom du cache du commit au moment du déploiement (étape du workflow), ou servir `index.html` et les scripts « réseau d'abord, cache en secours » ; ajouter un test fonctionnel de mise à jour. | Dev_A |
| ANO-02 | Majeure (limite d'architecture) | Les droits admin ne sont contrôlés que dans l'application : quelqu'un qui a le téléphone déverrouillé et sait utiliser les outils du navigateur peut se donner le profil admin. Inhérent au choix « sans serveur » validé en étape 1. | Décision de Roland (27/11/2026) : risque accepté pour la v1 ; à traiter comme point majeur dans les versions suivantes (contrôle des droits côté serveur). À écrire dans la SDB. | manager_A |
| ANO-04 | Mineure | Hors ligne, une prévision d'un autre jour affiche « Mis à jour à 18:00 » sans date. | Afficher « Mis à jour le JJ/MM à HH:MM » quand ce n'est pas aujourd'hui. | Dev_A |
| ANO-05 | Mineure | Un trajet sans aucun jour de travail est accepté. | Exiger au moins un jour, ou avertir. | Dev_A |
| ANO-06 | Mineure | Heure du soir antérieure à l'heure du matin acceptée sans avertissement. | Avertissement non bloquant (horaires de nuit possibles). | Dev_A |
| ANO-07 | Mineure | Le temps de refus révèle si un identifiant existe (51 ms contre 0,1 ms). | Calculer un hachage fictif quand l'identifiant est inconnu. | Dev_A |
| ANO-08 | Mineure (vie privée) | Coordonnées envoyées à 4 décimales (≈ 11 m) à Open-Meteo. | Décision de Roland (27/11/2026) : arrondir à 2 décimales (≈ 1 km). | Dev_A |
| ANO-10 | Mineure | Sans réseau, la notification du matin part avec une prévision ancienne sans le signaler. | Ajouter « (prévision de HH:MM) » au texte quand elle a plus de 3 h. | Dev_A |
| ANO-09 | Évolution | Pas de vue « demain » : inutile le soir et le week-end pour préparer ses affaires. | Ajouter un onglet « Demain » (prochain jour travaillé) en v1.1 ou v2 (P3). | manager_A |

## 6. Points à arbitrer avec Roland (par manager_A)

| ID | Question | Recommandation de Rec_A |
| --- | --- | --- |
| P1 | ANO-02 : accepter que la séparation admin/utilisateur ne protège pas contre une personne qui a le téléphone en main et les compétences techniques ? | **Tranché le 27/11** : accepté en v1, point majeur des versions suivantes. |
| P2 | ANO-08 : envoyer des coordonnées arrondies à ≈ 1 km plutôt qu'à ≈ 11 m ? | **Tranché le 27/11** : oui, coordonnées arrondies à ≈ 1 km (correction Dev_A). |
| P3 | ANO-09 : ajouter une vue « demain » ? | **Tranché le 27/11** : oui, vue « demain » en v1.1. |
| P4 | Mot de passe admin oublié : accepter qu'il faille tout effacer ? | **Tranché le 27/11** : accepté en v1, procédure à écrire dans le README. |

## 7. Tests à faire par Roland sur le Samsung S21 Ultra

Préalable : régler GitHub → Settings → Pages → Source : GitHub Actions, puis relancer le workflow « Tests et publication ». Adresse : https://walle44.github.io/Application_01/

| ID | Exigence | Action | Résultat attendu |
| --- | --- | --- | --- |
| D01 | EXG-01 | Ouvrir l'adresse dans Chrome, menu ⋮ → Ajouter à l'écran d'accueil → Installer | Icône « Pluie Trajet », ouverture plein écran sans barre d'adresse |
| D02 | EXG-02 | Se connecter avec « rester connecté », fermer l'app depuis les applis récentes, redémarrer le téléphone, rouvrir | Pas de nouvelle saisie |
| D03 | EXG-02 | Se déconnecter, se reconnecter sans « rester connecté », fermer l'app, rouvrir | Identifiant et mot de passe redemandés |
| D04 | EXG-04 | Mon trajet : « Ma position » au domicile (GPS activé) | Adresse proche du domicile, repère sur la carte |
| D05 | EXG-04 | Taper l'adresse du travail en 4G | Suggestions en moins de 2 s, la bonne adresse est proposée |
| D06 | EXG-04 | Toucher la carte pour placer B | Repère placé au bon endroit, libellé d'adresse |
| D07 | ENF-04 | En 4G, chronométrer de l'appui sur l'icône à l'affichage du verdict | Moins de 2 s |
| D08 | EXG-12 | Mode avion, ouvrir l'app | Verdict et « mis à jour à HH:MM », bandeau hors-ligne |
| D09 | EXG-07 | Vitesse manuelle « 12,5 » avec le clavier Samsung | Accepté, durée recalculée |
| D10 | EXG-11 | Préférences → Activer les notifications ; noter le message affiché ; laisser l'app fermée jusqu'au lendemain d'un jour travaillé | Une seule notification entre 07:30 et le départ du soir (« au mieux ») |
| D11 | EXG-15, ENF-07 | Utiliser l'app d'une main, dehors en plein jour, en thème sombre puis clair | Tout est lisible et atteignable au pouce |
| D12 | Métier | Pendant 5 jours travaillés, noter le verdict du matin et la pluie réellement subie | Verdict jugé fiable par Roland |
| D13 | ENF-09 | Chrome → ⋮ → Paramètres → Paramètres des sites → walle44.github.io | Seules les autorisations Notifications et Position, aucune autre |

## 8. Fichiers de la recette

| Fichier | Contenu |
| --- | --- |
| `tests/recette/recette.test.mjs` | 21 cas automatisés de Rec_A (non-régression des anomalies), lancés par `npm run test:recette` et par le workflow |
| `docs/cahier-de-recette.md` | Ce document |

## 9. Re-recette des corrections v1.0.1 (27/11/2026)

Les tests de recette ont été transformés en tests de non-régression : ils échouent si une anomalie revient. Résultats : 62 tests unitaires (couverture 100 % des règles de calcul), 20 tests fonctionnels, 21 tests de recette, tous OK.

| Anomalie | Vérification | Statut |
| --- | --- | --- |
| ANO-01 | Champ vidé : « Paramètres enregistrés. Champ vide remis à sa valeur par défaut : Cumul « indispensable » (mm) : 0,5 », valeur 0,5 réaffichée et stockée ; la valeur par défaut est indiquée sous chaque champ | Corrigée |
| ANO-02 | Risque accepté par Roland pour la v1 ; écrit dans le README (limites connues) ; point majeur des versions suivantes | Acceptée |
| ANO-03 | Nouvelle version publiée (VERSION suffixée comme le fait le workflow) : affichée dès la réouverture, puis disponible hors-ligne | Corrigée |
| ANO-04 | Prévision de la veille : « Mis à jour le 26/11 à 18:00 » | Corrigée |
| ANO-05 | Trajet sans jour coché : « Cochez au moins un jour de travail » | Corrigée |
| ANO-06 | Matin 18:00, soir 08:00 : avertissement, puis « Enregistrer quand même » enregistre | Corrigée |
| ANO-07 | Temps de refus équivalent pour un identifiant existant ou inconnu | Corrigée |
| ANO-08 | Open-Meteo reçoit `latitude=47.22` au lieu de `47.2153` | Corrigée |
| ANO-09 | Vue « demain » prévue en v1.1 (décision de Roland) | Reportée |
| ANO-10 | Notification hors-ligne : « Prévision du 26/11 à 18:05, non mise à jour. » | Corrigée |
| P4 | Procédure « mot de passe administrateur oublié » dans le README | Fait |

Reste à faire : publication GitHub Pages (réglage Source par Roland), puis les tests D01 à D13 sur le S21 Ultra.

## 10. Historique

| Version | Date | Auteur | Changement |
| --- | --- | --- | --- |
| v1.0 | 26/11/2026 | Rec_A | Première recette sur `main` (commit 2a154c6) |
| v1.0.1 | 27/11/2026 | Rec_A | ANO-01 : correction décidée par Roland (valeur par défaut de la SDB) ; ANO-02 / P1 : risque accepté en v1, point majeur des versions suivantes ; P2 arrondi validé, P3 vue « demain » en v1.1, P4 accepté avec procédure README |
| v1.1 | 27/11/2026 | Rec_A | Re-recette des corrections v1.0.1 (section 9) |
