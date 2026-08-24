# Méga goal — Pumpologia Explorer sur `pumpologia.app`

## 0. Statut du document

- Statut : cahier des charges proposé, préalable à toute implémentation.
- Date de l'audit initial : 24 août 2026.
- Périmètre audité : fork `pumpologia/mempool`, runtime de production, zone Cloudflare `pumpologia.app`, frontend Pumpologia existant, indexeur Pumpologia mainnet et corpus protocolaire local.
- Effet de cette étape : documentation uniquement. Aucun DNS, conteneur, service, certificat, pare-feu ou contenu public n'est modifié.
- Nom de travail du produit : **Pumpologia Explorer**.
- Domaine canonique cible : **`https://pumpologia.app`**.

Ce document décrit un unique objectif de bout en bout. Ses lots sont des étapes de ce même objectif et non des lancements indépendants pouvant laisser la production dans un état hybride.

## 1. Résultat final attendu

Transformer le fork auto-hébergé de Mempool en un explorateur Bitcoin et Pumpologia entièrement cohérent avec l'identité Pumpologia, servi sur `pumpologia.app`, sans perdre les fonctions fiables de l'explorateur Bitcoin, sans exposer directement l'indexeur interne et sans publier de concepts protocolaires non actifs.

À la fin du méga goal :

1. `pumpologia.app` est l'origine publique et canonique de Pumpologia Explorer ;
2. `www.pumpologia.app` redirige vers l'apex en conservant chemin et paramètres ;
3. `mempool.pumpologia.app` devient une ancienne origine correctement redirigée ou maintenue comme alias de transition documenté ;
4. le frontend servi est compilé depuis le fork Pumpologia, identifié par un vrai commit et une image immuable — plus depuis `mempool/frontend:latest` ;
5. toutes les surfaces publiques accessibles portent l'identité visuelle, éditoriale et sociale Pumpologia ;
6. le site reste un explorateur Bitcoin complet et ajoute des vues Pumpologia natives ;
7. les transactions, blocs et comptes Bitcoin concernés sont enrichis par les données confirmées de l'indexeur Pumpologia ;
8. le statut de synchronisation Bitcoin et le statut de synchronisation Pumpologia sont affichés séparément et sans ambiguïté ;
9. les exigences AGPL, les notices de modification, l'attribution d'origine et la politique de marques du projet amont sont respectées ;
10. le déploiement, la supervision, les sauvegardes, le rollback et la reprise sur un autre cloud sont reproductibles depuis `infra/`.

## 2. État réel constaté avant travaux

### 2.1 Code et historique du fork

Le dépôt `mempool/` suit deux remotes :

- `origin` : `https://github.com/pumpologia/mempool.git` ;
- `upstream` : `https://github.com/mempool/mempool.git`.

Deux commits Pumpologia existent au-dessus de l'amont audité :

- `5984d2274` — ajout du déploiement auto-hébergé Pumpologia et du correctif backend Core/Electrum ;
- `7fbfdf491` — documentation de la route Cloudflare publique.

Les changements spécifiques déjà réalisés portent principalement sur :

- un Compose dédié `docker-compose.pumpologia.yml` ;
- un backend Mempool adapté à Bitcoin Core `getblock` verbosity 3 ;
- un fallback Electrum pour les transactions confirmées pendant la construction de `txindex` ;
- des tests backend associés ;
- la documentation d'exploitation et de rollback.

Il n'existe encore ni thème Pumpologia, ni index HTML Pumpologia, ni routes Pumpologia, ni client d'API Pumpologia dans le frontend Angular.

### 2.2 Runtime de production

Au moment de l'audit, les trois conteneurs dédiés sont sains :

| Service | Rôle | État audité |
|---|---|---|
| `pumpologia-mempool-web` | frontend Nginx/Angular | healthy |
| `pumpologia-mempool-api` | backend Mempool | healthy |
| `pumpologia-mempool-db` | MariaDB isolée | healthy |

Les dépendances existantes sont réutilisées sans être remplacées :

- Bitcoin Core sur `127.0.0.1:8332` ;
- Electrs sur `127.0.0.1:50001` ;
- cookie RPC monté en lecture seule ;
- Cloudflare Tunnel existant ;
- données Mempool dans `/var/lib/pumpologia/mempool/{mysql,cache}`.

Le tip Mempool et le checkpoint Pumpologia étaient tous deux au bloc `963873` lors de la mesure. `txindex` était encore en construction au bloc `387013` : les blocs récents fonctionnent, mais les recherches historiques doivent rester annoncées comme potentiellement incomplètes tant que l'index n'est pas synchronisé.

### 2.3 Frontend réellement servi

Le service web utilise actuellement l'image flottante officielle :

```text
mempool/frontend:latest
```

Le HTML public observé annonce :

- titre : `mempool - Bitcoin Explorer` ;
- description : celle de The Mempool Open Source Project ;
- canonical : `https://mempool.space` ;
- image Open Graph : hébergée sur `mempool.space` ;
- comptes sociaux : `@mempool` ;
- favicon et logo Mempool ;
- version frontend générée : `3.3.1` ;
- aucun contenu dans `resources/customize.js`.

Le rendu est donc fonctionnel mais non personnalisé. Les couleurs dominantes restent noir, bleu, vert et violet. Les blocs, la recherche, les graphiques, le menu mobile, le footer, les écrans d'erreur et les métadonnées ne suivent pas le design Pumpologia.

### 2.4 Configuration fonctionnelle publique actuelle

La configuration runtime observée active :

- Bitcoin mainnet ;
- dashboard mining ;
- prix historiques.

Elle désactive :

- testnet, testnet4, signet et regtest ;
- Liquid et Liquid testnet ;
- Lightning ;
- audit de blocs ;
- accélérateur local ;
- Stratum.

Les surfaces désactivées ne doivent pas être rendues publiques par accident pendant la refonte. Leur code peut hériter du nouveau thème, mais leur activation reste hors périmètre sauf décision explicite.

### 2.5 Domaines et Cloudflare

État audité de la zone active `pumpologia.app` :

| Hôte | DNS/origine actuelle | Résultat public |
|---|---|---|
| `mempool.pumpologia.app` | CNAME proxifié vers le tunnel Pumpologia, origine `http://pumpologia-mempool-web:8080` | HTTPS 200 |
| `pumpologia.app` | A proxifié vers `91.195.240.94` | HTTPS 525 ; page de parking en HTTP |
| `www.pumpologia.app` | A proxifié vers `91.195.240.94` | HTTPS 525 |

Réglages de zone constatés :

- mode SSL Cloudflare : `full` ;
- Always Use HTTPS : désactivé ;
- version TLS minimale : 1.0 ;
- TLS 1.3 : activé ;
- certificat Universal SSL : activé.

La route `mempool.pumpologia.app` a été ajoutée manuellement à la version 17 de la configuration du tunnel. Elle n'est pas encore représentée dans l'infrastructure de reprise. Un futur `terraform apply` sur le module propriétaire de la liste d'ingress pourrait donc la supprimer.

