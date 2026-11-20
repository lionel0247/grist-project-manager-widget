# Étude de portabilité — Widget « Project Manager » hors Grist

**Objectif** : auto-héberger l'application de gestion de projet sur un serveur web totalement indépendant de Grist, en **PHP + JavaScript + MariaDB**.
**Dépôt analysé** : `lionel0247/grist-project-manager-widget` (branche `main`, commit `5139ae4`).
**Livrable associé** : [PLAN-MIGRATION-DETAILLE-HORS-GRIST.md](PLAN-MIGRATION-DETAILLE-HORS-GRIST.md) (schéma SQL, correspondance API, découpage en modules, phasage).

---

## 1. Contexte

Le dépôt contient un **widget custom Grist** (chargé en iframe dans un document Grist avec « Full document access ») : tableau Kanban, vue tableau, calendrier, Gantt, planning, liste des projets, templates, statistiques, équipe, paramètres. Il s'appuie sur l'API `grist-plugin-api.js` pour lire/écrire des tables `PM_*` créées automatiquement dans le document, et sur des webhooks Grist → n8n/Power Automate pour les e-mails.

Le projet consiste à transformer ce widget en **application web autonome** (plus d'iframe, plus de Grist) tout en conservant les fonctionnalités retenues.

## 2. Inventaire des fichiers contribuant au fonctionnement

| Fichier | Rôle | Couplage Grist |
|---|---|---|
| `index.html` (740 lignes) | Structure UI : 10 onglets, modales ; charge les scripts externes | `grist-plugin-api.js` (ligne 18), html2canvas + jsPDF via cdnjs (lignes 18-19) |
| `widget.js` (~13 000 lignes, 584 Ko, 392 fonctions, 134 variables globales) | Toute la logique métier et le rendu | Cœur du couplage : `grist.ready`, `grist.docApi.*`, `grist.onRecords`, tables `_grist_ACLRules` |
| `styles.css` (4 247 lignes) | Mise en forme (dont dark mode) | Aucun — réutilisable tel quel |
| `package.json` | Métadonnées du widget Grist (`accessLevel: full`) | Inutile hors Grist |
| `vercel.json` | Headers iframe pour l'hébergement statique (GitHub Pages/Vercel) | À supprimer ; remplacé par la config Apache/Nginx |
| `README.md`, `GUIDE_MAPPING.md`, `EMAIL-NO*.md`, `POWER-AUTOMATE-GUIDE.md`, `n8n-grist-pm-email*.json` (×3), `NOTE-DSI-*` | Documentation, webhooks e-mail | Le mécanisme webhook Grist disparaît (remplacé par SMTP direct en PHP) |

## 3. Empreinte Grist dans `widget.js` (chiffrée)

- **Initialisation / droits** : 1 `grist.ready({ requiredAccess: 'full' })` (ligne 12830) ; détection Owner/Editor/Viewer par test d'écriture (lignes 12833-12920).
- **Accès données** : 45 `grist.docApi.fetchTable`, 7 `listTables`, **125 `applyUserActions`** (30 `AddRecord`, 28 `UpdateRecord`, 20 `RemoveRecord`, 20 `AddTable`, 34 `AddColumn`, 5 `ModifyColumn`, `BulkAddRecord`/`BulkUpdateRecord`), 1 `getAccessToken` + `fetch` REST direct sur `/tables/.../records?auth=...` (ligne 10748), 2 `getDocName`.
- **Temps réel** : 2 `grist.onRecords` → rechargement à chaque changement (lignes 12949-12958).
- **Identité de session** : table d'aide `PM_UserInfo` + formules Grist `user.Email` / `user.Name` (lignes 10697-10795) — mécanisme le plus Grist-spécifique.
- **Sécurité** : lecture des tables système `_grist_ACLRules` / `_grist_ACLResources` selon la matrice `PM_ACL_RULES` (lignes 11290-11312).
- **Schéma** : 18 tables `PM_*` auto-créées (`ensureTables`, ligne 1864+) avec types Grist spécifiques : `Date`/`DateTime` en **epoch seconds**, `Choice` + `widgetOptions`, `ChoiceList` sérialisée `L,a,b`, `Ref:PM_Projects` (ligne 2095). Tables optionnelles hors widget : `Widget_Registry`, `Widget_Permissions`.
- **Autres** : pièces jointes en **base64 dans une colonne Text** (section D2, ligne 1509+), RACI (colonnes `Accountable`/`Consulted`/`Informed`, ~99 références), i18n FR/EN (696 clés, 478 appels `t()`, 154 `data-i18n` dans index.html), filtres en localStorage scopés par nom de document (lignes 3341-3360).

## 4. Faisabilité

**Faisable et favorable.** Le front-end (rendu Kanban/Gantt/Calendrier/Stats, drag & drop, édition inline, dark mode, export CSV/PDF) ne dépend pas de Grist. Seule la **couche d'accès aux données** est couplée : elle est remplaçable 1:1 par une API REST PHP (voir correspondance détaillée dans le plan de migration). Aucun build n'existe aujourd'hui (`package.json` = métadonnées) : l'application cible reste des fichiers statiques + des scripts PHP.

## 5. Moyens logiciels (niveau architecture)

- **Serveur** : Apache ou Nginx + PHP 8.x (php-fpm) + MariaDB 10.x, HTTPS (Let's Encrypt).
- **Back-end** : front controller + API REST JSON par ressource, PDO préparées, sessions sécurisées, middleware de rôles (admin/editor/viewer) traduisant `PM_ACL_RULES`, cron pour e-mails SMTP et automations temporelles, live par polling/SSE.
- **Front-end** : `index.html`/`styles.css` conservés ; `widget.js` découpé en **modules ES** servis tels quels (pas de bundler) : `state.js` (état global), `api.js` (remplace `grist.docApi`), `i18n.js`, `utils.js`, `ui.js`, `filters.js`, `tasks.js`, `notifications.js`, `export.js`, `main.js`, `views/` (calendar, kanban, table, gantt, planning, projects, templates, stats, team, settings). html2canvas/jsPDF auto-hébergés.
- **Données** : schéma MariaDB figé (18 tables, voir plan), FK, index sur les colonnes filtrées.
- **Migration** : export des tables `PM_*` depuis Grist → script PHP d'import normalisé (epoch → `DATETIME`, `Ref` → FK, `ChoiceList` → valeurs).

## 6. Décisions actées

| # | Sujet | Décision | Conséquence |
|---|---|---|---|
| 1 | Périmètre | Toutes les vues (10 onglets) | Portage complet |
| 2 | Authentification | Comptes locaux PHP + sessions | `PM_UserInfo`/`user.Email` supprimés → `$_SESSION` |
| 3 | E-mails | SMTP direct en PHP (file + cron) | Plus de webhook Grist ni de n8n/Power Automate |
| 4 | Migration données | Export Grist → import MariaDB | Script d'import par table, ids Grist conservés |
| 5 | Pièces jointes | **Supprimées** | `PM_Attachments`, UI D2, viewer : supprimés |
| 6 | Espaces | **Mono-espace** | 1 déploiement = 1 espace ; pas de colonne `workspace_id` ; rôles globaux |
| 7 | Mapping de colonnes | **Schéma figé** | `PM_Config`, `loadColumnMapping`, modale mapping, `GUIDE_MAPPING.md` supprimés |
| 8 | Structure du code | `widget.js` découpé en ~15 modules ES | `state.js` centralise les 134 globales ; recette par onglet |
| 9 | RACI | **Supprimé** | Colonnes A/C/I, `raciEnabled`, notifications « concernés R/A/C/I » supprimés ; « concernés » = assigné + responsable de projet |
| 10 | Langues | **Anglais supprimé** ; FR unique mais **termes modifiables globalement** | Table `pm_labels(clé, libellé)` éditable depuis Paramètres (admin), `t()` alimenté par ces libellés avec repli sur dictionnaire FR par défaut |

## 7. Difficultés et risques

1. **Monolithe JS** : 584 Ko, ~170 appels `grist.docApi` disséminés dans le rendu → refactor mécanique volumineux, risque de régression ; mitiger en découpant vue par vue pendant le portage + recette par onglet.
2. **Types Grist à traduire** : dates epoch, `Choice`/`ChoiceList`, `Ref`, formules `user.*` — forte densité de dates dans Gantt/Calendrier.
3. **État global partagé** (134 variables) → centraliser dans `state.js`.
4. **`onclick` inline dans `index.html`** → délégation `data-action` ou pont `window.*` temporaire.
5. **Sécurité à construire from scratch** : SQLi (PDO préparées), XSS, CSRF, sessions, rate-limiting login, CSP/HTTPS, ACL côté serveur (jamais confiance au client).
6. **Live multi-utilisateurs** (`onRecords`) → polling/SSE à valider.
7. **Automations temporelles** (`checkTimeBasedAutomations`, aujourd'hui au chargement du widget) → cron serveur.
8. **Aucun test existant dans le dépôt** → grille de recette UI + tests API (PHPUnit).

## 8. Estimation du temps (1 développeur expérimenté PHP/JS)

| Phase | Contenu | Durée |
|---|---|---|
| 0 | Schéma SQL (18 tables) + script d'import Grist | 1-2 sem. |
| 1 | Socle : auth locale, API CRUD cœur, `state.js`/`api.js`, premières vues | 4-5 sem. |
| 2 | Vues restantes (tableau inline, Gantt, planning, projets, templates, stats, équipe, paramètres + édition globale des libellés) | 4-6 sem. |
| 3 | Transverse : rôles/ACL, notifications + e-mail SMTP, automations + cron, live, exports CSV/PDF, découpage des modules | 3-4 sem. |
| 4 | Migration données, sécurité, perfs, tests, recette, déploiement | 3 sem. |

**Total : ~15-19 semaines (≈ 4-5 mois) à 1 personne ; ~2,5-3 mois à 2 personnes. MVP (auth + tâches + Kanban + calendrier + projets) : ~5-6 semaines.**

## 9. Éléments complémentaires

- **Licence Apache-2.0** : réutilisation libre du code.
- **RGPD** : e-mails des utilisateurs, `PM_ActivityLog` → politique de rétention/purge à prévoir.
- **Exploitation** : sauvegardes `mysqldump` en cron, logs, HTTPS obligatoire.
- **Mono-espace** : si plusieurs documents Grist coexistent aujourd'hui, chacun migre vers son propre déploiement (ou sa propre base MariaDB sur le même serveur) — pas de multi-tenant dans l'application.
- **Questions tranchées** : PJ abandonnées ; mono-espace ; schéma figé ; anglais supprimé (libellés FR éditables globalement) ; RACI supprimé ; e-mails en SMTP direct ; comptes locaux.
