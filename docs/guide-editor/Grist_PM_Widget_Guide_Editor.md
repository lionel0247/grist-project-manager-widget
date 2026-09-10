# Grist Project Manager Widget — Guide de prise en main (Profil Editor)

> Suivi de l'activité : tâches, projets, planning, charge et absences

---

## 1. Introduction

*Le rôle Editor dans Grist : lire et modifier les données, sans toucher à la structure du document*

- **Profil concerné : l'Editor**
  - Utilisateur Grist habilité à consulter et à enrichir les données (tâches, sous-tâches, commentaires, pièces jointes), mais qui ne peut ni modifier la structure du document, ni configurer le widget.
- **Un poste de suivi d'activité unifié**
  - Tâches, projets, planning, charge de travail et absences réunis dans une seule interface, alimentée directement par les tables Grist du document.
- **Périmètre réservé à l'Owner**
  - Création / modification / suppression de projets, mapping de colonnes, gestion de l'équipe, suppression définitive d'une tâche, configuration du widget : ces actions ne sont pas disponibles pour l'Editor.
- **Adaptation automatique de l'interface**
  - Le widget détecte le rôle à l'ouverture et masque les onglets et boutons non accessibles à l'Editor : pas de bouton « Nouveau projet », pas de corbeille sur les tâches, onglets Équipe / Templates / Paramètres masqués.

---

## 2. Tableau de bord et navigation

*Onglets visibles et adaptés au profil Editor*

- **Onglets accessibles à l'Editor**
  - Calendrier — vue par mois / semaine / jour des échéances
  - Tâches — vue tableau avec édition en ligne, tri et recherche
  - Kanban — tableau de type À faire / En cours / Terminé (statuts personnalisés possibles)
  - Gantt — timeline avec zoom (jours, semaines, mois, année) et navigation par année
  - Planning — vue planche sur 6 mois pour anticiper la charge
  - Projets — liste des projets et avancement des tâches rattachées
  - Stats — affichées uniquement si l'Owner ne les a pas masquées via les permissions du widget
- **Onglets masqués par défaut (réservés Owner)**
  - Équipe, Templates, Paramètres, et éventuellement Stats : non visibles pour l'Editor.
- **Barre de filtres commune**
  - Filtres par projet, responsable, statut, priorité, catégorie, tag, groupe — plus le filtre « Mes projets ». Les filtres actifs sont mémorisés au changement d'onglet et au rechargement.

---

## 3. Suivi des tâches au quotidien

*Cinq vues complémentaires pour piloter ses tâches*

- **Vue Calendrier**
  - Visualisation mois / semaine / jour des échéances ; cliquer sur un jour crée une tâche datée ce jour-là.
- **Vue Kanban**
  - Glisser-déposer des cartes de tâches entre colonnes de statut (À faire, En cours, Terminé + statuts personnalisés définis par l'Owner).
- **Vue Tableau (Tâches)**
  - Édition en ligne des champs, tri par colonne, recherche par mots-clés, badges de statut, priorité et sous-tâches (ex. 3/5 terminées).
- **Vue Gantt**
  - Timeline des tâches et sous-tâches avec niveaux de zoom (jours, semaines, mois, année complète) et navigation par année.
- **Vue Planning**
  - Vue planche par défaut sur le 1er jour du mois courant, profondeur de 6 mois, pour anticiper la charge et les conflits d'échéance.
- **Filtres « Mes projets » et « Mes tâches »**
  - Bouton « Mes projets » pour ne garder que les projets créés par moi ou qui me sont assignés ; les filtres actifs sont rappelés dans un bandeau en haut de page.

---

## 4. Création et édition d'une tâche

*Créer et enrichir une tâche depuis n'importe quelle vue*

- **Création depuis toutes les vues**
  - Nouvelle tâche depuis le calendrier (avec date pré-remplie), depuis le Kanban (avec statut pré-rempli), ou depuis la vue tableau.
- **Champs disponibles**
  - Titre, description, statut, priorité, assigné(s), groupe, date de début, échéance, catégorie, tag, récurrence (aucune / quotidienne / hebdo / bi-hebdo / mensuelle / trimestrielle / annuelle), temps estimé.
- **Sous-tâches**
  - Découpage d'une tâche en sous-tâches, chacune avec son responsable, son échéance et son statut ; avancement affiché (ex. 3/5).
- **Fiche détaillée de tâche**
  - Commentaires (avec historique), pièces jointes (téléchargement et visualisation d'images/PDF), badges d'échéance et de blocage, matrice RACI de la tâche.
- **Ce que l'Editor ne peut pas faire**
  - Supprimer définitivement une tâche (action réservée à l'Owner) ; les modifications de contenu restent pleinement autorisées.

---

## 5. Suivi des projets

*Consulter et suivre l'avancement, sans gérer la structure des projets*

- **Onglet Projets**
  - Liste des projets avec : nombre de tâches rattachées, responsable (Lead), chef de projet (CdpBep), créateur, et badge de statut (Actif / Terminé / Archivé).
- **Filtre « Mes projets »**
  - N'afficher que les projets créés par moi ou qui me sont assignés ; utile pour se concentrer sur son périmètre.
- **Suivi de l'avancement**
  - Pour chaque projet, comptage des tâches et visualisation de leur statut dans les vues Calendrier, Kanban, Gantt et Planning après sélection du projet.
- **Périmètre réservé à l'Owner**
  - Création, modification et suppression d'un projet (boutons « Nouveau projet », crayon, corbeille) : non disponibles pour l'Editor.

---

## 6. Gestion des absences

*Principes de gestion des absences / congés dans Grist*

- **Principe de gestion des absences / congés dans Grist**
  - Les absences sont gérées comme des tâches d'un type dédié dans la table des tâches : une absence = une ligne, avec une date de début, une échéance et un statut. Aucune table séparée n'est nécessaire.
  - Visualisation : l'absence apparaît dans le Calendrier, le Gantt et le Planning comme toute autre tâche, ce qui permet d'anticiper la charge d'équipe et les conflits.
- **Noms des tâches d'absence**
  - Congé : congé payé, RTT, congé annuel
  - Concours : préparation / participation à un concours ou examen
  - Maladie : arrêt maladie, absence pour raison médicale
  - Formation : stage, session de formation, certification
  - Mission : déplacement professionnel, rendez-vous externe
- **Statut**
  - Les statuts standards du widget s'appliquent : À faire (demande d'absence à valider), En cours (absence en cours), Terminé (absence passée et clôturée).
  - Astuce : utiliser le champ Catégorie ou Tag (ex. « Absence ») pour filtrer rapidement l'ensemble des absences dans le calendrier et le planning.

---

## 7. Bonnes pratiques pour l'Editor

*Tirer le meilleur du widget dans le suivi de son activité*

- **Rester focus**
  - Activer les filtres « Mes projets » et « Mes tâches » pour ne voir que ce qui me concerne ; réinitialiser d'un clic via la croix du bandeau de filtres.
- **Structurer le travail**
  - Découper les tâches en sous-tâches avec responsable et échéance ; utiliser les commentaires et pièces jointes pour conserver l'historique et le contexte.
- **Anticiper**
  - S'appuyer sur le Gantt (zoom) et le Planning (6 mois) pour anticiper la charge, les dépendances et les absences ; repérer les badges « En retard » et « Échéance aujourd'hui ».
- **Limites à connaître**
  - Pas de création / modification / suppression de projet, pas de suppression de tâche, pas de configuration du widget : pour ces besoins, se rapprocher d'un Owner du document.
