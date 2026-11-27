# Application_01 · Cahier de développement v1.0

Rédigé par Dev_A le 26/11/2026, sur la base de la SDB v0.1 validée par Roland le 26/11/2026. Ce cahier trace chaque exigence de la SDB jusqu'à sa preuve de validation. Il est soumis à la validation de Roland avant la recette (Rec_A, étape 3).

## 1. Synthèse

| Indicateur | Résultat |
| --- | --- |
| Exigences fonctionnelles EXG-01 à EXG-15 | 13 validées, 1 validée partiellement (EXG-11), 1 à confirmer sur le téléphone (EXG-01) |
| Règles de gestion RG-01 à RG-08 | 8 validées |
| Exigences non fonctionnelles ENF-01 à ENF-09 | 8 validées, 1 à confirmer sur le téléphone (ENF-04) |
| Tests unitaires | 56 / 56 réussis |
| Couverture des règles de calcul (geo, rules, forecast, settings, weather) | 100 % des lignes, branches et fonctions (seuil bloquant) |
| Tests fonctionnels (Chromium, écran S21 Ultra 384 × 854, fuseau Europe/Paris) | 20 / 20 réussis |

**Point à remonter à manager_A : EXG-11** (heure de la notification non garantie sans serveur), détaillé en section 6.

## 2. Choix techniques

| Sujet | Choix | Raison |
| --- | --- | --- |
| Type d'application | PWA (HTML, CSS, JavaScript natif, modules ES) sans outil de compilation | Installable depuis Chrome Android, maintenance minimale |
| Hébergement | GitHub Pages, publié par GitHub Actions à chaque fusion sur `main` | HTTPS fourni, gratuit, sans serveur |
| Stockage | IndexedDB sur le téléphone (partagé entre la page et le service worker) | Données locales uniquement, accessibles à la notification en arrière-plan |
| Hors-ligne | Service worker : fichiers de l'app en cache, dernière prévision en IndexedDB | EXG-12, ENF-05 |
| Météo | Open-Meteo, un seul appel pour les 3 points, fuseau Europe/Paris, 3 jours horaires | Gratuit, sans clé ; couvre un trajet du soir qui passe minuit |
| Adresses | API Adresse (api-adresse.data.gouv.fr), repli automatique sur la Géoplateforme IGN (data.geopf.fr/geocodage, même format) | L'API Adresse est en cours de migration vers la Géoplateforme |
| Carte | Leaflet 1.9.4 embarqué dans le dépôt + fond OpenStreetMap | Aucun script tiers chargé depuis un CDN |
| Mots de passe | PBKDF2-SHA-256, 310 000 itérations, sel aléatoire de 16 octets, WebCrypto | ENF-01 (recommandation OWASP) |
| Sécurité du navigateur | Politique CSP stricte (scripts du site uniquement, appels limités aux 3 services), aucun HTML injecté (textContent) | ENF-03, ENF-09, protection contre l'injection |
| Saisie des heures | Deux listes heures / minutes au lieu du champ heure natif | Le champ natif suit le réglage 12/24 h du téléphone ; EXG-05 exige le 24 h |

## 3. Traçabilité des exigences fonctionnelles

Légende : **U** = test unitaire (`tests/unit/`), **F** = test fonctionnel dans le navigateur (`tests/e2e/`), **A** = à confirmer sur le S21 Ultra réel.

