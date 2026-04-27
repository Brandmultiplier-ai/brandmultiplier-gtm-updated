# Unipile — Quickstart

## Prerequisiti

- Account Unipile attivo
- LinkedIn collegato su Unipile dashboard
- API key + DSN dal dashboard

## Flusso operativo

### 1. Search prospect

```
GET /api/v1/linkedin/search
```
Cerca per keyword, ruolo, location, industry, company size.
Supporta Classic LinkedIn, Sales Navigator, Recruiter.

### 2. Invia connection request

```
POST /api/v1/users/{provider_id}/invite
```
Con nota personalizzata (max ~300 char).

### 3. Monitora accept (webhook)

Unipile notifica quando la connection viene accettata.

### 4. Invia messaggio follow-up

```
POST /api/v1/chats/{chat_id}/messages
```

### 5. Gestisci risposte (webhook)

Ricevi notifica quando il prospect risponde.

## Limiti da rispettare

| Azione | Limite |
|--------|--------|
| Connection request | ~80-100 / settimana |
| Messaggi | ~100-150 / giorno |
| Search | Non documentato — usare con moderazione |

## Risorse

- [API Reference](https://developer.unipile.com/reference)
- [LinkedIn Search](https://developer.unipile.com/docs/linkedin-search)
- [Send Messages](https://developer.unipile.com/docs/send-messages)
- [Node SDK](https://github.com/unipile/unipile-node-sdk)
