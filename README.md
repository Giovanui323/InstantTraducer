<div align="center">
<img width="1200" height="475" alt="LibroGenie Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# LibroGenie 📚✨
### *Il tuo genio personale per la traduzione di libri e documenti*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built with Gemini](https://img.shields.io/badge/Built%20with-Gemini-blue.svg)](https://ai.google.dev/)
[![Built with OpenAI](https://img.shields.io/badge/Built%20with-OpenAI-green.svg)](https://openai.com/)

</div>

---

**LibroGenie** è un'applicazione desktop avanzata basata su Electron che trasforma il modo in cui leggi e traduci i tuoi libri in formato PDF. Utilizzando la potenza dei modelli linguistici di ultima generazione (**Google Gemini** e **OpenAI**), LibroGenie offre traduzioni ad alta fedeltà che rispettano il contesto, lo stile e l'anima dell'opera originale.

## ✨ Caratteristiche Principali

- 🧠 **Traduzione Intelligente**: Sfrutta Gemini 3 Pro/Flash e OpenAI (o1/o3) per traduzioni che non sono semplici conversioni di parole, ma vera e propria comprensione del testo.
- 📖 **Layout-Aware**: Mantiene il contesto tra le pagine per garantire coerenza terminologica e narrativa.
- 🗂️ **Gestione Libreria**: Organizza i tuoi progetti in gruppi, rinominali e tieni traccia dei tuoi progressi di lettura.
- 🔍 **Ricerca Avanzata**: Trova istantaneamente termini o concetti sia nel testo originale che in quello tradotto.
- 🛠️ **Personalizzazione Totale**: Scegli i modelli AI, regola la temperatura, il contesto giuridico e molto altro.
- 📤 **Esportazione Multi-Formato**: Esporta i tuoi lavori in PDF o salva l'intero progetto per backup futuri.

## 🚀 Inizia Subito

### Prerequisiti
- [Node.js](https://nodejs.org/) (versione 18 o superiore)
- Una chiave API per [Google Gemini](https://aistudio.google.com/) o [OpenAI](https://platform.openai.com/)

### Installazione Locale

1. **Clona il repository**:
   ```bash
   git clone https://github.com/TUO_UTENTE/LibroGenie.git
   cd LibroGenie
   ```

2. **Installa le dipendenze**:
   ```bash
   npm install
   ```

3. **Configura le chiavi API**:
   Copia il file `.env.local.example` in `.env.local` (se presente) o crea un file `.env.local` nella root:
   ```bash
   GEMINI_API_KEY=tua_chiave_qui
   ```
   *Nota: Puoi anche configurare le chiavi direttamente all'interno delle impostazioni dell'app.*

4. **Avvia l'applicazione**:
   ```bash
   npm run electron:dev
   ```

## 🛠️ Sviluppo e Build

- `npm run dev`: Avvia il server di sviluppo Vite.
- `npm run build`: Compila l'applicazione per la produzione.
- `npm run package`: Crea il pacchetto distribuibile per il tuo sistema operativo.

## 🔒 Sicurezza e Privacy

LibroGenie è progettato con la privacy in mente:
- Le tue chiavi API sono memorizzate localmente e non vengono mai inviate a server di terze parti (eccetto i provider AI ufficiali).
- I file PDF vengono elaborati localmente sul tuo dispositivo.
- Il file `.env.local` è automaticamente escluso dai commit per evitare fughe di dati accidentali.

---

<div align="center">
Fatto con ❤️ per gli amanti dei libri di tutto il mondo.
</div>
