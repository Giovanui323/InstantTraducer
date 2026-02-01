# Soluzione Definitiva per l'Esportazione (Bug Fix e Allineamento Reader)

Ho individuato il bug critico che bloccava l'esportazione dei file `.gpt` dalla Home: il sistema cercava un file inesistente con estensione duplicata (`.json.json`). Inoltre, ho capito che desideri un'esportazione PDF che sia esteticamente identica a ciò che vedi nel reader.

Ecco il piano d'azione:

## 1. Correzione del Bug "Esporta (.gpt)"
*   Correggerò `electron/main.js` affinché utilizzi il nome file corretto senza duplicare l'estensione.
*   Farò in modo che la finestra di salvataggio proponga un nome pulito (es. `Progetto_TitoloLibro.gpt` invece di `Project_titolo.json.gpt`).

## 2. Allineamento Grafico PDF -> Reader
*   Aggiornerò `electron/exportHtml.js` per utilizzare gli stessi stili del reader:
    *   **Font**: Utilizzerò la stessa famiglia di caratteri (Iowan Old Style / Palatino / Georgia).
    *   **Layout**: Allineamento giustificato, spaziatura tra i paragrafi e indentazione identica a quella che vedi a schermo.
    *   **Elementi Visivi**: Le descrizioni delle figure avranno lo stesso stile grafico del reader.

## 3. Interfaccia Esplicita nell'Header (Reader)
*   Dato che nel Reader il tasto si chiama genericamente "Esporta", lo renderò più esplicito o aggiungerò un'opzione dedicata "Esporta PDF", così da non creare confusione con l'esportazione del progetto GPT.
*   Collegherò finalmente la funzione di esportazione PDF (già presente nel "cuore" dell'app) al tasto corrispondente nel frontend.

## 4. Feedback e Scelta Percorso
*   Mi assicurerò che venga sempre mostrata la finestra di dialogo per farti scegliere la cartella di destinazione.
*   Aggiungerò messaggi di conferma ("PDF salvato con successo") per darti la certezza che l'operazione sia andata a buon fine.

Procedo con queste modifiche per rendere l'esportazione funzionante e fedele al reader?