### 2.6 Indexeur Pumpologia disponible aujourd'hui

L'API interne mainnet répond sur `127.0.0.1:8088`. Elle est volontairement non publique. Les routes disponibles sont :

- `/health` ;
- `/sync` ;
- `/tokens` ;
- `/tokens/{token_id}` ;
- `/tokens/{token_id}/mint-history` ;
- `/tickers/{tick}` ;
- `/positions` ;
- `/positions/{position_id}` ;
- `/leaderboard` ;
- `/accounts/{owner_script_hash}` ;
- `/accounts/{owner_script_hash}/history` ;
- `/oracle/prices/{height}` ;
- `/operations` ;
- `/operations/{txid}` ;
- `/simulate/payload` et `/simulate/transaction`, à conserver internes dans ce goal.

Photographie mainnet au moment de l'audit, uniquement pour dimensionner l'interface :

| Objet | Volume audité |
|---|---:|
| tokens | 1 (`paper`, actif) |
| positions | 120 |
| positions ouvertes | 13 |
| positions fermées | 66 |
| positions liquidées | 37 |
| positions expirées | 4 |
| opérations indexées | 151 |
| acteurs classés dans le leaderboard `all` | 64 |

Ces chiffres sont des données vivantes, pas des constantes fonctionnelles.

### 2.7 Contraintes juridiques et de publication

Le fork est distribué sous GNU AGPL v3. L'interface modifiée doit notamment offrir un accès visible au code source correspondant, conserver les notices requises et déclarer que le logiciel a été modifié.

La licence de code n'accorde pas automatiquement le droit d'utiliser les logos, slogans ou marques de Mempool Holdings. La marque principale doit donc être Pumpologia. Les références Mempool restantes doivent être nominatives, exactes et placées dans l'attribution, la licence, la page source ou l'explication de provenance.

Le corpus `specs/protocol/` contient des documents publics et des documents internes. Seuls les fichiers de la liste positive `protocol/public/publication-scope.json` peuvent être projetés vers le site. Une présence dans le workspace ne vaut jamais autorisation de publication.

## 3. Principes non négociables

### 3.1 Source de vérité

- Bitcoin reste la source d'ordre et de confirmation.
- L'indexeur Pumpologia dérive l'état `pumpologia-v1` à partir de l'historique canonique.
- Le frontend n'invente, ne recalcule ni ne corrige silencieusement un état de consensus.
- Une donnée non disponible est affichée comme indisponible, jamais comme zéro.
- Une donnée non confirmée n'est jamais présentée comme état Pumpologia canonique.

### 3.2 Frontière produit

Pumpologia Explorer est un explorateur public. Il ne remplace pas le frontend de trading `pumpologia.com` et ne doit pas absorber sans décision explicite :

- connexion de wallet ;
- signature de PSBT ;
- ouverture ou fermeture de position ;
- gestion de portefeuille privé ;
- administration des runners ;
- secrets, clés ou mnemonics ;
- logique de marché non exposée par l'indexeur actif.

Le broadcast Bitcoin générique déjà fourni par le fork peut être conservé comme outil distinct, avec un avertissement clair. Il ne devient pas un bouton d'exécution Pumpologia.

### 3.3 Frontière protocolaire

La version active est `pumpologia-v1`, activée au bloc `959004`. Les opérations actives sont `deploy`, `long`, `short`, `close` et `send`, avec les sorties conditionnelles et versions de position déjà implémentées.

Les concepts de recherche ou futurs — marketplace, order book complet, claims, proof objects, gouvernance future, interprétation programmable — ne doivent pas être présentés comme actifs. Ils peuvent apparaître uniquement dans une page clairement étiquetée « Research / future », issue du corpus public autorisé, et ne font pas partie du MVP fonctionnel du méga goal.

### 3.4 Production et reprise

- Le build et la qualification se font sur cette machine de production, dans un candidat isolé, avant promotion.
- Aucun port RPC, Electrum, MariaDB, PostgreSQL ou indexeur interne n'est ouvert publiquement.
- Toute modification Cloudflare doit avoir son équivalent dans `infra/` avant la clôture du goal.
- Toute promotion doit disposer d'un rollback testé et d'un manifeste de release.
- Aucune image flottante `latest` n'est acceptable dans l'état final.

## 4. Identité produit et nomenclature

### 4.1 Nom et promesse

Nom principal : **Pumpologia Explorer**.

Nom court dans le header : **PUMPOLOGIA**.

Titre HTML par défaut :

```text
Pumpologia — Bitcoin & Protocol Explorer
```

Format des titres de page :

```text
{Page} | Pumpologia Explorer
```

Proposition de signature éditoriale courte :

```text
Bitcoin orders. Pumpologia interprets.
```

Cette phrase doit être validée éditorialement contre le corpus public avant publication. Elle ne doit pas promettre que Bitcoin exécute ou garantit les règles Pumpologia.

### 4.2 Remplacements éditoriaux obligatoires

| Surface actuelle | Cible |
|---|---|
| logo Mempool | cube + wordmark Pumpologia |
| `mempool - Bitcoin Explorer` | `Pumpologia — Bitcoin & Protocol Explorer` |
| `Explore the full Bitcoin ecosystem` | texte Pumpologia validé |
| recherche Bitcoin uniquement | recherche Bitcoin + Pumpologia |
| `Mempool Goggles` comme marque | `Transaction filters` ou suppression |
| slogan `Be your own explorer` | suppression ou phrase Pumpologia originale |
| comptes `@mempool` | comptes Pumpologia validés |
| canonical `mempool.space` | `https://pumpologia.app{path}` |
| images Open Graph Mempool | visuels Pumpologia locaux |
| liens de source vers le commit amont | commit exact du fork déployé + attribution amont |
| page `About mempool` | `About Pumpologia Explorer` |
| API docs présentées comme service Mempool officiel | `Pumpologia Explorer API`, avec provenance claire |

Le mot commun « mempool » reste autorisé lorsqu'il décrit le pool de transactions Bitcoin. Il ne doit pas être remplacé mécaniquement dans des phrases telles que « transaction in the mempool », « mempool size » ou « projected mempool block ».

### 4.3 Attribution amont

Une zone visible « Source & licenses » doit fournir :

- le lien vers le commit exact `pumpologia/mempool` déployé ;
- la date de la modification Pumpologia ;
- la licence AGPL complète ;
- les notices de copyright existantes ;
- une phrase exacte du type : « Pumpologia Explorer is modified software derived from The Mempool Open Source Project. Mempool Holdings does not sponsor or endorse this service. » ;
- le lien vers la politique de marques amont ;
- l'absence de logo, slogan ou habillage pouvant faire croire à un service officiel Mempool.

Cette section est une exigence produit et de release, pas une note facultative du footer.

## 5. Design system Pumpologia Explorer

### 5.1 Direction visuelle

