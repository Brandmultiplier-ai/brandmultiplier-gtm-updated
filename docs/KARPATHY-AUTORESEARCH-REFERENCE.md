# Karpathy Autoresearch — Reference

**Source**: https://github.com/karpathy/autoresearch
**Concetto**: dare a un AI agent un setup di esperimenti e farlo iterare autonomamente, tutta la notte.

## Architettura

3 file chiave:
- `prepare.py` — costanti, dati, tokenizer, evaluation (READ-ONLY, non modificabile)
- `train.py` — il SINGOLO file modificabile (modello, optimizer, training loop)
- `program.md` — istruzioni per l'agente (l'umano scrive l'intent, l'AI scopre l'implementazione)

## Il Loop

```
LOOP FOREVER:
1. Guarda lo stato git (branch/commit corrente)
2. Modifica train.py con un'idea sperimentale
3. git commit
4. Esegui esperimento (5 min budget fisso)
5. Leggi risultati (val_bpb = metrica unica)
6. Se crash → leggi errore, tenta fix, altrimenti skip
7. Log risultati in results.tsv
8. Se val_bpb migliorato → KEEP (avanza branch)
9. Se val_bpb uguale o peggiore → DISCARD (git reset)
10. TORNA A 1 — MAI FERMARSI
```

## Principi chiave

1. **Budget fisso** (5 min): rende gli esperimenti confrontabili
2. **Singola metrica** (val_bpb): nessuna ambiguita' su cosa ottimizzare
3. **Keep/Discard binario**: se migliora tieni, altrimenti scarta
4. **Branch per run**: ogni sessione e' un branch `autoresearch/<tag>`
5. **results.tsv**: log di tutti gli esperimenti (commit, metrica, status, descrizione)
6. **MAI FERMARSI**: l'agente e' completamente autonomo, l'umano dorme
7. **Semplicita'**: a parita' di risultato, codice piu' semplice vince. Rimuovere codice che non serve e' una vittoria.
8. **Singolo file modificabile**: mantiene scope gestibile e reviewabile

## Logging format (results.tsv)

```
commit	val_bpb	memory_gb	status	description
a1b2c3d	0.997900	44.0	keep	baseline
b2c3d4e	0.993200	44.2	keep	increase LR to 0.04
c3d4e5f	1.005000	44.0	discard	switch to GeLU activation
d4e5f6g	0.000000	0.0	crash	double model width (OOM)
```

## Adattamento per BrandMultiplier GTM

Il concetto si adatta cosi':

| Autoresearch (LLM training) | BrandMultiplier GTM (outreach) |
|------------------------------|---------------------|
| `train.py` (singolo file) | Campaign config (template, targeting, timing) |
| `val_bpb` (metrica) | connect_rate + reply_rate |
| 5 min budget | 1 settimana di outreach (80 inviti) |
| git commit + keep/discard | Brain snapshot + apply/revert |
| `results.tsv` | `data/brain/experiments.jsonl` |
| `program.md` | Agent ICP + voice config |

### Il loop per BrandMultiplier GTM:

```
LOOP (settimanale):
1. Brain analizza risultati settimana precedente
2. Genera ipotesi ("template diretto > template domanda per freelancer IT")
3. Crea esperimento: prossimi N lead, split A/B
4. Outreach engine esegue (1 settimana)
5. Brain analizza risultati esperimento
6. Se connect_rate migliore → KEEP (aggiorna template/config default)
7. Se uguale o peggiore → DISCARD (torna a config precedente)
8. Genera nuova ipotesi → TORNA A 1
```

### Differenze chiave:
- **Tempo**: 5 min vs 1 settimana (gli esperimenti umani sono lenti)
- **Sample size**: migliaia di token vs decine di lead (serve piu' tempo per significativita')
- **Costo errore**: basso (ricompili) vs medio (bruci lead reali con messaggi sbagliati)
- **Vincolo etico**: non puoi spammare, devi rispettare rate limit LinkedIn

### Fase di implementazione:
1. **v0 (fatto)**: aggregazione statistica, pattern passivi
2. **v1**: hypothesis generation via Claude + experiment tracking
3. **v2**: auto-tuning (il brain modifica template weights e targeting)
4. **v3**: full autoresearch loop con A/B test automatici
