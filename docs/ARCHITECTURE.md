# BrandMultiplier GTM — Architecture (Self-Improving, Multi-Tenant, Multi-Channel)

**Ultimo aggiornamento**: 2026-03-13

---

## Vision

BrandMultiplier GTM è un motore GTM autonomo che si auto-migliora. Ogni tenant (cliente) ha un agente AI che gestisce l'intero funnel di acquisizione, ottimizzando continuamente messaggi, targeting, timing e canali basandosi su dati reali.

Pattern di riferimento: [karpathy/autoresearch](https://github.com/karpathy/autoresearch) — loop autonomo di sperimentazione con metrica incorruttibile e rollback automatico.

---

## Principi di design

1. **Channel-agnostic core**: il loop di ottimizzazione è lo stesso per LinkedIn, email, ads. Cambia solo il connector e la metrica.
2. **Multi-tenant nativo**: ogni cliente ha il suo spazio isolato (playbook, account, budget, esperimenti, learnings).
3. **Self-improving**: l'agente AI propone ipotesi, esegue esperimenti, misura, tiene o scarta. L'umano supervisiona, non esegue.
4. **Learnings composti**: ogni esperimento produce un learning. I learning di un tenant possono (opt-in) alimentare il modello globale. Più clienti = agente più intelligente.

---

## Layer architecture

```
┌─────────────────────────────────────────────────────────┐
│                    BrandMultiplier GTM PLATFORM                     │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  Experiment  │  │  Analytics   │  │   AI Agent   │     │
│  │   Engine     │  │   Engine     │  │   (LLM)      │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                 │                 │              │
│  ┌──────┴─────────────────┴─────────────────┴──────┐      │
│  │              TENANT LAYER                        │      │
│  │                                                  │      │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐      │      │
│  │  │ Playbook │  │ Accounts │  │ Learnings│      │      │
│  │  │ (config) │  │ (creds)  │  │ (log)    │      │      │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘      │      │
│  │       │              │              │            │      │
│  │  ┌────┴──────────────┴──────────────┴────┐      │      │
│  │  │           CHANNEL LAYER                │      │      │
│  │  │                                        │      │      │
│  │  │  ┌───────────┐ ┌─────────┐ ┌────────┐│      │      │
│  │  │  │ LinkedIn  │ │  Email  │ │  Ads   ││      │      │
│  │  │  │ Connector │ │Connector│ │Connector││      │      │
│  │  │  └─────┬─────┘ └────┬────┘ └───┬────┘│      │      │
│  │  │        │             │          │     │      │      │
│  │  │  ┌─────┴─────────────┴──────────┴───┐ │      │      │
│  │  │  │      EXPERIMENT LAYER            │ │      │      │
│  │  │  │  variant A vs B → measure → keep │ │      │      │
│  │  │  └──────────────────────────────────┘ │      │      │
│  │  └────────────────────────────────────────┘      │      │
│  └──────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

---

## Data model

### Tenant

```typescript
interface Tenant {
  id: string;
  name: string;                    // "Claw4Growth", "BrandMultiplier"
  playbook: Playbook;              // le istruzioni per l'agente (= program.md)
  accounts: ChannelAccount[];      // LinkedIn, email, ads accounts
  experiments: Experiment[];
  learnings: Learning[];
  globalLearningsOptIn: boolean;   // condividi learnings col modello globale
}
```

### Playbook (equivalente di program.md)

```typescript
interface Playbook {
  tenantId: string;

  // Chi targetare
  icp: {
    segments: Segment[];           // freelancer, personal brand, PMI...
    antiPersonas: string[];        // chi NON targetare
  };

  // Come comunicare
  voice: {
    tone: string;                  // "diretto, colloquiale, zero corporate"
    language: string;              // "it", "en"
    constraints: string[];         // "mai em dash", "mai emoji eccessivi"
  };

  // Budget e limiti
  limits: {
    linkedin: { invitesPerWeek: number; messagesPerDay: number };
    email: { sendsPerDay: number };
    ads: { dailyBudget: number; currency: string };
  };

  // Obiettivi (le metriche incorruttibili)
  goals: {
    primaryMetric: string;         // "reply_rate" | "meeting_booked" | "signup"
    targetValue: number;           // es. 0.15 (15% reply rate)
  };

  // Regole etiche (l'agente NON può violarle)
  ethics: string[];                // "no messaggi ingannevoli", "max 1 follow-up se no reply"
}
```

### Channel Account

```typescript
interface ChannelAccount {
  id: string;
  tenantId: string;
  channel: "linkedin" | "email" | "ads_meta" | "ads_google";
  provider: string;                // "unipile" | "sendgrid" | "meta_ads_api" | "google_ads_api"
  credentials: Record<string, string>;  // encrypted
  status: "active" | "paused" | "error";
}
```

### Experiment (il cuore del self-improvement)

```typescript
interface Experiment {
  id: string;
  tenantId: string;
  channel: string;

  // Ipotesi (generata dall'AI)
  hypothesis: string;              // "Citare un post specifico del prospect aumenta l'accept rate"

  // Varianti
  control: Variant;                // la versione attuale (vincente)
  challenger: Variant;             // la nuova proposta

  // Parametri
  sampleSize: number;              // quanti contatti per variante
  startedAt: string;
  endsAt: string;                  // quando valutare

  // Risultati
  status: "running" | "completed" | "failed";
  results?: {
    control: VariantMetrics;
    challenger: VariantMetrics;
    winner: "control" | "challenger" | "inconclusive";
    confidence: number;            // statistical significance
  };

  // Learning generato
  learningId?: string;
}

interface Variant {
  id: string;
  type: "message" | "targeting" | "timing" | "sequence" | "ad_creative" | "subject_line";
  content: Record<string, unknown>;  // il contenuto specifico della variante
}

interface VariantMetrics {
  sent: number;
  // LinkedIn
  accepted?: number;
  replied?: number;
  positiveReply?: number;
  // Email
  opened?: number;
  clicked?: number;
  // Ads
  impressions?: number;
  clicks?: number;
  conversions?: number;
  costPerConversion?: number;
  // Universal
  conversionRate: number;
}
```

### Learning (equivalente di results.tsv)

```typescript
interface Learning {
  id: string;
  tenantId: string;
  experimentId: string;
  channel: string;

  // Cosa abbiamo imparato
  insight: string;                 // "Citare post specifici: +12% accept rate su freelancer IT"
  direction: "positive" | "negative" | "neutral";

  // Contesto per applicabilità futura
  segment: string;                 // su quale segmento vale
  metric: string;                  // quale metrica ha impattato
  magnitude: number;               // +0.12 (12%)
  confidence: number;

  // Per il modello globale
  isGlobal: boolean;               // altri tenant possono beneficiarne
  createdAt: string;
}
```

---

## Self-improvement loop (per tenant, per canale)

### Il loop (equivalente del loop autoresearch)

```
EVERY [evaluation_interval]:       // LinkedIn: settimanale, Email: 2-3 giorni, Ads: giornaliero

  1. MEASURE
     └─ Raccogli metriche dal canale (webhook LinkedIn, email tracking, ads API)
     └─ Aggiorna risultati esperimenti in corso
     └─ Se esperimento completato → determina vincitore → genera Learning

  2. ANALYZE
     └─ AI legge: playbook + learnings passati + esperimenti in corso + metriche attuali
     └─ Identifica: cosa funziona, cosa no, cosa non abbiamo ancora testato

  3. HYPOTHESIZE
     └─ AI genera 1-3 ipotesi ordinate per impatto atteso
     └─ Ogni ipotesi ha: rationale, variante proposta, metrica target, sample size
     └─ Ipotesi informate dai learnings (non ripetere errori)

  4. EXECUTE
     └─ Crea nuovo Experiment con control (attuale vincente) + challenger (nuova variante)
     └─ Split traffic: metà control, metà challenger
     └─ Rispetta limiti del playbook

  5. ROLLBACK / PROMOTE
     └─ Se challenger vince → diventa il nuovo control
     └─ Se challenger perde → rollback, logga learning negativo
     └─ Se inconclusivo → estendi o scarta

  6. COMPOUND
     └─ Aggiorna learnings
     └─ Se globalLearningsOptIn → pubblica nel pool globale
     └─ Il prossimo ciclo parte da una base migliore
```

### Tempi di iterazione per canale

| Canale | Feedback loop | Esperimenti/mese | Metrica primaria |
|--------|--------------|-----------------|-----------------|
| LinkedIn outreach | 5-7 giorni | 4-5 | Accept rate, reply rate |
| Email outreach | 2-3 giorni | 10-12 | Open rate, reply rate |
| Meta Ads | 1-2 giorni | 15-20 | CTR, CPA, ROAS |
| Google Ads | 1-2 giorni | 15-20 | CTR, CPA, ROAS |
| Content (post) | 7 giorni | 4 | Engagement rate, profile visits |

### Compound learnings (il vero vantaggio a scala)

```
Mese 1:  Tenant A scopre "citare post specifici +12% accept rate"
Mese 2:  Tenant B (opt-in) inizia già con quel learning → skip dell'esperimento
Mese 3:  Tenant C scopre "su freelancer IT, il tono informale batte il formale +18%"
Mese 4:  Tutti i tenant con segmento freelancer IT beneficiano
...
Mese 12: Il sistema ha 200+ learnings validati → ogni nuovo tenant parte da una base già ottimizzata
```

Questo è il moat: **più clienti → più esperimenti → più learnings → agente più intelligente → risultati migliori → più clienti**.

---

## Collective Brain — Learning RAG

Il sistema ha due livelli di intelligenza: il **tenant loop** (ogni cliente ottimizza per sé) e il **collective brain** (pattern cross-tenant).

### Come funziona

Non è un RAG classico (documenti statici → embedding → retrieve → genera). È un **learning store strutturato** con retrieval ibrido:

```
                    ┌─────────────────────────────────────┐
                    │         COLLECTIVE BRAIN              │
                    │                                       │
                    │  ┌─────────────────────────────────┐ │
                    │  │     STRUCTURED LEARNING STORE    │ │
                    │  │                                   │ │
                    │  │  learning {                       │ │
                    │  │    segment, channel, metric,      │ │
                    │  │    magnitude, confidence,         │ │
                    │  │    sample_size, tenant_count      │ │
                    │  │  }                                │ │
                    │  └──────────┬────────────────────────┘ │
                    │             │                          │
                    │  ┌──────────┴────────────────────────┐ │
                    │  │       HYBRID RETRIEVAL             │ │
                    │  │                                    │ │
                    │  │  1. Filter: canale + metrica       │ │
                    │  │  2. Semantic: nicchia similarity    │ │
                    │  │  3. Rank: confidence × recency     │ │
                    │  └──────────┬─────────────────────────┘ │
                    │             │                           │
                    │  ┌──────────┴─────────────────────────┐ │
                    │  │   HYPOTHESIS GENERATION (LLM)      │ │
                    │  │                                     │ │
                    │  │  Input: relevant learnings          │ │
                    │  │  Output: ipotesi di esperimento     │ │
                    │  │          informate da evidenze      │ │
                    │  └─────────────────────────────────────┘ │
                    └───────────────────────────────────────────┘
```

### I tre meccanismi

**1. Pattern extraction** — aggrega learning simili cross-tenant

```
Tenant A (ads, fitness)   → "UGC > stock photo, +23% CTR"
Tenant C (ads, coaching)  → "UGC > stock photo, +18% CTR"
                          ↓
Global insight: "UGC > stock photo su ads B2C"
  confidence: alta (2 tenant, 2 nicchie)
  tenant_count: 2
```

**2. Onboarding boost** — nuovo cliente parte dai global insights

```
Nuovo tenant (ads, yoga) → retrieval: nicchia simile a fitness/coaching
  → "UGC > stock photo" già validato → skip esperimento, usa direttamente
  → "hook domanda > statement" confidence media → testa ma con prior positivo
```

**3. Cross-pollination** — un learning su un canale suggerisce ipotesi su un altro

```
Learning (LinkedIn, SaaS): "citare un post specifico +12% accept rate"
  → Ipotesi (Email, SaaS): "citare un contenuto specifico nel subject?"
  → L'LLM genera la variante, l'experiment engine la testa
```

### Retrieval ibrido (non solo embedding)

| Layer | Tipo | Cosa filtra |
|-------|------|-------------|
| **Structured filter** | Relazionale | Canale, metrica target, confidence minima |
| **Semantic similarity** | Embedding | Nicchia/segmento (fitness ≈ wellness ≈ sport) |
| **Ranking** | Score | `confidence × recency × magnitude` |

Perché ibrido: il filtro strutturato è preciso (non voglio learning email quando ottimizzo ads), l'embedding cattura similarità che il filtro esatto non vede (wellness ≈ fitness).

### Data model

```typescript
interface GlobalLearning extends Learning {
  // Ereditati da Learning: insight, direction, segment, metric, magnitude, confidence

  // Aggregazione cross-tenant
  sourceTenantCount: number;        // quanti tenant hanno validato
  sourceExperimentIds: string[];    // esperimenti originali
  nicheEmbedding: number[];         // embedding della nicchia/segmento
  applicableChannels: string[];     // canali dove è stato validato
  suggestedChannels: string[];      // canali dove potrebbe applicarsi (cross-pollination)

  // Governance
  lastValidatedAt: string;          // quanto è fresco
  contradictions: string[];         // learning che lo contraddicono
}
```

### Privacy e opt-in

- I learning globali sono **anonimi**: nessun riferimento al tenant originale, solo insight + metadati
- Ogni tenant sceglie `globalLearningsOptIn` nel playbook
- Un tenant può **consumare** global learnings anche senza contribuire (free rider ok, incentiva adozione)
- I dati grezzi (messaggi, lead, conversazioni) non escono mai dal tenant

---

## Channel connectors (plugin architecture)

Ogni canale è un connector con interfaccia standard:

```typescript
interface ChannelConnector {
  channel: string;

  // Discovery
  search(query: SearchQuery): Promise<Lead[]>;

  // Outreach
  send(action: OutreachAction): Promise<ActionResult>;

  // Engagement (pre-outreach warm-up)
  engage(action: EngageAction): Promise<ActionResult>;

  // Metrics
  getMetrics(experimentId: string): Promise<VariantMetrics>;

  // Webhook handler
  handleWebhook(event: WebhookEvent): Promise<void>;

  // Limits
  getRemainingQuota(): Promise<Quota>;
}
```

### Connectors pianificati

| Connector | Provider | Stato | Azioni |
|-----------|----------|-------|--------|
| `linkedin` | Unipile | **Attivo** | search, invite, message, like, comment, post |
| `email` | Unipile / SendGrid | Planned | send, track open/click/reply |
| `meta_ads` | Meta Ads API | Planned | create campaign, manage budget, get metrics |
| `google_ads` | Google Ads API | Planned | create campaign, manage budget, get metrics |
| `x_twitter` | Unipile | Planned | post, DM, engage |
| `whatsapp` | Unipile | Planned | message |

---

## File structure (target)

```
brandmultiplier-gtm/
├── src/
│   ├── app/                       # Next.js pages (dashboard)
│   │   ├── page.tsx               # Home/dashboard
│   │   ├── [tenantId]/            # Tenant-scoped pages
│   │   │   ├── leads/
│   │   │   ├── experiments/
│   │   │   ├── learnings/
│   │   │   ├── sequences/
│   │   │   ├── inbox/
│   │   │   └── settings/
│   │   └── api/
│   │       ├── webhooks/          # Webhook receivers
│   │       ├── search/
│   │       ├── invite/
│   │       ├── experiments/       # CRUD esperimenti
│   │       └── agent/             # AI agent endpoint (trigger loop)
│   │
│   ├── lib/
│   │   ├── connectors/            # Channel connectors
│   │   │   ├── interface.ts       # ChannelConnector interface
│   │   │   ├── linkedin.ts        # Unipile LinkedIn
│   │   │   ├── email.ts           # Email connector
│   │   │   └── meta-ads.ts        # Meta Ads connector
│   │   │
│   │   ├── engine/                # Core engine
│   │   │   ├── experiment.ts      # Experiment lifecycle
│   │   │   ├── optimizer.ts       # AI agent loop (measure → analyze → hypothesize → execute)
│   │   │   ├── scheduler.ts       # Cron / timing
│   │   │   └── learning.ts        # Learning store + compound logic
│   │   │
│   │   ├── ai/                    # LLM integration
│   │   │   ├── agent.ts           # AI agent (propone ipotesi, genera varianti)
│   │   │   ├── personalize.ts     # Message personalization
│   │   │   └── analyze.ts         # Conversation/response analysis
│   │   │
│   │   └── db/                    # Data layer
│   │       ├── schema.ts          # Tenant, Experiment, Learning, Lead
│   │       └── store.ts           # SQLite / Turso / Supabase
│   │
│   └── components/                # UI components
│
├── playbooks/                     # Playbook per tenant (= program.md)
│   └── c4g.json                   # Playbook Claw4Growth
│
├── sequences/                     # Sequenze di partenza per tenant
│   └── c4g/
│
├── data/                          # Runtime data
│   ├── events.jsonl               # Webhook events
│   ├── experiments.jsonl           # Experiment log (= results.tsv)
│   └── learnings.jsonl            # Compound learnings
│
└── docs/
    ├── ARCHITECTURE.md            # Questo file
    └── COMPETITIVE-ANALYSIS.md
```

---

## Migration path

### Fase attuale → Phase 1 (settimane 1-3)

Abbiamo già:
- LinkedIn search + invite + message (via Unipile)
- Webhook per accept/reply
- Dashboard con leads, events, sequences
- Sequenze JSON per 5 segmenti C4G

Da aggiungere:
1. **Lead state DB** (SQLite locale, poi Turso/Supabase)
2. **Experiment engine** (A/B split, measure, promote/rollback)
3. **AI agent** (LLM che propone varianti basandosi su learnings)
4. **Scheduler** (cron per follow-up e valutazione esperimenti)
5. **Playbook schema** (JSON, uno per tenant)

### Phase 1 → Phase 2 (settimane 4-8)

6. **Email connector** (Unipile o SendGrid)
7. **Smart sequences** (branching condizionale, visual builder)
8. **CRM** (lead timeline, tags, notes)
9. **Unified inbox**
10. **Multi-tenant UI** (tenant switcher)

### Phase 2 → Phase 3 (settimane 9-16)

11. **Ads connectors** (Meta, Google)
12. **Cross-channel optimization** (AI decide quale canale usare per quale lead)
13. **Global learnings pool** (cross-tenant)
14. **Content + outreach loop**
15. **Conversational intelligence**

---

## Perché funziona a scala

| Proprietà | Come la garantiamo |
|-----------|-------------------|
| **Multi-tenant isolation** | Ogni tenant ha suo playbook, accounts, experiments, learnings. Nessun dato condiviso di default. |
| **Channel-agnostic loop** | L'experiment engine non sa cos'è LinkedIn o email. Parla con un ChannelConnector. Aggiungere un canale = aggiungere un connector. |
| **Self-improvement compound** | Più tempo passa → più learnings → scelte migliori. Più clienti → più learnings globali → onboarding migliore. |
| **Costo marginale basso** | Ogni tenant aggiuntivo = costo Unipile account + storage. L'engine è condiviso. |
| **Metriche incorruttibili** | Le metriche vengono dai webhook/API dei canali, non dall'agente. L'agente non può barare (come prepare.py in autoresearch). |