Le thème par défaut est clair, chaud, sobre et très lisible. L'orange sert à montrer l'action, le focus et les données Bitcoin/Pumpologia importantes ; il ne doit pas teinter toute l'interface ni remplacer les couleurs sémantiques de gain, perte et avertissement.

Le design doit reprendre les fondations du frontend Pumpologia existant plutôt que créer une troisième identité :

- fonds blanc cassé et surfaces blanches ;
- texte encre chaude ;
- orange Bitcoin/Pumpologia ;
- bordures beige-gris discrètes ;
- vert et rouge réservés aux états positifs/négatifs ;
- coins modérément arrondis ;
- typographie éditoriale Rowan ;
- accent de marque Medodica ;
- chiffres, hashes et payloads en monospace.

### 5.2 Tokens canoniques

Les tokens source doivent être partagés ou synchronisés explicitement avec `pumpologia_fe/src/app/globals.css`. Les références suivantes constituent la base de travail :

| Token | Valeur de référence | Usage |
|---|---|---|
| `background` | `oklch(0.985 0.004 75)` / proche `#fbfaf8` | fond de page |
| `foreground` | `oklch(0.19 0.008 60)` / proche `#2b2926` | texte principal |
| `surface` | `#ffffff` | cartes et menus |
| `secondary` | `oklch(0.955 0.006 70)` | contrôles secondaires |
| `accent` | `oklch(0.93 0.018 68)` | hover et sélection douce |
| `primary` | `oklch(0.69 0.18 51)` / référence `#e98312` | action, marque, série principale |
| `primary-strong` | `#b95700` | hover/contraste, après test AA |
| `border` | `oklch(0.87 0.009 70)` / proche `#dedad4` | bordures |
| `chart-grid` | proche `#e8e4df` | grilles |
| `positive` | `#18845b` | gains/validation |
| `negative` | `#c8463f` | pertes/invalidité |
| `warning` | `oklch(0.73 0.15 82)` | attention/retard |
| `info` | `oklch(0.61 0.13 235)` | information secondaire |

Un thème sombre peut être conservé, mais il doit reprendre les tokens déjà utilisés par Pumpologia (`#222d36`, `#f0efeb`, `#79b6d8`, etc.). Le thème clair reste la valeur initiale pour un nouvel utilisateur.

### 5.3 Typographie

- Corps et titres : Rowan 300/400, avec fallbacks serif système.
- Wordmark et petits labels de marque : Medodica.
- Hashes, scripts, identifiants, payloads, nombres tabulaires : pile monospace système.
- Rowan doit être auto-hébergée si sa licence l'autorise ; sinon l'usage CDN doit être explicitement approuvé, documenté dans la CSP et ne transmettre aucune donnée superflue.
- La licence de chaque police copiée dans le fork doit être conservée.

### 5.4 Iconographie et assets

- Réutiliser les assets de marque existants sous `pumpologia_fe/public/brand/` après copie contrôlée dans le fork.
- Utiliser le cube Pumpologia comme favicon, icône PWA, apple touch icon et repère mobile.
- Produire une image Open Graph locale dédiée au format 1200 × 630.
- Supprimer les logos Mempool des surfaces de marque, du tracker, du footer, des favicons, des previews et des données structurées.
- Les icônes fonctionnelles doivent rester simples, cohérentes et accompagnées d'un label ou d'un nom accessible.

### 5.5 Blocs, frais et graphiques

L'identité visuelle historique des blocs peut être conservée comme affordance, mais recolorée :

- blocs projetés : rampe beige → ambre → orange selon les frais ;
- blocs minés : surface claire ou encre avec accent orange ;
- surbrillance Pumpologia : liseré ou badge orange distinct, jamais une couleur seule ;
- graphiques : orange pour la série principale, vert/rouge pour résultat, bleu uniquement pour information neutre ;
- aucune rampe ne doit rendre illisibles les valeurs en blanc ou en noir ;
- les modes daltoniens et contraste élevé doivent conserver des motifs, labels ou formes en plus de la couleur.

### 5.6 Accessibilité et interaction

Exigences minimales :

- WCAG 2.2 AA sur les parcours publics essentiels ;
- ratio de contraste 4,5:1 pour le texte courant, 3:1 pour le grand texte et les composants graphiques nécessaires ;
- focus clavier visible sur tous les contrôles ; la règle actuelle `:focus { outline: none !important; }` doit disparaître ou être remplacée par un `:focus-visible` conforme ;
- ordre de tabulation logique ;
- lien d'évitement vers le contenu ;
- zones tactiles de 44 × 44 px minimum sur écran tactile ;
- aucune information essentielle transmise par la couleur seule ;
- support de `prefers-reduced-motion` ;
- payloads et hashes copiables au clavier et annoncés correctement ;
- tableaux transformés en cartes ou listes lisibles sur mobile sans perdre de colonnes essentielles ;
- aucun débordement horizontal global aux largeurs 320, 360, 390 et 430 px ; seuls les graphes/canvases explicitement scrollables peuvent déborder dans leur propre conteneur.

## 6. Architecture de navigation cible

### 6.1 Navigation principale

Proposition de taxonomie :

**Overview**

- Home
- Live Bitcoin
- Protocol status

**Bitcoin**

- Blocks
- Transactions
- Mempool
- Mining
- Charts

**Pumpologia**

- Activity
- Positions
- Tokens
- Leaderboard
- Oracle

**Tools**

- Broadcast transaction
- Test transaction
- Calculator
- API docs

**Project**

- About
- Protocol docs
- Source & licenses
- Status

Sur mobile, ces sections doivent être accessibles par un menu clair. Le nombre d'icônes de la barre fixe ne doit pas imposer une navigation horizontale ou masquer les routes Pumpologia.

### 6.2 Recherche universelle

Placeholder cible :

```text
Search transaction, block, address, token, ticker or position
```

Le résolveur doit prendre en charge :

- hauteur de bloc ;
- hash de bloc ;
- txid ;
- adresse Bitcoin ;
- ticker Pumpologia ;
- `token_id` ;
- `position_id` et `position_version_id` au format `txid:vout` ;
- hash de script propriétaire si sa forme est explicitement préfixée.

Règles de désambiguïsation :

1. un identifiant `64 hex` est d'abord résolu comme objet Bitcoin ;
2. si la transaction est également un token ou une opération Pumpologia, la page Bitcoin affiche le panneau Pumpologia associé ;
3. `txid:vout` est traité comme position/outpoint ;
4. un ticker court exige une correspondance exacte, insensible à la casse selon la canonicalisation du protocole ;
5. des préfixes explicites `token:`, `position:`, `account:` sont acceptés ;
6. aucun résultat approximatif ne doit rediriger silencieusement vers un autre objet.

### 6.3 URLs canoniques Pumpologia

Routes proposées :

```text
/protocol
/protocol/activity
/protocol/tokens
/protocol/token/:tokenId
/protocol/ticker/:tick
/protocol/positions
/protocol/position/:positionId
/protocol/account/:ownerScriptHash
/protocol/leaderboard
/protocol/oracle/:height
```