| ID | Exigence | Réalisation | Preuve | Statut |
| --- | --- | --- | --- | --- |
| EXG-01 | Installer l'app depuis Chrome | `manifest.webmanifest` (display standalone, icônes 192/512 + maskable), service worker actif | F « EXG-01 critères d'installabilité » ; A : installation réelle | Validé en simulation, **à confirmer sur le téléphone** |
| EXG-02 | Connexion identifiant + mot de passe, « rester connecté » | `core/auth.js`, écran Connexion | U « EXG-02 premier lancement… », « EXG-02 rester connecté » ; F « EXG-02 premier lancement… », « EXG-02 rester connecté : pas de nouvelle saisie après redémarrage » (vrai redémarrage du navigateur) | Validé |
| EXG-03 | Créer, modifier, supprimer un compte, profil | Écran Admin › Comptes | U « EXG-03 créer, modifier, supprimer » ; F « EXG-03 / ENF-02 gestion des comptes » | Validé |
| EXG-04 | A et B par adresse, carte, « ma position » | Écran Mon trajet, `core/address.js` | U « EXG-04 recherche d'adresse », « EXG-04 libellé » ; F « EXG-04 saisie de A et B par adresse, sur la carte et par ma position » (coordonnées enregistrées, 2 marqueurs) | Validé |
| EXG-05 | Heures matin et soir, 24 h | Listes heures/minutes 00-23 / 00-59 | U « EXG-05/06/07 validation du trajet » ; F « EXG-04… » (07:45 et 18:05 enregistrés) | Validé |
| EXG-06 | Jours de travail | Cases Lun à Dim, lundi à vendredi par défaut | U « RG-08 / EXG-06 jours travaillés », « aucune notification un jour non travaillé » ; F « EXG-06 / RG-08 jour non travaillé » | Validé |
| EXG-07 | Mode ou vitesse manuelle (1 à 40 km/h) | Boutons de mode + case « vitesse manuelle » | U « EXG-07 vitesse » ; F « EXG-07 vitesse manuelle prioritaire, bornes » | Validé |
| EXG-08 | Météo en A, mi-parcours, B à l'heure de passage, aller et retour | `core/forecast.js` | U « EXG-08 : 6 points » ; F « EXG-08/09/10 verdict du jour : 6 points » | Validé |
| EXG-09 | Verdict pluie à 3 niveaux | `dayVerdict` (RG-04, RG-05), carte verte / orange / rouge | U « RG-04 », « RG-05 », « EXG-09/10 jeu de données » ; F « EXG-08/09/10 » (3 couleurs contrôlées) | Validé |
| EXG-10 | Conseil gants hiver ou été | `glovesAdvice` (RG-06) | U « RG-06 » ; F « EXG-08/09/10 » | Validé |
| EXG-11 | Notification quotidienne, au plus 15 min après l'heure réglée | `core/notifier.js`, `ui/notifications.js`, `sw.js` (Periodic Background Sync) | U « EXG-11 notification envoyée une seule fois… », « fenêtre de notification », « pas de doublon » ; F « EXG-11 notification quotidienne… (application ouverte) » | **Validé partiellement : voir section 6** |
| EXG-12 | Dernière prévision sans réseau | Cache IndexedDB + service worker | U « EXG-12 / RG-07 hors-ligne » ; F « EXG-12 / ENF-05 / RG-07 hors-ligne » (mode avion simulé, « Mis à jour à 07:00 ») | Validé |
| EXG-13 | Paramètres admin | Écran Admin › Paramètres, bornes de la SDB | U « EXG-13 bornes », « une modification admin change le calcul suivant », « heure de notification réglée par l'admin » ; F « EXG-13 paramètres admin » | Validé |
| EXG-14 | Journaux (connexions, météo, erreurs) | `core/logs.js`, écran Admin › Journaux | U « EXG-14 journaux : 200 derniers », « les connexions sont journalisées » ; F « EXG-14 journaux » | Validé |
| EXG-15 | Thème sombre, écrans lisibles | Sombre par défaut, bascule dans Préférences | F « EXG-15 thème sombre… contraste ≥ 4,5 » (mesure WCAG AA dans les deux thèmes) | Validé |

## 4. Traçabilité des règles de gestion

