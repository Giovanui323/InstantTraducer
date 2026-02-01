# Miglioramento della Sicurezza e Robustezza del Salvataggio Documenti

## Obiettivi:
1. Eliminare i blocchi della UI durante il salvataggio di file grandi.
2. Prevenire la corruzione dei file di progetto in caso di crash.
3. Evitare sovrascritture accidentali di dati in caso di file JSON malformati.

## Interventi Tecnici:
### 1. Migrazione ad API Asincrone
- Sostituire `fs.copyFileSync` con `fs.promises.copyFile` in `copy-original-pdf`.
- Sostituire `fs.writeFileSync` con `fs.promises.writeFile` in `save-translation` e `rename-translation`.

### 2. Implementazione Salvataggio Atomico
- Creare una funzione helper `safeWriteFile` che:
    1. Scrive i dati in un file temporaneo (`file.json.tmp`).
    2. Verifica che il file temporaneo sia integro.
    3. Rinomina il temporaneo nel file definitivo (operazione atomica a livello di OS).

### 3. Rafforzamento Recupero Dati
- In `save-translation`, se il parsing del JSON esistente fallisce, rinominare il file corrotto in `.corrupted` invece di azzerarlo, permettendo un eventuale recupero manuale.
- Aggiungere un log dettagliato in caso di fallimento del merge dei dati.

## Verifica:
- Test di salvataggio con file PDF di grandi dimensioni (>50MB).
- Simulazione di interruzione di scrittura per verificare che il file originale resti intatto.