Les URLs Bitcoin historiques (`/tx/:id`, `/block/:id`, `/address/:id`, etc.) doivent rester stables pour préserver les liens et la compatibilité amont.

## 7. Refonte des surfaces existantes

### 7.1 Shell global

Doivent être refaits et testés :

- header desktop ;
- navigation mobile ;
- logo et wordmark ;
- recherche et suggestions ;
- sélecteurs de langue, thème, devise et unité ;
- bannières réseau et statut ;
- footer ;
- toasts, modales et tooltips ;
- skeletons et écrans de chargement ;
- pages 404, erreur, maintenance et backend indisponible ;
- embeds, previews et mode clock lorsqu'ils sont publiquement accessibles ;
- métadonnées, favicons, manifest, robots, canonical, Open Graph et cartes sociales.

### 7.2 Homepage

La racine reste un explorateur live, pas une landing page marketing. Elle doit comporter, dans cet ordre logique :

1. recherche universelle ;
2. visualisation des blocs projetés et récents ;
3. bande de santé avec tip Bitcoin, checkpoint Pumpologia, lag et version protocolaire ;
4. frais de transaction ;
5. activité Pumpologia récente ;
6. synthèse des positions par état ;
7. progression de supply du token actif ;
8. difficulté et informations mempool ;
9. accès aux transactions récentes et aux graphiques.

Les widgets Pumpologia doivent se dégrader proprement : si l'indexeur est indisponible, le Bitcoin explorer reste utilisable et affiche un état Pumpologia indisponible avec timestamp de dernière réussite.

### 7.3 Transaction

La page `/tx/:txid` conserve toutes les données Bitcoin. Si `/operations/{txid}` retourne une opération, ajouter un panneau « Pumpologia operation » contenant :

- opération ;
- statut d'indexation ;
- bloc, index de transaction et ordre d'événement ;
- payload UTF-8 et représentation hex si disponible ;
- ticker/token ;
- montant sats, levier et notional pour une position ;
- frais Pumpologia requis ;
- position racine/version concernée ;
- politique TP/SL/Block Time ;
- liens vers token, position, compte et bloc ;
- explication exacte de l'état `valid`, `invalid` ou `ignored` lorsque le contrat le permet.

Une transaction en mempool peut être reconnue comme contenant un payload candidat, mais elle doit porter « Unconfirmed candidate — not canonical Pumpologia state ». Cette fonction reste hors MVP tant qu'un contrat sûr et explicite n'est pas défini.

### 7.4 Bloc

La page bloc doit afficher :

- le prix oracle Pumpologia utilisé pour cette hauteur lorsqu'il existe ;
- le nombre d'opérations Pumpologia ;
- la répartition par opération et statut ;
- la liste des opérations avec txid, ordre, ticker et état ;
- les transitions automatiques observées à ce bloc si l'API les expose ;
- un badge distinct dans les listes de blocs lorsqu'un bloc contient une activité Pumpologia.

L'API actuelle ne permet pas encore une requête filtrée exhaustive par bloc. Cette vue exige l'extension décrite en section 9.4.

### 7.5 Adresse et compte

Sur `/address/:address` :

- conserver balance, UTXO et historique Bitcoin ;
- dériver le scriptPubKey exact sans supposer un seul type d'adresse ;
- calculer le hash de script selon l'algorithme de l'indexeur ;
- interroger le compte Pumpologia correspondant ;
- afficher balances, dettes, disponible et verrouillé par token ;
- lier l'historique Pumpologia paginé ;
- ne jamais présenter `balance - debt` comme supply globale ;
- gérer proprement une adresse sans compte Pumpologia.

Le frontend ne doit pas convertir arbitrairement un script inconnu en adresse. L'identité de consensus reste le script/hash attendu par l'indexeur.

### 7.6 Autres pages Bitcoin

Toutes les routes publiquement accessibles doivent hériter du nouveau design et de la nouvelle terminologie, notamment :

- listes de blocs, blocs stale et transactions ;
- RBF ;
- mining dashboard et pools ;
- mempool projeté ;
- graphiques ;
- calculateur ;
- transaction broadcast/test ;
- statut ;
- documentation API ;
- about, privacy, terms et source ;
- tracker, previews et widgets.

Les fonctions dépendantes de services officiels Mempool non configurés doivent être masquées ou présentées comme liens externes clairement attribués. Aucune fausse disponibilité d'accélération, de wallet, de service enterprise ou de prix ne doit subsister.

## 8. Nouvelles surfaces Pumpologia

### 8.1 Protocol overview — `/protocol`

Cette page résume l'état public confirmé :

- version `pumpologia-v1` ;
- bloc d'activation ;
- checkpoint/hash indexé ;
- lag par rapport à Bitcoin ;
- token(s) et état ;
- supply mintée/max ;
- positions par état et direction ;
- opérations récentes ;
- prix oracle du checkpoint ;
- liens vers le corpus public autorisé.

Elle ne doit pas reprendre automatiquement les documents internes ou archivés.

### 8.2 Activity — `/protocol/activity`

- pagination par curseur opaque ;
- filtres opération, statut, ticker, bloc et période lorsque l'API les supporte ;
- txid, bloc, heure, payload, opération et objet dérivé ;
- liens vers la transaction Bitcoin et l'objet Pumpologia ;
- état vide, erreur, retry et fin de liste explicites ;
- aucun tri client laissant croire que l'ensemble a été trié si seule une page a été chargée.

### 8.3 Positions — liste et détail

Liste :

- direction, ticker, état, marge, levier, notional, entrée, sortie/barrière, bloc d'ouverture et owner hash abrégé ;
- filtres server-side par état, direction, ticker, hauteur et owner ;
- pagination server-side ;
- vues compactes adaptées au mobile.

Détail :

- identité racine et version courante ;
- transaction/outpoint ;
- propriétaire ;
- direction, montant, levier, notional ;
- entrée et règles de sortie ;
- TP, SL, Block Time et deadline ;
- statut terminal et raison ;
- PnL exact, dette, burn/remboursement et allocation token ;
- timeline de versions `ACTIVE`, `SUPERSEDED`, `CONSUMED` ou `SPENT_INVALID` lorsqu'elles existent ;
- liens bloc/transaction/token/compte/oracle.

### 8.4 Tokens — liste et détail

Liste :

- ticker canonique ;
- état ;
- supply mintée/max et pourcentage exact ;
- multiplicateur ;
- bloc de déploiement et premier bloc actif.

Détail :

- `token_id` et transaction de deploy ;
- deployer script/hash ;
- cycle `ACTIVE`/`UNLOCKED` ;
- supply atoms et unités lisibles sans float ;
- historique de mint ;
- positions liées ;
- comptes principaux uniquement si un endpoint agrégé et une justification produit sont ajoutés.

### 8.5 Leaderboard — `/protocol/leaderboard`

