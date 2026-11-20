# Plan de migration détaillé — Portage du widget hors Grist (PHP + JS + MariaDB)

**Document associé** : [ETUDE-PORTABILITE-HORS-GRIST.md](ETUDE-PORTABILITE-HORS-GRIST.md) (faisabilité, décisions, estimation).
**Source analysée** : `widget.js` (~13 000 lignes), `index.html`, `styles.css` (branche `main`, commit `5139ae4`).

## 0. Conventions et décisions actées

- **Mono-espace** : 1 déploiement = 1 espace de gestion de projet. Pas de colonne `workspace_id`. Rôles globaux par utilisateur.
- **Schéma figé** : pas de `PM_Config`, pas de mapping configurable. Les noms de colonnes Grist (`Title`, `Due_Date`, `Order`…) sont conservés en BDD (entre backticks quand mot réservé) pour minimiser le refactor JS ; une constante par champ côté front (`fields.js`) centralise les noms.
- **Français unique + libellés éditables** : table `pm_labels` (clé → libellé), éditée depuis l'onglet Paramètres (admin), servie via l'API, avec repli sur le dictionnaire FR par défaut de `js/i18n.js`. `t(clé)` reste l'unique point d'accès aux textes ; les `data-i18n` de `index.html` sont résolus au boot.
- **Sans pièces jointes** : `PM_Attachments`, section D2 (widget.js:1509-1826), viewer `index.html`, upload/suppression : supprimés.
- **Sans RACI** : colonnes `Accountable`/`Consulted`/`Informed` de `PM_Tasks` (widget.js:2321-2328), `raciEnabled` (widget.js:828), section RACI de la modale tâche et notifications « concernés R/A/C/I » supprimés. « Personnes concernées » = assigné + responsable de projet (+ cibles des règles d'automatisation).
- **Auth locale** : comptes dans `pm_users` (`password_hash`, `is_active`), sessions PHP.
- **E-mails** : SMTP direct en PHP ; la table `pm_notifications` porte un flag `email_sent`, un cron envoie les non envoyés.

## 1. Arborescence cible

```
app/                          # racine applicative (hors docroot pour src/, config/)
  config/config.php           # accès BDD (PDO), constantes, session
  public/                     # docroot Apache/Nginx
    index.php                 # front controller API + sert index.html
    .htaccess                 # rewrite /api/* → index.php (ou conf Nginx équivalente)
    index.html                # repris du widget (sans grist-plugin-api.js, sans boutons FR/EN)
    assets/css/styles.css     # repris tel quel
    assets/js/
      main.js                 # boot (remplace l'IIFE widget.js:12823-12961)
      state.js                # les 134 variables globales (widget.js:746-1062)
      api.js                  # couche fetch → API PHP (remplace tous les grist.docApi.*)
      i18n.js                 # dictionnaire FR par défaut + t() alimenté par pm_labels
      fields.js               # constantes nom de champ → nom de colonne BDD
      utils.js                # sanitize, dates ISO, helpers (widget.js:1041-1273, sans mapping)
      ui.js                   # toasts, modales confirm/prompt (widget.js:1274-1508)
      data.js                 # loadAllData → GET /api/bootstrap + GET /api/<table>
      filters.js              # filtres multi + persistance (widget.js:3026-3593)
      tasks.js                # modale tâche + CRUD (widget.js:7647-8778, 9700-10166 ; sans PJ ni RACI)
      notifications.js        # alertes + automations (widget.js:9096-9700, 10697-11285, 12558)
      export.js               # CSV (widget.js:12773+) ; PDF Gantt reste client (html2canvas/jsPDF auto-hébergés)
      views/calendar.js  views/kanban.js  views/table.js  views/gantt.js  views/planning.js
      views/projects.js  views/templates.js  views/stats.js  views/team.js  views/settings.js
    assets/vendor/            # html2canvas, jsPDF (auto-hébergés)
  src/                        # classes PHP : Auth, Api, modèles PDO par table, Mailer (SMTP), Cron
  api/                        # endpoints : auth.php, bootstrap.php, generic CRUD par ressource, labels.php, notifications.php, changes.php, export.php
  sql/schema.sql              # schéma des 18 tables (section 2)
  sql/migrate_001_*.sql       # migrations versionnées
  tools/import_grist.php      # script d'import des exports Grist (section 6)
  cron/                       # send_mails.php (SMTP), run_automations.php (overdue/échéance proche)
  tests/                      # tests API (PHPUnit) + recette UI (grille, section 8)
```

## 2. Schéma MariaDB (`sql/schema.sql`)

Conventions : moteur InnoDB, utf8mb4, PK `id INT AUTO_INCREMENT`, noms de colonnes = ids Grist (backticks pour `Order`, `Key`, `Timestamp`), dates en `DATE`/`DATETIME` (l'import convertit les epoch seconds Grist), booléens en `TINYINT(1)`, choix en `VARCHAR` + référentiel (les statuts Kanban sont personnalisables via `pm_settings.kanban_statuses`), `Ref:PM_Projects` → FK.

```sql
CREATE TABLE pm_projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  Name VARCHAR(255) NOT NULL,
  Description TEXT,
  Color VARCHAR(20),
  Status VARCHAR(20) NOT NULL DEFAULT 'active',      -- active | completed | archived
  Start_Date DATE NULL,
  End_Date DATE NULL,
  Lead VARCHAR(255),
  CdpBep VARCHAR(255),
  CreatedBy VARCHAR(255),
  CreatedAt VARCHAR(50)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE pm_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  Title VARCHAR(500) NOT NULL DEFAULT '',
  Description TEXT,
  Status VARCHAR(50) NOT NULL DEFAULT 'todo',         -- todo | progress | done + statuts custom (pm_settings)
  Archived TINYINT(1) NOT NULL DEFAULT 0,
  Priority VARCHAR(20) NOT NULL DEFAULT 'medium',     -- high | medium | low
  Assignee VARCHAR(255),
  Group_Name VARCHAR(255),
  Start_Date DATE NULL,
  Due_Date DATE NULL,
  Category VARCHAR(255),
  Tag VARCHAR(255),
  Recurrence VARCHAR(20) DEFAULT 'none',              -- none | daily | weekly | monthly
  Estimated_Hours DECIMAL(8,2) NULL,
  Project_Id INT NULL,
  Duration VARCHAR(50),                               -- Journée | Matin | Après-midi
  Extension_Date DATE NULL,
  Auto_Extend TINYINT(1) NOT NULL DEFAULT 0,
  `Order` INT NOT NULL DEFAULT 0,
  Created_At DATETIME NULL,
  Created_By VARCHAR(255),
  Last_Modified_By VARCHAR(255),
  Last_Modified_At DATETIME NULL,
  CONSTRAINT fk_tasks_project FOREIGN KEY (Project_Id) REFERENCES pm_projects(id) ON DELETE SET NULL,
  INDEX idx_tasks_status (Status), INDEX idx_tasks_priority (Priority),
  INDEX idx_tasks_assignee (Assignee), INDEX idx_tasks_project (Project_Id),
  INDEX idx_tasks_due (Due_Date), INDEX idx_tasks_archived (Archived)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- RACI supprimé : pas de colonnes Accountable/Consulted/Informed.

CREATE TABLE pm_subtasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  Parent_Task_Id INT NOT NULL,
  Title VARCHAR(500) NOT NULL DEFAULT '',
  Description TEXT,
  Status VARCHAR(20) NOT NULL DEFAULT 'todo',         -- todo | progress | done | archived
  Priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  Assignee VARCHAR(255),
  Due_Date DATE NULL,
  Start_Date DATE NULL,
  Estimated_Hours DECIMAL(8,2) NULL,
  Recurrence VARCHAR(20) DEFAULT 'none',
  Type VARCHAR(20) DEFAULT 'subtask',                 -- subtask | milestone
  Completed TINYINT(1) NOT NULL DEFAULT 0,
  Blocked_By_Subtask_Id INT NULL,
  `Order` INT NOT NULL DEFAULT 0,
  Created_At DATETIME NULL,
  CONSTRAINT fk_sub_parent FOREIGN KEY (Parent_Task_Id) REFERENCES pm_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE pm_dependencies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  Task_Id INT NOT NULL,
  Depends_On_Task_Id INT NOT NULL,
  Created_At DATETIME NULL,
  CONSTRAINT fk_dep_task FOREIGN KEY (Task_Id) REFERENCES pm_tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_dep_on FOREIGN KEY (Depends_On_Task_Id) REFERENCES pm_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE pm_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  Task_Id INT NOT NULL,
  Author VARCHAR(255),
  Content TEXT,
  Created_At DATETIME NULL,
  CONSTRAINT fk_com_task FOREIGN KEY (Task_Id) REFERENCES pm_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE pm_time_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  Task_Id INT NOT NULL,
  User VARCHAR(255),
  Start_Time DATETIME NULL,
  End_Time DATETIME NULL,
  Duration INT NULL,
  Description TEXT,
  CONSTRAINT fk_te_task FOREIGN KEY (Task_Id) REFERENCES pm_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE pm_custom_fields (
  id INT AUTO_INCREMENT PRIMARY KEY,
  Name VARCHAR(255) NOT NULL,
  Type VARCHAR(20) NOT NULL DEFAULT 'text',           -- text | number | date | checkbox | select
  Options TEXT,
  `Order` INT NOT NULL DEFAULT 0,
  Created_At DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE pm_custom_field_values (
  id INT AUTO_INCREMENT PRIMARY KEY,
  Task_Id INT NOT NULL,
  Field_Id INT NOT NULL,
  Value TEXT,
  CONSTRAINT fk_cfv_task FOREIGN KEY (Task_Id) REFERENCES pm_tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_cfv_field FOREIGN KEY (Field_Id) REFERENCES pm_custom_fields(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE pm_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  Name VARCHAR(255) NOT NULL,
  Email VARCHAR(255) NOT NULL,
  Role VARCHAR(20) NOT NULL DEFAULT 'member',         -- admin | member | viewer (matrice PM_ACL_RULES)
  Group_Name VARCHAR(255),
  password_hash VARCHAR(255) NULL,                    -- auth locale (décision n°2)
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_users_email (Email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE pm_groups (id INT AUTO_INCREMENT PRIMARY KEY, Name VARCHAR(255) NOT NULL, Description TEXT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE pm_cdp_bep (id INT AUTO_INCREMENT PRIMARY KEY, Name VARCHAR(255) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE pm_categories (id INT AUTO_INCREMENT PRIMARY KEY, Name VARCHAR(255) NOT NULL, Color VARCHAR(20), `Order` INT NOT NULL DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE pm_tags (id INT AUTO_INCREMENT PRIMARY KEY, Name VARCHAR(255) NOT NULL, Color VARCHAR(20)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE pm_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  Title VARCHAR(500) NOT NULL DEFAULT '',
  Description TEXT,
  Priority VARCHAR(20) DEFAULT 'medium',
  Category VARCHAR(255),
  Estimated_Hours DECIMAL(8,2) NULL,
  Group_Name VARCHAR(255),
  Tag VARCHAR(255),
  Recurrence VARCHAR(50),
  Usage_Count INT NOT NULL DEFAULT 0,
  Updated_At DATE NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE pm_settings (`Key` VARCHAR(100) PRIMARY KEY, Value TEXT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- clés utilisées : automation_rules, card_display, kanban_sort, kanban_statuses, notify_concerned (raci_enabled supprimé)

CREATE TABLE pm_notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  Task_Id INT NULL,
  User_Email VARCHAR(255) NOT NULL,
  Type VARCHAR(50),
  Message TEXT,
  Is_Read TINYINT(1) NOT NULL DEFAULT 0,
  Created_At DATETIME NULL,
  Rule_Id VARCHAR(100),
  email_sent TINYINT(1) NOT NULL DEFAULT 0,           -- file d'attente e-mail (cron SMTP)
  INDEX idx_notif_user (User_Email, Is_Read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE pm_activity_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  `Timestamp` DATETIME NULL,
  User_Email VARCHAR(255),
  Action VARCHAR(100),
  Task_Id INT NULL,
  Task_Title VARCHAR(500),
  Details TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE pm_labels (                            -- libellés globaux éditables (décision n°10)
  `key` VARCHAR(100) PRIMARY KEY,
  label VARCHAR(500) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**18 tables** : 17 `pm_*` + `pm_labels`. Supprimées : `PM_Attachments`, `PM_Config`, `PM_UserInfo`. Optionnelles : `widget_registry`, `widget_permissions` (mono-espace → globales, ou remplacées par des clés `pm_settings`).

## 3. Correspondance API : `grist.docApi` → REST PHP

| Appel Grist (widget.js) | Appel cible | Notes |
|---|---|---|
| `grist.ready({requiredAccess:'full'})` (12830) | boot après contrôle de session | `main.js` appelle `GET /api/auth/me` puis `GET /api/bootstrap` |
| `grist.docApi.listTables()` (×7) | supprimé (schéma figé) | `GET /api/meta` si besoin |
| `grist.docApi.fetchTable(T)` (×45) | `GET /api/<table>` | retourne `{records:[{id, fields...}]}` ; dates en ISO 8601 |
| `['AddRecord', T, null, fields]` (×30) | `POST /api/<table>` | retourne l'id créé |
| `['UpdateRecord', T, id, fields]` (×28) | `PUT /api/<table>/{id}` | partiels acceptés |
| `['RemoveRecord', T, id]` (×20) | `DELETE /api/<table>/{id}` | |
| `['BulkAddRecord', T, ...]` / `['BulkUpdateRecord', ...]` | `POST /api/<table>/bulk`, `PUT /api/<table>/bulk` | |
| `['AddTable'/'AddColumn'/'ModifyColumn'/'UpdateColumn']` (×~60) | **supprimés** | remplacés par `sql/schema.sql` + migrations versionnées |
| `getAccessToken` + `fetch(.../records?auth=)` (10748) | supprimé | cookie de session HttpOnly |
| `grist.docApi.getDocName()` (3344) | supprimé | mono-espace (plus de scoping par document) |
| `grist.onRecords(cb)` (12949) | polling `GET /api/changes?since=<ts>` (5 s, debounce 500 ms) ou SSE `GET /api/events` | même comportement : `loadAllData()` si aucune modale ouverte |
| `fetchTable('_grist_ACLRules'/'_grist_ACLResources')` (11290+) | supprimé | matrice `PM_ACL_RULES` traduite en middleware PHP (rôle × ressource) |
| `AddTable PM_UserInfo` + formules `user.Email/user.Name` (12838+) | supprimé | identité = `$_SESSION['user']` |
| Webhook Grist sur `PM_Notifications` → n8n | cron `cron/send_mails.php` | envoi SMTP des `pm_notifications.email_sent=0` |
| `checkTimeBasedAutomations()` au chargement (12672) | cron `cron/run_automations.php` | déclencheurs `overdue`, `approaching_deadline` |

Endpoints transverses : `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `GET /api/bootstrap` (user + labels + settings + permissions d'onglets), `GET/PUT /api/labels` (admin), `GET/PUT /api/settings`, `POST /api/notifications/{id}/read`, `GET /api/export/tasks.csv`, `GET /api/changes?since=`. Toutes les écritures vérifient le rôle côté serveur (jamais confiance au client) + CSRF.

## 4. Découpage de `widget.js` en modules ES (indicatif, à affiner au découpage)

| Module | Sections widget.js absorbées | Notes |
|---|---|---|
| `js/i18n.js` | 1-745 | dictionnaire **FR seul** (~348 clés) + `t()` ; surchargé par `pm_labels` au boot |
| `js/state.js` | 746-1062 | les 134 globales ; sans les vars de mapping |
| `js/utils.js` | 1041-1273 | `sanitize`, dates (ISO au lieu d'epoch), helpers ; sans `loadColumnMapping`/`getField`/`setField`/`getColumnName` (1063-1160) |
| `js/ui.js` | 1274-1508 | toasts, modales confirm/prompt |
| `js/api.js` | nouveau | unique point d'appel `fetch` vers l'API PHP ; remplace les 45 `fetchTable` + 125 `applyUserActions` |
| `js/fields.js` | nouveau | constantes champ → colonne BDD (schéma figé) |
| `js/data.js` | 2395-3025 | `loadAllData()` → `GET /api/<table>` par ressource |
| `js/filters.js` | 3026-3593 | filtres multi + persistance (scoping par utilisateur, plus par document) |
| `js/views/calendar.js` | 3619-4120 | incl. ResizeObserver |
| `js/views/kanban.js` | 4120-4642 | incl. drag & drop (4563) |
| `js/views/table.js` | 4642-5188 | édition inline, WBS |
| `js/views/gantt.js` | 5188-6316 | modes jours/semaines/mois/année/2 ans/perso |
| `js/views/planning.js` | 6316-6992 | planning par personne |
| `js/views/projects.js` | 6992-7647 | liste projets, sélecteur, archivage |
| `js/tasks.js` | 7647-8778 + 9700-10166 | modale tâche (sous-tâches, dépendances, champs perso, commentaires) + `createTask`/`updateTask`/`deleteTask` ; **sans PJ (8403-8418) ni RACI** |
| `js/views/team.js` | 8778-9096 | utilisateurs, groupes |
| `js/notifications.js` | 9096-9700, 10697-11285, 12558 | alertes, règles d'automatisation, `createNotification` |
| `js/views/stats.js` | 3594-3619 + sections stats | répartition, charge, timeline, burndown |
| `js/views/templates.js` | section templates | |
| `js/views/settings.js` | 10167-10255, 11286-12012, 12398-12725 | registre/permissions → `pm_settings` ; sécurité ACL → affichage du statut côté serveur ; édition globale des libellés (`pm_labels`) ; tags/catégories |
| `js/export.js` | 12725-12793 | CSV ; PDF Gantt reste côté client |
| `js/main.js` | 12793-12961 | init : session → bootstrap → loadAllData → polling |
| **supprimé** | 1509-1826 (PJ), 1860-2394 (`ensureTables`/`PM_Config`), 10697-10795 (`PM_UserInfo`), 2321-2328 (colonnes RACI), bloc EN du dictionnaire, `vercel.json`, `grist-plugin-api.js` | |

Règles de découpage : un module à la fois, recette de l'onglet concerné après chaque déplacement ; `state.js` importé partout (pas de copie d'état) ; `onclick` inline de `index.html` remplacés par `data-action` + délégation (ou pont `window.*` temporaire).

## 5. Phasage (1 développeur expérimenté PHP/JS — ~15-19 semaines au total)

- **Phase 0 — Socle données (1-2 sem.)** : `sql/schema.sql` (18 tables) + migrations ; `config.php`, PDO, session, `POST /api/auth/login|logout|me` ; `tools/import_grist.php` + test d'import sur un export Grist réel ; déploiement recette (HTTPS, docroot `public/`).
- **Phase 1 — Socle applicatif (4-5 sem.)** : API CRUD générique + par ressource (tasks, projects, users…) avec rôles ; `js/api.js`, `js/state.js`, `js/i18n.js` (+ `pm_labels`), `js/utils.js`, `js/ui.js`, `js/main.js`, `js/data.js` ; premières vues : liste des tâches, Kanban, calendrier ; recette par onglet.
- **Phase 2 — Vues (4-6 sem.)** : tableau inline + filtres, Gantt, planning, projets, templates, stats/burndown, équipe, paramètres (dont édition des libellés) ; un module `views/*.js` à la fois.
- **Phase 3 — Transverse (3-4 sem.)** : middleware ACL (matrice `PM_ACL_RULES`), permissions d'onglets, notifications in-app + e-mail SMTP (`email_sent` + cron), automations + cron temporel, polling/SSE (`/api/changes`), export CSV, PDF Gantt (vendor auto-hébergé), dark mode, finalisation du découpage.
- **Phase 4 — Mise en production (3 sem.)** : migration des données (section 6), revue sécurité (section 7), perfs (index, pagination si besoin), tests API (PHPUnit) + grille de recette (section 8), documentation d'exploitation (cron, sauvegardes), déploiement.

**MVP** (auth + tâches + Kanban + calendrier + projets) : ~5-6 semaines.

## 6. Migration des données Grist → MariaDB

1. Dans chaque document Grist source : exporter chaque table `PM_*` en CSV (avec la colonne `id`).
2. Déposer les CSV dans `tools/exports/` ; lancer `php tools/import_grist.php` :
   - conserve les **id Grist** (insert explicite) pour préserver les références (`Project_Id`, `Parent_Task_Id`, `Task_Id`…) ;
   - convertit les dates epoch seconds → `DATE`/`DATETIME` ; `ChoiceList` `L,a,b` → valeurs ; `Ref` → id FK ;
   - **ignore** : `PM_Attachments`, `PM_Config`, `PM_UserInfo`, colonnes RACI ;
   - crée les comptes de connexion : `pm_users.password_hash` renseigné par réinitialisation (mot de passe initial communiqué, ou lien « mot de passe oublié » par e-mail) ;
   - alimente `pm_labels` avec le dictionnaire FR par défaut (seed SQL).
3. Vérifications : comptages par table, intégrité FK (`FOREIGN_KEY_CHECKS`), recette sur un jeu de données réel.

## 7. Sécurité (checklist)

PDO préparées partout ; échappement à l'affichage ; tokens CSRF sur toute écriture ; cookies session HttpOnly/Secure/SameSite ; `password_hash` (Argon2/bcrypt) + rate-limiting + verrouillage après échecs sur `/api/auth/login` ; HTTPS + en-têtes (CSP, X-Frame-Options DENY, HSTS) ; middleware de rôles sur chaque endpoint (matrice `PM_ACL_RULES`) ; pièces jointes n'existent plus (pas de upload) ; logs sans données sensibles ; RGPD : rétention/purge de `pm_activity_log` et des e-mails.

## 8. Recette

Grille par onglet (calendar, kanban, table, gantt, planning, projectList, templates, stats, team, settings) × scénarios : création/édition/suppression tâche, sous-tâches, dépendances, commentaires, archivage (tâche + projet), filtres, recherche, drag & drop Kanban et WBS, export CSV, notifications (in-app + e-mail), automations, édition d'un libellé global (vérifier la répercussion), rôles (admin/editor/viewer), multi-utilisateurs simultanés (live). Tests API automatisés (PHPUnit) sur les endpoints CRUD + auth.

## 9. Déploiement et exploitation

Docroot = `public/` ; rewrite `/api/*` → `public/index.php` ; HTTPS ; cron : `send_mails.php` (toutes les minutes), `run_automations.php` (toutes les heures), `mysqldump` (quotidien) ; supervision des logs PHP/MariaDB ; montées de version par `sql/migrate_*.sql`.

## 10. Risques et mitigations

| Risque | Mitigation |
|---|---|
| Régression lors du découpage du monolithe `widget.js` | un module à la fois + recette par onglet ; `state.js` unique |
| Conversion des types Grist (epoch, Choice, Ref) | tests ciblés Gantt/Calendrier + recette sur données migrées |
| Oubli d'un handler `onclick` lors du passage aux modules | pont `window.*` temporaire, puis délégation `data-action` ; revue de `index.html` |
| ACL mal traduites (matrice `PM_ACL_RULES`) | tests d'autorisation par rôle sur chaque endpoint ; revue de la matrice ligne par ligne |
| Live multi-utilisateurs | commencer par polling 5 s (simple), SSE en option |
| E-mails non envoyés | flag `email_sent` + cron + supervision ; test SMTP en recette |
| Perte de données à la migration | export Grist conservé, import en transaction, vérifications de comptage, rollback possible |