| ID | Règle | Réalisation | Preuve (tests unitaires) | Statut |
| --- | --- | --- | --- | --- |
| RG-01 | Distance = vol d'oiseau × 1,3 (réglable) | `geo.js` : haversine, `routeDistanceKm` | « RG-01 haversine Paris–Lyon », « Nantes–Rennes », « distance trajet = vol d'oiseau × coefficient » | Validé |
| RG-02 | Durée et heures de passage ; le soir B → A | `rules.js` : `durationMinutes`, `passageTimes` ; `forecast.js` | « RG-02 durée », « heures de passage », « trajet du soir qui passe minuit », « EXG-08 : 6 points » | Validé |
| RG-03 | Prévision de l'heure pleine la plus proche | `nearestFullHour` | « RG-03 heure pleine la plus proche » | Validé |
| RG-04 | Niveau par point (< 30, 30-50, > 50 % ou > 0,5 mm) | `pointLevel` | « RG-04 niveau par point (bornes) », « seuils modifiés par l'admin » | Validé |
| RG-05 | Verdict = niveau max des 6 points ; risque = proba max | `dayVerdict` | « RG-05 verdict du jour » | Validé |
| RG-06 | Gants hiver si min < 10 °C | `glovesAdvice` | « RG-06 gants hiver » | Validé |
| RG-07 | Rafraîchir à l'ouverture et avant la notification ; périmée après 3 h | `service.js`, `notifier.js`, `isStale` | « RG-07 prévision périmée », « EXG-12 / RG-07 hors-ligne » ; F bandeau « périmée » | Validé |
| RG-08 | Aucun verdict ni notification les jours non travaillés | `isWorkingDay`, `getDayReport`, `shouldNotify` | « RG-08 jours travaillés », « RG-08 jour non travaillé », « aucune notification un jour non travaillé » | Validé |

## 5. Traçabilité des exigences non fonctionnelles