- périodes `24h`, `3d`, `1w`, `all` ;
- rang, owner hash, PnL sats, PnL USD exact, retour moyen, victoires, pertes, breakeven, nombre de trades et dernier bloc ;
- timestamp et hauteur `as_of` toujours visibles ;
- explication : seules les positions terminales sont prises en compte ;
- aucune estimation de PnL latent mélangée au classement réalisé ;
- pagination et lien compte.

### 8.6 Oracle — `/protocol/oracle/:height`

- hauteur et hash d'ancrage ;
- prix entier ;
- version de règle oracle ;
- hash de source ;
- caractère confirmé ou indisponible ;
- lien vers le bloc ;
- explication publique courte de la règle de récupération, sans exposer les documents internes.

## 9. Architecture des données Pumpologia

### 9.1 Règle d'exposition

Le navigateur ne contacte jamais `127.0.0.1:8088` et l'indexeur n'écoute jamais publiquement. Le backend Mempool ou une passerelle same-origin dédiée expose une allow-list sous :

```text
/api/pumpologia/v1/*
```

Cette passerelle doit :

- n'autoriser que les routes de lecture nécessaires ;
- exclure `/simulate/*` du périmètre public initial ;
- appliquer délais maximums, limites de taille, validation de paramètres et rate limiting ;
- propager des erreurs structurées sans stack trace ;
- ajouter des informations de fraîcheur ;
- permettre au frontend de distinguer indisponibilité, retard, absence d'objet et donnée invalide ;
- journaliser sans données privées ni secrets ;
- ne pas transformer des entiers/atoms en nombres JavaScript imprécis.

### 9.2 Routes immédiatement consommables

| Besoin UI | Route interne existante | Intégration |
|---|---|---|
| santé | `/health` | proxy lecture |
| checkpoint/lag | `/sync` | proxy + comparaison tip Bitcoin |
| token(s) | `/tokens`, `/tokens/{id}`, `/tickers/{tick}` | proxy lecture |
| historique mint | `/tokens/{id}/mint-history` | proxy lecture bornée |
| positions | `/positions`, `/positions/{id}` | détail immédiat, liste à faire évoluer |
| compte | `/accounts/{hash}` | proxy lecture |
| historique compte | `/accounts/{hash}/history` | proxy paginé |
| oracle | `/oracle/prices/{height}` | proxy lecture |
| opération tx | `/operations/{txid}` | overlay transaction immédiat |
| activité | `/operations` | proxy paginé |
| leaderboard | `/leaderboard` | proxy filtré/paginé |

### 9.3 Contrats frontend

- Générer ou maintenir des types TypeScript depuis OpenAPI.
- Valider les réponses à la frontière réseau.
- Représenter tous les champs `*_atoms`, grands numérateurs, dénominateurs et notional en chaînes/`bigint`, jamais en `number` flottant si la précision peut être perdue.
- Centraliser formatage sats/BTC, atoms/token, USD rationnel, bps, hauteur, temps et hashes.
- Tester les champs optionnels de chaque état de position.
- Ne pas déduire `direction` depuis une couleur ou un signe si le champ est absent.

### 9.4 Extensions d'API nécessaires au résultat complet

Les extensions suivantes sont requises avant de déclarer le goal terminé :

1. pagination et filtres server-side pour `/positions` ;
2. filtre `block_height`, `op`, `status`, `tick` et éventuellement période pour `/operations` ;
3. endpoint ou agrégat de synthèse pour les compteurs de homepage, afin d'éviter de télécharger toutes les positions ;
4. données d'opérations par bloc pour l'overlay bloc ;
5. contrat stable permettant de récupérer le dernier prix oracle confirmé ;
6. indication de fraîcheur/cache dans les réponses de passerelle ;
7. index SQL correspondant à chaque filtre exposé ;
8. bornes de `limit` documentées et testées.

Chaque extension d'indexeur est une modification de lecture, pas une modification des règles de consensus.

### 9.5 Temps réel et cache

Pour la première version :

- le WebSocket Mempool continue d'alimenter Bitcoin ;
- un nouveau bloc déclenche une actualisation ciblée du checkpoint et de l'activité Pumpologia ;
- les données Pumpologia sont rafraîchies avec backoff et arrêt lorsque l'onglet est caché ;
- les routes immuables par bloc/tx peuvent être mises en cache durablement ;
- les routes `/sync`, activité récente et positions ouvertes ont un TTL court ;
- Cloudflare ne cache pas aveuglément `/api/*` ; les règles de cache se fondent sur les en-têtes de la passerelle ;
- une réponse périmée doit afficher son timestamp.

Un flux SSE/WebSocket Pumpologia est une optimisation future, pas une condition du premier cutover, sauf si les mesures montrent que le polling est insuffisant.

### 9.6 Reorgs et cohérence

- Toute vue affiche les données d'une même révision indexée autant que possible.
- Le checkpoint/hash est la référence de cohérence.
- Après reorg, les caches d'objets affectés sont invalidés.
- Une page ouverte sur un objet orphaned affiche un état explicite au lieu d'un 404 silencieux.
- Les données Bitcoin au tip et Pumpologia au checkpoint ne sont jamais fusionnées sans afficher le lag.

## 10. SEO, métadonnées et contenu social

### 10.1 Canonical et indexation

- `metadataBase` logique : `https://pumpologia.app` ;
- canonical unique par route ;
- `www` et ancien sous-domaine non canoniques ;
- sitemap pour les pages statiques et les objets publics utiles, avec stratégie de volume ;
- `robots.txt` cohérent ;
- pages de recherche, previews techniques et URLs infinies exclues si elles créent du contenu dupliqué ;
- réponses 404 réelles pour les objets absents ;
- pas de canonical vers `mempool.space`.

### 10.2 Métadonnées

- description Pumpologia exacte et non promotionnelle ;
- Open Graph local ;
- Twitter/X Pumpologia ;
- favicon/couleur de thème Pumpologia ;
- données structurées `WebSite` et fonction de recherche seulement si elles reflètent le comportement réel ;
- titre et description spécifiques pour transaction, bloc, token et position ;
- aucun logo ou handle Mempool dans les cartes Pumpologia.

### 10.3 Langues

- L'anglais est la langue canonique de lancement, cohérente avec le frontend Pumpologia actuel.
- Le français est la première traduction Pumpologia à fournir.
- Les traductions génériques amont peuvent rester disponibles si elles ne réintroduisent pas les slogans et marques retirés.
- Une chaîne Pumpologia manquante retombe sur l'anglais ; elle ne doit pas afficher une ancienne chaîne Mempool par défaut.
- Les termes protocolaires (`deploy`, `long`, `short`, `close`, `send`, états) restent canoniques dans les données ; leur explication peut être traduite.
- Les `hreflang` ne sont ajoutés que pour des pages réellement traduites.

## 11. Sécurité, confidentialité et robustesse

### 11.1 Surface réseau

- Seuls Cloudflare et le tunnel exposent le frontend.
- Les ports 8999, 3307, 8332, 50001 et 8088 restent non publics.
- Le backend Mempool garde l'accès RPC en lecture/cookie selon le modèle existant.
- La passerelle Pumpologia n'expose aucune mutation, simulation, admin ou secret.
- Le broadcast Bitcoin reste limité, validé et protégé contre l'abus.

