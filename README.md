# Case Technique Stéphane Guichard — Développeur Full Stack

Hello, voici mon take sur votre cas pratique.

## Run

### tldr

```bash
# Lancer l'API
docker compose up api

# Lancer la web app sur localhost:3000
cd web && npm run dev
```

### API (Docker)

```bash
# Lancer l'API
docker compose up api

# Vérifier que l'API répond
curl http://localhost:8000/health

# Arrêter l'API
docker compose down
```

L'API est exposée sur **http://localhost:8000** (Swagger : `/docs`). Le frontend (`web/`) peut pointer vers cette URL.

Sans Docker :

```bash
uvicorn api.main:app --reload --port 8000
```

### Done

- [x] **Backend API** avec endpoint de streaming (SSE ou WebSocket)
- [x] **Frontend web** avec :
  - [x] Champ texte pour poser des questions
  - [x] Affichage **streaming** du thinking (collapsible/dépliable)
  - [x] Affichage des **tool calls** (nom de l'outil, arguments, résultat)
  - [x] Rendu des **visualisations Plotly** (graphiques interactifs)
  - [x] Rendu des **tableaux** de données
- [x] **Code propre** et structuré

## Not done mais à faire

- [ ] Rate limiting pour eviter de burn trop de token
  - [ ] Dans le front-end comme un premier garde-fou
  - [ ] Back-end
- [ ] Peristance des sessions (front-end et backend)
  - [ ] v1 dans la session du navigateur
  - [ ] v2 avec database
- [ ] Persistance du contexte, Memory mieux développée : pour eventuellement apprendre des patterns de l'user dans son utilisation du chat ?
- [ ] Error handling peu étudié
- [ ] Protection prompt engineering & autre vulnérabilités liées aux LLM
- [ ] Framework de tests plus poussés, e2e, et front-end pour appli robuste
- [ ] Si déploiement, sécuriser l'API avec authentification + api proxy en front-end. (par exemples routes tanstack côté serveur qui n'exposent pas les tokens d'auth avec l'API)

#### UI/UX

- [ ] Suggestions de "next messages" suivant le contexte, avec des composant `Chip` clickables
- [ ] Upload d'images pour montrrer des possiblités de graphes ?
- [ ] Possibilité de générer un report post chat ?

# Consignes

## Contexte

Tu reçois un **agent d'analyse de données** qui fonctionne en mode CLI (terminal).

L'agent peut :

- Répondre à des questions sur des données en générant du **SQL** (via DuckDB)
- Créer des **visualisations** avec Plotly
- Expliquer son **raisonnement** (balises `<thinking>`)
- Enchaîner les étapes automatiquement via des **tool calls**

L'agent est construit avec [PydanticAI](https://ai.pydantic.dev/).

---

## Objectif

**Transformer cet agent CLI en une application web complète.**

L'utilisateur doit pouvoir poser des questions dans une interface web et voir en temps réel :

1. Le **raisonnement** de l'agent (thinking) — affiché progressivement
2. Les **appels d'outils** (tool calls) — nom, arguments, résultat
3. Les **visualisations** Plotly / tableaux de données
4. La **réponse finale** de l'agent

---

## Ce qui est fourni

```
case_fullstack/
├── agent/
│   ├── agent.py              # Création de l'agent PydanticAI
│   ├── context.py            # Contexte injecté dans les tools
│   ├── prompt.py             # System prompt
│   └── tools/
│       ├── query_data.py     # Exécution SQL via DuckDB
│       └── visualize.py      # Création de visualisations Plotly
├── data/                     # Fichiers CSV (tes données de test)
├── output/                   # Visualisations générées
├── api/                      # Backend FastAPI (SSE streaming)
├── main.py                   # Script CLI de démonstration
├── Dockerfile                # Image CLI agent
├── Dockerfile.api            # Image API FastAPI
├── docker-compose.yml
├── requirements.txt
├── .env.example
└── README.md
```

---

## Setup

```bash
# 1. Configurer la clé API
cp .env.example .env
# Éditer .env avec ta clé API

# 2. Ajouter des fichiers CSV dans data/

# 3. Lancer le CLI via Docker
docker compose run --rm agent
```

---

## Ce qui est attendu

### Minimum requis

- [x] **Backend API** avec endpoint de streaming (SSE ou WebSocket)
- [x] **Frontend web** avec :
  - [x] Champ texte pour poser des questions
  - [x] Affichage **streaming** du thinking (collapsible/dépliable)
  - [x] Affichage des **tool calls** (nom de l'outil, arguments, résultat)
  - [x] Rendu des **visualisations Plotly** (graphiques interactifs)
  - [x] Rendu des **tableaux** de données
- [x] **Code propre** et structuré

---

## Stack technique

- **Backend** : FastAPI
- **Frontend** : Libre React
- **Streaming** : SSE ou WebSocket (à ton choix)

---

## Critères d'évaluation

| Critère            | Description                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **Fonctionnalité** | Le streaming fonctionne, le thinking s'affiche en temps réel, les tool calls sont visibles, les visualisations s'affichent |
| **Code**           | Propre, structuré, lisible, bien découpé                                                                                   |
| **UX**             | L'expérience utilisateur est fluide et intuitive                                                                           |
| **Architecture**   | Bonne séparation frontend / backend, gestion des états cohérente                                                           |

---

## Ressources utiles

- [PydanticAI — Documentation](https://ai.pydantic.dev/)
- [PydanticAI — Streaming](https://ai.pydantic.dev/streaming/)
- [PydanticAI — Tools](https://ai.pydantic.dev/tools/)
- [Plotly.js — React integration](https://plotly.com/javascript/react/)
- [FastAPI — Streaming Response](https://fastapi.tiangolo.com/advanced/custom-response/#streamingresponse)
- [Server-Sent Events (SSE)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
