## Piano per Risolvere le Inconsistenze

### 1. **Rafforzare Save Queue Logic** (Priorità Alta)
- Implementare limiti più stringenti sul save queue size
- Aggiungere early exit per file bloccati/blacklisted
- Aggiungere garbage collection per richieste pendenti troppo vecchie

### 2. **Sistema Feature Flags Centralizzato** (Priorità Media)
- Creare un sistema unico per gestire feature enable/disable
- Assicurare coerenza tra settings.json e runtime behavior

### 3. **Validazione Configurazione** (Priorità Media)
- Aggiungere validazione incrociata tra settings.json e constants.ts
- Implementare warning per configurazioni conflittuali
- Centralizzare la logica di default values

### 4. **Gestione API Keys Coerente** (Priorità Bassa)
- Risolvere disallineamento tra .env.local e settings.json
- Chiarire priorità di caricamento configurazione

### 5. **Logging Unificato** (Priorità Bassa)
- Standardizzare tra LOG_LEVEL env e verboseLogs setting
- Implementare gerarchia chiara di priorità

L'intervento principale sarà su useAppLibrary.ts per prevenire memory saturation come indicato nel piano originale.