### 11.2 Edge et headers

À qualifier puis activer :

- Always Use HTTPS ;
- TLS minimal 1.2 ou supérieur ;
- TLS 1.3 ;
- HSTS après validation de l'apex et de `www` ;
- CSP restrictive, d'abord en report-only ;
- `Referrer-Policy` ;
- `X-Content-Type-Options: nosniff` ;
- `Permissions-Policy` ;
- protection framing adaptée ;
- WAF/rate limit sur `/api/*`, recherche coûteuse et broadcast ;
- pas de cache public des erreurs ou réponses privées.

### 11.3 Dépendances et supply chain

- images Docker épinglées par tag immuable et digest ;
- base frontend construite depuis le fork ;
- vrai SHA Git injecté au build ;
- SBOM ou inventaire des dépendances joint au manifeste de release ;
- audit des dépendances npm et images ;
- aucune mise à jour majeure opportuniste non qualifiée dans le même cutover ;
- procédure documentée de synchronisation avec `upstream` et résolution des conflits du thème/intégration.

### 11.4 Confidentialité

- aucune analytics tierce par défaut ;
- aucune collecte wallet ;
- aucun cookie non nécessaire ;
- politique de logs et durée de conservation documentées ;
- les adresses, scripts et transactions sont des données publiques Bitcoin, mais ne doivent pas être enrichis avec des données personnelles hors chaîne ;
- mise à jour des pages Privacy et Terms pour l'opérateur Pumpologia et la réalité du service.

## 12. Migration de domaine

### 12.1 Préconditions

Avant le cutover :

1. frontend Pumpologia qualifié sur l'origine actuelle ou un hostname candidat ;
2. image frontend du fork épinglée ;
3. API Bitcoin et passerelle Pumpologia saines ;
4. routes critiques testées desktop/mobile ;
5. exports JSON des DNS, paramètres de zone et configuration du tunnel ;
6. état actuel et rollback enregistrés dans un manifeste de release root-only si nécessaire ;
7. zone `pumpologia.app`, enregistrements et ingress représentés dans Terraform/recovery ;
8. alertes et probes prêtes pour l'apex ;
9. aucun conflit avec un autre usage attendu de `pumpologia.app`.

### 12.2 Séquence de cutover

1. Ajouter l'ingress tunnel pour `pumpologia.app` vers `http://pumpologia-mempool-web:8080` via l'infrastructure déclarative.
2. Remplacer l'enregistrement A de parking de l'apex par la route du tunnel avec flattening Cloudflare.
3. Configurer `www.pumpologia.app` comme redirection permanente vers l'apex, chemin et query préservés.
4. Vérifier certificat, HTTP/2/3, WebSocket, HTML, assets, API et recherche.
5. Activer HTTP → HTTPS.
6. Promouvoir `pumpologia.app` comme canonical dans le build déjà prêt.
7. Faire de `mempool.pumpologia.app` un alias de transition ou une redirection 308.
8. Après observation sans erreur, activer HSTS et durcir la version TLS minimale.
9. Purger uniquement les caches nécessaires.

### 12.3 Ancien sous-domaine

Pour les pages GET : redirection 308 vers le même chemin sur l'apex.

Pour `/api/*` et les WebSockets :

- mesurer d'abord l'usage ;
- conserver si nécessaire une courte période d'alias avec en-têtes `Deprecation` et `Link` ;
- éviter une redirection imprévisible d'un POST de broadcast ;
- documenter une date de fin ;
- ne jamais conserver deux canonicals SEO.

### 12.4 Validation externe

- `https://pumpologia.app/` : 200 ;
- `https://www.pumpologia.app/path?q=x` : 308 vers l'apex avec path/query ;
- `http://pumpologia.app/` : redirection HTTPS ;
- ancien sous-domaine : comportement conforme à la politique décidée ;
- `/api/v1/blocks/tip/height` : tip attendu ;
- `/api/pumpologia/v1/sync` : checkpoint attendu ;
- WebSocket live fonctionnel ;
- canonical et Open Graph corrects ;
- aucune ressource active provenant de l'ancienne page de parking ;
- certificat valide sur apex et `www` ;
- aucune 525/502 pendant le soak final hors fenêtre de convergence explicitement enregistrée.

### 12.5 Rollback domaine

Si l'apex échoue :

1. garder ou rétablir `mempool.pumpologia.app` comme origine fonctionnelle ;
2. restaurer la configuration de tunnel sauvegardée ;
3. restaurer les enregistrements DNS précédents uniquement si le retour au parking est réellement souhaité ;
4. remettre le frontend précédent par son digest, sans reconstruire ;
5. ne pas supprimer `/var/lib/pumpologia/mempool` ;
6. vérifier les services Pumpologia existants non concernés ;
7. consigner cause, durée et état final.

## 13. Build, déploiement et maintenance du fork

### 13.1 Frontend reproductible

Créer dans le fork :

- un index HTML Pumpologia ;
- un fichier de customization Pumpologia ;
- un thème SCSS Pumpologia compilé ;
- les assets de marque et leurs licences ;
- la configuration de production Pumpologia ;
- les routes/components/services Pumpologia ;
- les tests de branding interdisant les marques et canonical résiduels ;
- un Dockerfile frontend construit depuis ce code.

Le Compose final doit référencer une image du type :

```text
pumpologia/mempool-frontend:<release-immutable>@sha256:<digest>
```

### 13.2 Backend et passerelle

- conserver les correctifs Core verbosity 3/Electrum dans des commits isolés et testés ;
- ajouter la passerelle Pumpologia dans un module distinct ;
- injecter le SHA réel et la version de release ;
- vérifier la compatibilité avec le backend/frontend amont sélectionné ;
- ne pas lier l'image à un label fictif comme `pumpologia-core-verbosity3` à la place d'un commit.

### 13.3 Promotion en production

1. sauvegardes et manifeste pré-release ;
2. build sur l'hôte final ;
3. lancement candidat sur loopback ou origine Cloudflare temporaire ;
4. tests contractuels, visuels et fonctionnels ;
5. comparaison tip/checkpoint ;
6. promotion atomique du candidat ;
7. soak ;
8. retrait du candidat précédent uniquement après validation ;
9. conservation de l'image et des instructions de rollback.

### 13.4 Suivi upstream

- garder `upstream` configuré ;
- ne jamais lancer un merge automatique en production ;
- lire les notes de version ;
- rebaser/merger dans une branche dédiée ;
- exécuter les tests amont et Pumpologia ;
- vérifier les fichiers de thème, routes, index HTML, API contracts et notices ;
- publier une nouvelle image/digest et un manifeste ;
- documenter les conflits récurrents afin de minimiser le coût du fork.

## 14. Observabilité et exploitation

### 14.1 Métriques et probes

Ajouter au minimum :