| ID | Exigence | Preuve | Statut |
| --- | --- | --- | --- |
| ENF-01 | Mots de passe hachés, jamais en clair | U « ENF-01 PBKDF2 salé » ; F « ENF-01 » (lecture complète d'IndexedDB, localStorage, sessionStorage : aucun mot de passe en clair, y compris un essai erroné) | Validé |
| ENF-02 | URL admin refusée à un compte utilisateur | U « ENF-02 » ; F « EXG-03 / ENF-02 » (3 URL admin ouvertes directement : « Accès refusé », tentative journalisée) | Validé (limite en section 7) |
| ENF-03 | HTTPS uniquement | F « ENF-03 / ENF-09 » (toutes les requêtes externes en https, CSP `upgrade-insecure-requests`) ; GitHub Pages impose HTTPS | Validé |
| ENF-04 | Accueil en moins de 2 s en 4G | F « ENF-04 » : affichage depuis le cache en moins de 2 s ; l'accueil s'affiche d'abord depuis le cache, puis se met à jour | Validé en local, **à confirmer sur le téléphone en 4G** |
| ENF-05 | S'ouvre sans réseau | F « EXG-12 / ENF-05 » (page servie par le service worker hors ligne) | Validé |
| ENF-06 | Erreur météo ou adresse : message clair | U « fetchForecast : erreurs », « pas de cache et pas de réseau » ; F « ENF-06 adresse introuvable », « ENF-06 service météo en erreur » ; aucune erreur JavaScript relevée dans les 20 tests fonctionnels | Validé |
| ENF-07 | Une main, français, métrique | F « ENF-07 » : `lang=fr`, cibles tactiles ≥ 44 px sur 4 écrans, navigation en bas d'écran, aucune unité impériale | Validé |
| ENF-08 | Tests RG-01 à RG-08, couverture 100 % | `npm run test:unit` échoue sous 100 % de lignes, branches ou fonctions sur les modules de calcul | Validé |
| ENF-09 | Seules les coordonnées partent ; aucun traceur | U « URL Open-Meteo : coordonnées seules » ; F « ENF-03 / ENF-09 » (paramètres envoyés contrôlés, 4 hôtes autorisés seulement, aucun script tiers) | Validé |

La recherche d'adresse envoie aussi le texte tapé à l'API Adresse, ce qui est inhérent à EXG-04.

## 6. Exigence non entièrement validable : EXG-11 (à remonter à manager_A)

**Constat.** Sans serveur, une PWA ne peut pas programmer une notification à une heure précise lorsque l'application est fermée. Chrome Android ne propose que la synchronisation périodique en arrière-plan (Periodic Background Sync) : c'est le navigateur qui choisit le moment, selon l'usage de l'application (en pratique, souvent toutes les 12 h ou plus). Le critère « au plus 15 min après l'heure réglée » n'est donc pas garanti.

**Ce qui est livré.**
- Application ouverte ou utilisée récemment : contrôle chaque minute et au retour au premier plan, notification à l'heure réglée (testé).
- Application fermée : enregistrement de la synchronisation périodique ; quand Chrome la déclenche entre l'heure réglée et le départ du soir, la prévision est rafraîchie et la notification envoyée, une seule fois par jour, jamais un jour non travaillé.
- Ouvrir l'application affiche toujours le verdict à jour, ce qui couvre le besoin si la notification arrive en retard.

**Options pour la révision de la SDB, à arbitrer par manager_A avec Roland.**
1. Accepter la notification « au mieux » et retirer le délai de 15 min du critère (aucun coût, aucune donnée hors du téléphone).
2. Ajouter un envoi planifié par GitHub Actions (Web Push) : pas de serveur à maintenir, mais les coordonnées du trajet seraient stockées en secret GitHub (contraire à ENF-09 « tout reste sur le téléphone ») et les tâches planifiées de GitHub ont souvent 5 à 30 min de retard.
3. Ajouter un petit serveur de notification (Web Push) : délai tenu, mais contraire au choix validé « sans serveur » et avec un coût d'hébergement.

Dev_A recommande l'option 1 pour la v1.

## 7. Interprétations et limites à connaître

Ces points ne contredisent pas la SDB mais précisent ce qu'elle ne disait pas. Ils sont soumis à la validation de Roland.

| Sujet | Choix de Dev_A |
| --- | --- |
| Premier lancement | L'écran « Bienvenue » crée le compte administrateur, puis ouvre « Mon trajet ». |
| Profil administrateur | L'administrateur a aussi accès aux écrans utilisateur (son propre trajet et son verdict). |
| Arrondi RG-03 | À 30 min pile, l'heure suivante est retenue (08:30 → 09:00). |
| Bornes RG-04 | 50 % pile = « conseillée » ; 0,5 mm pile = pas « indispensable » (la SDB dit « supérieure à »). |
| Mi-parcours | Milieu géographique du segment A-B (pas d'itinéraire routier, cohérent avec RG-01). |
| « Rester connecté » | Session conservée 90 jours. Sans l'option, la session s'arrête à la fermeture de l'application. |
| Protection de la connexion | Après 5 mots de passe erronés, connexion bloquée 30 s (ajout de sécurité). |
| Comptes | Identifiant de 3 à 32 caractères, mot de passe de 8 caractères minimum ; impossible de supprimer son propre compte ou le dernier administrateur. |
| Fenêtre de notification | De l'heure réglée jusqu'au départ du soir ; au-delà, la notification du jour n'est plus envoyée. |
| Notification par appareil | La notification est activée par la personne connectée, dans Préférences, pour son trajet. |
| Limite d'ENF-02 | Sans serveur, le contrôle des droits est fait dans l'application sur le téléphone. Il empêche l'accès normal aux écrans admin, mais quelqu'un qui a le téléphone déverrouillé et des outils de développement pourrait modifier les données locales. Ce risque est accepté par le choix « sans serveur ». |
| Services réels | L'environnement de développement n'a pas d'accès à Open-Meteo ni à l'API Adresse. Les tests utilisent des réponses simulées au format exact des API. Un premier appel réel est à vérifier sur le téléphone (voir section 9). |

## 8. Anomalies trouvées et corrigées pendant le développement

| Anomalie | Cause | Correction | Test de non-régression |
| --- | --- | --- | --- |
| Un écran quitté pendant le chargement de la météo pouvait recouvrir l'écran suivant | Rendu asynchrone qui écrivait dans la zone principale | Chaque écran dessine dans son propre conteneur | F « EXG-14 journaux » |
| Saisie d'une vitesse hors bornes bloquée sans message en français | Validation native du navigateur | Validation par l'application, message explicite | F « EXG-07 » |
| Notification envoyée deux fois | Deux contrôles simultanés (premier plan + minuterie) | Un seul contrôle à la fois, jour marqué avant l'affichage, revérification après l'appel météo | U « pas de doublon », « échec d'affichage » ; F « EXG-11 » |
| Un échec d'écriture du journal pouvait bloquer les écritures suivantes | Chaîne de promesses rejetée | Erreur du journal isolée | U « EXG-14 » |

## 9. Vérifications à faire sur le Samsung S21 Ultra (par Roland ou Rec_A)

1. Ouvrir l'adresse GitHub Pages dans Chrome, installer l'application : l'icône apparaît, l'app s'ouvre en plein écran (EXG-01).
2. Chercher une vraie adresse : des suggestions s'affichent (API Adresse réelle).
3. Sur l'accueil, vérifier que la météo réelle s'affiche en moins de 2 s en 4G (ENF-04).
4. Activer les notifications, laisser l'application fermée, noter l'heure d'arrivée de la notification les jours suivants (EXG-11).
5. Passer en mode avion et rouvrir l'application (EXG-12).

## 10. Captures d'écran (viewport S21 Ultra)

Générées par les tests fonctionnels dans `docs/captures/` : premier lancement, connexion refusée, comptes, accès admin refusé, mon trajet, verdicts rouge / orange / vert, jour non travaillé, hors-ligne, prévision périmée, paramètres admin, journaux, thème clair, préférences.

## 11. Reproduire les preuves

```bash
npm run test:unit   # 56 tests + couverture 100 % des règles de calcul
npm install --no-save playwright && npx playwright install chromium
npm run test:e2e    # 20 tests fonctionnels
```

## 12. Corrections v1.0.1 (anomalies de la recette v1.0)

Décision de Roland du 27/11/2026 : corriger toutes les anomalies (majeures et mineures). ANO-02 est accepté en v1 (point majeur des versions suivantes) et ANO-09 (vue « demain ») est prévu en v1.1.

| Anomalie | Correction | Preuve |
| --- | --- | --- |
| ANO-01 | Un champ numérique vidé dans Paramètres admin reprend la valeur par défaut de la SDB, réaffichée avec un message ; la valeur par défaut est indiquée sous chaque champ | `tests/unit/corrections-recette.test.mjs`, REC-S01, REC-S07 |
| ANO-03 | Le workflow suffixe `VERSION` de `sw.js` avec le commit à chaque publication ; le cache est rempli sans le cache HTTP (`cache: 'reload'`) ; la page se recharge une fois quand la nouvelle version prend la main | REC-T06 (nouvelle version affichée dès la réouverture, puis hors-ligne) |
| ANO-04 | « Mis à jour le JJ/MM à HH:MM » quand la prévision n'est pas du jour | REC-F08 |
| ANO-05 | Au moins un jour de travail exigé | unitaire, REC-F04 |
| ANO-06 | Horaires inversés : avertissement et bouton « Enregistrer quand même » | unitaire, REC-F10 |
| ANO-07 | Hachage fictif quand l'identifiant est inconnu (même temps de réponse) | unitaire, REC-S05 |
| ANO-08 | Coordonnées envoyées à Open-Meteo arrondies à 2 décimales (≈ 1 km) | unitaire, REC-S06 |
| ANO-10 | Notification : « Prévision du JJ/MM à HH:MM, non mise à jour. » quand elle a plus de 3 h | unitaire |
| P4 | Procédure « mot de passe administrateur oublié » et limites connues dans le README | README |

Résultats : 62 tests unitaires (couverture 100 % maintenue), 20 tests fonctionnels, 21 tests de recette, tous OK. Les tests de recette sont ajoutés au workflow (`npm run test:recette`).

## Historique

| Version | Date | Auteur | Changement |
| --- | --- | --- | --- |
| v1.0 | 26/11/2026 | Dev_A | Première version, d'après la SDB v0.1 |
| v1.0.1 | 27/11/2026 | Dev_A | Corrections des anomalies de la recette v1.0 (section 12) |
