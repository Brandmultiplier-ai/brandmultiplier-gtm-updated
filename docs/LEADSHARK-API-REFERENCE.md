# LeadShark API Reference (Reverse Engineering)

**Confermato: LeadShark usa Unipile come backend LinkedIn.**
Prova: campo `metadata.unipile_response` nelle scheduled posts (`"object": "PostCreated"`).

## Panoramica

LeadShark è una piattaforma di LinkedIn lead generation automation.
- **Stack**: Next.js su Vercel, Supabase (UUID nei dati), Stripe (pricing), Umami (analytics)
- **Backend LinkedIn**: Unipile (confermato)
- **Base URL**: `https://apex.leadshark.io`
- **Auth**: header `x-api-key`
- **Piani**: Pro, Pro+, Apex

## Rate Limits
- 250 req/hr
- 1,000 req/day
- 100 req/min burst

## Endpoints

### Automations
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/automations?page=N&limit=N` | Lista automazioni con stats |
| POST | `/api/automations` | Crea automazione |
| PUT | `/api/automations/:id` | Aggiorna automazione |
| DELETE | `/api/automations/:id` | Elimina automazione |

**Automation object:**
```json
{
  "id": "uuid",
  "post_id": "urn:li:activity:...",
  "name": "string",
  "linkedin_post_url": "string",
  "keywords": [],
  "dm_template": "string (con {{firstName}}, {{fullName}}, etc)",
  "status": "Running | Paused",
  "comment_reply_template": ["array di varianti"],
  "auto_connect": true,
  "auto_like": false,
  "auto_enrich": false,
  "enable_follow_up": true,
  "follow_up_template": "string",
  "follow_up_delay_minutes": 2880,
  "follow_up_only_if_no_response": false,
  "non_first_degree_reply_template": [],
  "send_if_no_reply": false,
  "icp_preset_id": "uuid | null",
  "stats": {
    "total_comments": 21,
    "total_dms_sent": 16,
    "total_connections_sent": 0,
    "total_connections_accepted": 3,
    "total_comments_replied": 16,
    "total_non_first_degree_replies": 0,
    "total_follow_ups_sent": 0,
    "total_follow_ups_skipped": 0,
    "total_auto_likes": 0
  }
}
```

### Leads
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/leads?page=N&limit=N` | Lista lead (non archiviati) |

**Lead object:**
```json
{
  "id": "uuid",
  "name": "string",
  "title": "string",
  "linkedin_url": "string",
  "linkedin_username": "string",
  "first_name": "string",
  "commenter_id": "ACoAAA... (Unipile/LinkedIn provider ID)",
  "post_id": "urn:li:activity:...",
  "source": "automation name",
  "lead_type": "automation",
  "icp_score": "number | null",
  "icp_analysis": "string | null",
  "icp_fit": "object | null",
  "engagements": [
    {
      "type": "comment",
      "post_id": "urn:li:activity:...",
      "post_url": "string",
      "created_at": "ISO 8601",
      "comment_text": "string",
      "automation_name": "string"
    }
  ],
  "archived": false,
  "enriched_profile": "object | null",
  "enriched_at": "ISO 8601 | null",
  "email": "string | null"
}
```

### Enrichment
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/enrich/person?linkedin_id=X` | Enrichment profilo (richiede linkedin_id, non URL) |
| GET | `/api/enrich/company` | Enrichment azienda |

### Post Stats
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/post-stats` | Analytics post LinkedIn |

**Post stats restituisce dati Unipile quasi raw:**
```json
{
  "social_id": "urn:li:activity:...",
  "share_url": "string",
  "text": "string",
  "impressions": 331,
  "reactions": 56,
  "comments": 4,
  "reposts": 3,
  "author": {
    "public_identifier": "string",
    "id": "ACoAAA...",
    "name": "string",
    "headline": "string",
    "profile_picture_url": "string"
  },
  "attachments": [{ "type": "img", "url": "string" }]
}
```

### Scheduled Posts
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/scheduled-posts` | Lista post schedulati |
| POST | `/api/scheduled-posts` | Schedula nuovo post |
| PUT | `/api/scheduled-posts?id=X` | Aggiorna post |
| DELETE | `/api/scheduled-posts?id=X` | Elimina post |

**Prova Unipile — metadata nei post pubblicati:**
```json
{
  "metadata": {
    "unipile_response": {
      "object": "PostCreated",
      "post_id": "7365850504574197760"
    }
  }
}
```

### Bookmarks
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/bookmarks` | Lista bookmarks |
| GET | `/api/bookmarks/tags` | Lista tag |
| POST | `/api/bookmarks` | Crea bookmark |
| DELETE | `/api/bookmarks/:id` | Elimina bookmark |

### LinkedIn Search
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/linkedin-search` | Cerca profili LinkedIn |

## Webhooks

**Events:**
- `email.captured` (Pro) — lead fornisce email
- `new.profile.visit` (Apex) — visita profilo
- `new.like` (Apex) — like su post (richiede "Require like" attivo)
- `new.comment` (Pro) — commento su post

**Security:** HMAC-SHA256 via header `X-Webhook-Signature`

## MCP Server

NPM: `@leadshark/mcp-server`

**10 tools disponibili:**
1. `list_recent_posts`
2. `create_automation`
3. `list_automations`
4. `edit_automation`
5. `schedule_post_with_automation`
6. `list_scheduled_posts`
7. `edit_scheduled_post`
8. `cancel_scheduled_post`
9. `set_daily_dm_limit`
10. `suggest_automation_settings`

## Template Variables
- `{{firstName}}`, `{{fullName}}`, `{{linkedinUsername}}`
- `{{firstNameMention}}` (solo per comment replies, crea @mention)

## Modello di Business

LeadShark è essenzialmente un wrapper su Unipile con:
1. **Post-based automation**: monitora commenti su post → reply automatico → DM con lead magnet
2. **Follow-up automatici**: delay configurabile (es. 2880 min = 2 giorni)
3. **ICP scoring**: presets per filtrare lead (non sempre attivo)
4. **Enrichment**: profilo dettagliato + email (probabilmente via servizi terzi)
5. **Scheduling**: pubblica post a orari programmati via Unipile
6. **MCP server**: controlla tutto via AI assistant

Il flusso principale:
```
Utente pubblica post con CTA ("commenta X")
→ LeadShark monitora commenti (via Unipile webhooks/polling)
→ Reply automatico al commento ("DMed you @name")
→ DM con lead magnet link
→ Auto-connect se non connessi
→ Follow-up dopo N minuti se non risponde
```