- probe HTTPS apex ;
- probe redirection `www` ;
- probe API tip Bitcoin ;
- probe santé/sync Pumpologia via la passerelle ;
- probe WebSocket ou test synthétique live ;
- état des conteneurs web/api/db ;
- latence et taux 4xx/5xx par famille d'API ;
- écart tip Bitcoin/checkpoint Pumpologia ;
- progression `txindex` ;
- utilisation MariaDB/cache ;
- restart count et saturation CPU/RAM/disque ;
- erreurs Cloudflare tunnel/origin.

### 14.2 Alertes

Alertes recommandées :

- apex indisponible deux probes consécutives ;
- API Bitcoin indisponible ;
- indexeur Pumpologia indisponible ;
- lag Pumpologia supérieur au seuil convenu pendant plus d'une fenêtre ;
- WebSocket cassé ;
- conteneur unhealthy/restart loop ;
- croissance anormale DB/log/cache ;
- expiration ou erreur certificat ;
- hausse soutenue de 5xx/429 ;
- `txindex` bloqué sans progression.

### 14.3 Logs et dashboards

Les conteneurs `pumpologia-mempool-*` doivent être inclus dans Promtail/Grafana et dans les expressions de sélection actuellement limitées aux autres conteneurs Pumpologia. Les logs doivent être structurés et ne jamais inclure cookie RPC, DSN, secrets Cloudflare ou payload d'administration.

### 14.4 Runbook

Le runbook doit couvrir :

- vérifier tip Bitcoin et checkpoint Pumpologia ;
- diagnostiquer 525/502/504 ;
- diagnostiquer WebSocket ;
- distinguer panne explorer et panne indexeur ;
- relancer seulement la stack Mempool ;
- suivre `txindex` ;
- restaurer l'image précédente ;
- restaurer/retirer une route Cloudflare ;
- reconstituer MariaDB/cache ;
- reprendre sur un nouveau cloud.

## 15. Sauvegarde et reprise après sinistre

### 15.1 Classification des données

| Donnée | Nature | Stratégie |
|---|---|---|
| code du fork | source de vérité Git | origin + commit/digest |
| config Cloudflare | état externe critique | Terraform + import + export pré-release |
| MariaDB Mempool | statistiques/index auxiliaire | sauvegarde ou procédure de reconstruction mesurée |
| cache Mempool | reconstructible | pas de dépendance unique |
| Bitcoin Core/Electrs | dépendances lourdes existantes | reprise infra existante |
| indexeur Pumpologia/Postgres | état dérivé critique/rejouable | stratégie existante + backup/replay |
| secrets | non versionnés | mécanisme de fourniture documenté |

### 15.2 Exigences `infra/`

Le goal n'est pas terminé tant que `infra/` peut recréer :

- la stack Mempool web/api/db ;
- les images exactes ou leur méthode de build déterministe ;
- les volumes et permissions ;
- les règles firewall étroites ;
- la zone/les records `pumpologia.app` ;
- les ingress apex, `www` et ancien host ;
- les probes/alertes/logs ;
- les variables exemples sans secrets ;
- les vérifications post-reprise.

La cible reste un redémarrage sur un autre cloud avec un minimum d'actions manuelles après fourniture des secrets.

## 16. Tests et critères de qualité

### 16.1 Tests de code

- lint frontend/backend ;
- build Angular production/locales ;
- tests unitaires backend existants et nouveaux ;
- tests unitaires du résolveur de recherche ;
- tests de formatage `bigint`/atoms/rationnels ;
- tests du client OpenAPI et des états optionnels ;
- tests de la passerelle : allow-list, timeout, 404, 422, 503, taille, rate limit ;
- tests empêchant l'exposition de `/simulate/*` ;
- tests de reorg/cache ;
- tests des correctifs Core/Electrum existants.

### 16.2 End-to-end

Parcours obligatoires :

1. homepage live ;
2. recherche hauteur/hash/txid/adresse ;
3. recherche ticker/token/position ;
4. transaction Bitcoin sans opération Pumpologia ;
5. transaction `deploy`, `long`, `short`, `close` ou `send` lorsqu'un exemple existe ;
6. bloc avec et sans opérations Pumpologia ;
7. adresse avec et sans compte Pumpologia ;
8. token liste/détail ;
9. position ouverte et chaque état terminal disponible ;
10. activity pagination ;
11. leaderboard et périodes ;
12. indexeur indisponible alors que Bitcoin reste fonctionnel ;
13. backend Bitcoin indisponible ;
14. navigation clavier ;
15. thème clair/sombre ;
16. redirections de domaine ;
17. API et WebSocket via Cloudflare.

### 16.3 Régression visuelle

Captures de référence au minimum pour :

- 320 × 568 ;
- 390 × 844 ;
- 768 × 1024 ;
- 1440 × 1000 ;
- 1920 × 1080 ;
- thèmes clair et sombre ;
- homepage, transaction, bloc, adresse, token, position, activity et erreur.

### 16.4 Budgets web

Objectifs au 75e percentile sur mobile raisonnable :

- LCP ≤ 2,5 s ;
- INP ≤ 200 ms ;
- CLS ≤ 0,1 ;
- aucun asset de marque distant bloquant ;
- pas d'augmentation non justifiée du bundle initial ;
- lazy loading des modules Pumpologia secondaires ;
- aucune requête N+1 par ligne de tableau.

### 16.5 Tests de contenu

Le build échoue si les surfaces Pumpologia contiennent encore, hors allow-list d'attribution/terme technique :

- canonical `mempool.space` ;
- handle `@mempool` ;
- slogans protégés ;
- logos Mempool ;
- titre `mempool - Bitcoin Explorer` ;
- liens vers des services désactivés présentés comme locaux ;
- documents internes exclus de `publication-scope.json`.

## 17. Lots d'exécution du méga goal

### Lot 0 — Baseline et gel

Livrables :

- inventaire routes/assets/chaînes ;
- captures desktop/mobile ;
- baseline fonctionnelle et performance ;
- export Cloudflare ;
- manifeste des images/runtime ;
- liste des endpoints et exemples de contrats ;
- statut `txindex`.

Sortie : baseline reproductible et rollback connu.

### Lot 1 — Build du fork et fondations de marque

Livrables :

- frontend construit depuis le fork ;
- image immuable ;
- index/config/customization Pumpologia ;
- assets et métadonnées ;
- liens source/licence corrects ;
- test anti-branding résiduel.

Sortie : même fonctionnalité Bitcoin, identité Pumpologia et aucun `latest`.

### Lot 2 — Design system et shell complet

Livrables :

- tokens clair/sombre ;
- typographie ;
- header/navigation/footer ;
- recherche, formulaires, cartes, tableaux, graphiques ;
- focus/accessibilité ;
- états loading/error/empty ;
- responsive complet.

Sortie : toutes les routes accessibles héritent du nouveau système.

### Lot 3 — Refonte exhaustive des pages Bitcoin

Livrables :

