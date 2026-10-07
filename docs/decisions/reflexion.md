LLM WIKI : https://github.com/nashsu/llm_wiki

Je ne chercherais surtout pas à fusionner Onyx/ton RAG enterprise et LLM Wiki tout de suite.

Je structurerais l'évolution de Seshat comme ça :

```text
PHASE 1 — Seshat Knowledge / Enterprise RAG
────────────────────────────────────────────
Connecteurs
   ↓
Ingestion / parsing / OCR
   ↓
Chunking / embeddings / indexation
   ↓
Hybrid Search / reranking
   ↓
Permissions documentaires
   ↓
RBAC / groupes / organisations / tenants
   ↓
SSO / IAM / ACL synchronization
   ↓
API Knowledge
```

L'objectif de cette première phase serait que **le socle enterprise fonctionne parfaitement tout seul**. Une entreprise branche SharePoint, Drive, fichiers internes, etc., les permissions sont respectées et les agents Seshat peuvent rechercher les informations auxquelles leur utilisateur a réellement accès.

Ensuite seulement :

```text
PHASE 2 — Knowledge Intelligence
─────────────────────────────────

Enterprise RAG
     │
     │ documents autorisés
     ▼
Knowledge Processing
     │
     ├── entities
     ├── concepts
     ├── relations
     ├── summaries
     ├── contradictions
     └── provenance
     │
     ▼
Knowledge Graph
     │
     ├──────────────┐
     ▼              ▼
Vector Search    Graph Search
     │              │
     └──────┬───────┘
            ▼
       Seshat Agents
```

Et c'est effectivement **à cette deuxième étape que LLM Wiki devient extrêmement intéressant**.

### Et pour le Desktop, ton idée me paraît encore meilleure

Je ne copierais pas nécessairement son frontend ligne par ligne — notamment à cause de la GPL — mais je prendrais clairement **son paradigme UX comme référence**.

Ton Seshat Desktop pourrait avoir un véritable espace **Knowledge** :

```text
┌──────────────────────────────────────────────────────────────┐
│ SESHAT                                      🔎 Search        │
├────────────┬─────────────────────────────────────────────────┤
│            │                                                 │
│ Home       │              KNOWLEDGE GRAPH                    │
│ Chat       │                                                 │
│ Agents     │       ○ Customer                                │
│            │      / \                                        │
│ Knowledge  │     ○   ○────○ Contract                         │
│ ├ Sources  │    /     \                                      │
│ ├ Wiki     │   ○───────○ Project                             │
│ ├ Graph    │        \                                        │
│ └ Search   │         ○                                       │
│            │                                                 │
│ Skills     ├─────────────────────────────────────────────────┤
│ Workflows  │ Selected: Project Alpha                         │
│            │ Sources · Relations · Agents · Activity         │
└────────────┴─────────────────────────────────────────────────┘
```

Et là, le graphe ne serait **pas simplement décoratif**.

Tu cliques sur `Project Alpha` et tu vois :

```text
Project Alpha
│
├── People
│   ├── Alice Martin
│   └── John Doe
│
├── Customers
│   └── Société X
│
├── Documents
│   ├── Contract.pdf
│   ├── Architecture.docx
│   └── Meeting 2026-09-21
│
├── Concepts
│   ├── Migration Azure
│   └── GDPR
│
└── Related projects
    └── Project Beta
```

Puis tu peux demander directement :

> **Ask Seshat about this node**

et ton agent reçoit automatiquement le sous-graphe + les documents associés + les résultats du retrieval.

C'est là que ton Desktop commence à devenir vraiment différent d'un simple clone de ChatGPT.

### Il y a cependant une règle fondamentale à conserver

**Les permissions du RAG doivent rester la source de vérité.**

Il faudra éviter :

```text
RBAC documents
      ↓
Knowledge Graph
      ↓
❌ graphe accessible à tout le monde
```

Parce que ton Knowledge Graph pourrait involontairement révéler l'existence d'informations confidentielles.

Par exemple, même si Stéphane n'a pas accès à `Acquisition-Company-X.pdf`, voir :

```text
Company X
    └── relation: "Acquisition"
                    │
                 Company Y
```

peut déjà constituer une fuite d'information.

Il faudra donc probablement arriver à quelque chose comme :

```text
User
 ↓
Identity / Groups / Roles
 ↓
ACL Resolver
 ↓
┌──────────────────────────────┐
│ Authorized Knowledge Scope   │
│                              │
│ Documents                    │
│ Chunks                       │
│ Entities                     │
│ Relations                    │
│ Graph traversal              │
└──────────────────────────────┘
 ↓
Retriever / Graph / Agent
```

Et c'est précisément pour ça que **faire RBAC + ACL + RAG avant LLM Wiki est la bonne décision** : quand tu ajouteras la couche knowledge graph, elle héritera d'un modèle de sécurité déjà défini.

À terme, je verrais même quatre objets distincts dans Seshat Desktop : **Sources** = données originales de l'entreprise ; **Knowledge** = connaissance dérivée et structurée ; **Graph** = relations et exploration visuelle ; **Agents** = acteurs qui consomment cette connaissance et agissent.

Ça commence à donner une architecture assez cohérente entre ton **Seshat Runtime**, ton serveur enterprise et ton Desktop, sans faire dépendre tout le produit de LLM Wiki.