- homepage ;
- blocs/transactions/adresses ;
- mempool/mining/graphs ;
- outils/docs/status/legal ;
- suppression ou externalisation des services non configurés ;
- tests E2E/visuels.

Sortie : aucun écran public hybride Pumpologia/Mempool.

### Lot 4 — Passerelle Pumpologia et contrats

Livrables :

- préfixe same-origin ;
- allow-list read-only ;
- types OpenAPI ;
- cache/fraîcheur/rate limits ;
- endpoints de filtre/agrégats manquants ;
- tests de précision et erreurs.

Sortie : API publique minimale, sûre, documentée et scalable.

### Lot 5 — Vues et overlays Pumpologia

Livrables :

- overview, activity, positions, tokens, accounts, leaderboard, oracle ;
- overlays transaction/bloc/adresse ;
- recherche universelle ;
- liens croisés Bitcoin ↔ Pumpologia ;
- gestion reorg/lag.

Sortie : parcours Pumpologia complet à partir des données confirmées.

### Lot 6 — Exploitation, sécurité et DR

Livrables :

- headers/CSP/rate limits ;
- logs, metrics, dashboards, alertes ;
- backups/rebuild ;
- Terraform zone/tunnel/routes ;
- recovery Compose et runbook ;
- test de reprise ciblé.

Sortie : l'explorateur est opérable et reconstructible.

### Lot 7 — Cutover `pumpologia.app`

Livrables :

- apex live ;
- `www` et ancien sous-domaine traités ;
- HTTPS/TLS/canonical validés ;
- soak et rapport de promotion ;
- rollback prêt.

Sortie : domaine canonique migré sans régression.

### Lot 8 — Stabilisation finale

Livrables :

- correction des anomalies de soak ;
- audit marque/licence/contenu ;
- audit accessibilité/performance ;
- validation observabilité/DR ;
- documentation finale ;
- backlog futur séparé.

Sortie : méga goal clôturable.

## 18. Définition de terminé globale

Le méga goal est terminé uniquement si toutes les assertions suivantes sont vraies :

### Domaine

- [ ] `pumpologia.app` sert Pumpologia Explorer en HTTPS 200.
- [ ] `www` redirige correctement.
- [ ] l'ancien sous-domaine suit la politique de transition décidée.
- [ ] aucun 525 n'est observé après la fenêtre de convergence.
- [ ] canonical, sitemap et cartes sociales pointent vers l'apex.

### Branding/design

- [ ] le logo, le nom, les couleurs, les fontes et le ton sont Pumpologia.
- [ ] aucune route publique accessible n'affiche un shell Mempool résiduel.
- [ ] les termes « mempool » restants sont techniques ou nominatifs et allow-listés.
- [ ] clair/sombre, mobile/desktop et reduced-motion sont validés.
- [ ] l'accessibilité AA des parcours essentiels est démontrée.

### Fonctionnel Bitcoin

- [ ] homepage, recherche, blocs, transactions, adresses, mempool, mining et outils critiques fonctionnent.
- [ ] WebSocket live fonctionne par Cloudflare.
- [ ] le statut incomplet de `txindex` est visible tant qu'il existe.
- [ ] les services non configurés ne sont pas présentés comme disponibles.

### Fonctionnel Pumpologia

- [ ] santé, sync, tokens, positions, activity, comptes, oracle et leaderboard sont accessibles.
- [ ] les overlays tx/bloc/adresse fonctionnent.
- [ ] le lag et la révision indexée sont visibles.
- [ ] les nombres exacts restent exacts.
- [ ] aucune donnée non confirmée n'est qualifiée de canonique.
- [ ] aucun concept futur n'est présenté comme actif.

### Technique

- [ ] frontend compilé depuis le fork et images épinglées.
- [ ] vrai SHA Git affiché et source correspondante accessible.
- [ ] passerelle Pumpologia read-only, bornée et rate-limitée.
- [ ] tests unitaires, contrats, E2E et visuels passent.
- [ ] budgets performance acceptés.
- [ ] headers de sécurité qualifiés.

### Opérations

- [ ] probes, métriques, logs et alertes sont actifs.
- [ ] `infra/` représente la zone `.app`, le tunnel et la stack.
- [ ] backup/rebuild et rollback sont documentés et testés proportionnellement au risque.
- [ ] manifeste de release et rapport de soak existent.
- [ ] aucun secret n'est ajouté au Git.

### Licence/publication

- [ ] notices AGPL et de modification visibles.
- [ ] lien vers le source exact déployé.
- [ ] attribution amont exacte et absence de confusion de marque.
- [ ] seuls les documents du périmètre public autorisé sont projetés.

## 19. Décisions à valider avant implémentation visuelle lourde

Ces décisions ne bloquent pas la préparation technique, mais doivent être figées avant de finaliser les maquettes et les textes :

1. signature éditoriale finale ;
2. place exacte du mot « Explorer » dans le wordmark ;
3. homepage strictement data-first ou présence d'un court manifeste au-dessus de la ligne de flottaison ;
4. anglais seul au premier cutover ou anglais + français simultanés ;
5. maintien du thème sombre ;
6. durée de transition de `mempool.pumpologia.app` ;
7. conservation ou suppression du broadcast/test transaction ;
8. profondeur des pages mining/graphs dans la navigation principale ;
9. sélection du visuel Open Graph ;
10. libellé public des états et de l'oracle, à valider contre le corpus publiable.

Décision recommandée par défaut : homepage data-first, anglais + français pour les chaînes Pumpologia, thème clair par défaut avec sombre conservé, ancien sous-domaine en alias mesuré puis redirection, broadcast conservé mais clairement séparé du protocole.

## 20. Hors périmètre à reporter dans un backlog séparé

- connexion wallet et trading ;
- interprétation canonique des transactions Pumpologia non confirmées ;
- création de token/position depuis l'explorateur ;
- marketplace, carnet d'ordres ou claims non disponibles dans v1 ;
- activation Lightning/Liquid/testnet ;
- refonte du consensus Pumpologia ;
- publication automatique de l'ensemble de `specs/protocol` ;
- fusion de code Angular avec le frontend Next.js de `pumpologia.com` ;
- remplacement de Bitcoin Core, Electrs, de l'indexeur ou de l'oracle ;
- migration du domaine `pumpologia.com`.

## 21. Résumé de la trajectoire recommandée

La priorité n'est pas de changer immédiatement deux enregistrements DNS. Le chemin sûr est :

```text
frontend réellement forké et reproductible
→ design system Pumpologia complet
→ passerelle indexeur read-only
→ vues et overlays Pumpologia
→ tests, observabilité et recovery
→ cutover apex/www
→ redirection de l'ancien sous-domaine
→ audit final licence, vérité et reprise
```

Cette séquence conserve l'explorateur actuellement fonctionnel jusqu'à ce qu'une version Pumpologia entièrement qualifiée soit prête, puis transforme `pumpologia.app` en une vraie surface publique de lecture de Bitcoin et du protocole plutôt qu'en simple skin du site amont.
