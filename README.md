<div align="center">
<img width="1200" height="475" alt="InstantTraducer Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# InstantTraducer 📚⚡
### *Traduzione istantanea e professionale per i tuoi libri e documenti*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built with Gemini](https://img.shields.io/badge/Built%20with-Gemini-blue.svg)](https://ai.google.dev/)
[![Built with OpenAI](https://img.shields.io/badge/Built%20with-OpenAI-green.svg)](https://openai.com/)

</div>

---

**InstantTraducer** è un'applicazione desktop avanzata basata su Electron che trasforma il modo in cui leggi e traduci i tuoi libri in formato PDF. Utilizzando la potenza dei modelli linguistici di ultima generazione (**Google Gemini** e **OpenAI**), InstantTraducer offre traduzioni ultra-veloci e ad alta fedeltà che rispettano il contesto e lo stile dell'opera originale.

## ✨ Caratteristiche Principali

- 🧠 **Traduzione Istantanea**: Sfrutta Gemini 3 Pro/Flash e OpenAI (o1/o3) per traduzioni rapide e precise.
- 📖 **Consistenza del Contesto**: Mantiene il contesto tra le pagine per garantire coerenza terminologica.
- 🗂️ **Gestione Libreria**: Organizza i tuoi progetti in gruppi e tieni traccia dei tuoi progressi.
- 🔍 **Ricerca Potente**: Trova istantaneamente termini in tutto il documento.
- 🛠️ **Configurazione Flessibile**: Scegli i tuoi modelli AI preferiti e personalizza l'esperienza di traduzione.
- 📤 **Esportazione PDF**: Genera documenti tradotti pronti per la lettura.

## 🚀 Inizia Subito

### Prerequisiti
- [Node.js](https://nodejs.org/) (versione 18 o superiore)
- Una chiave API per [Google Gemini](https://aistudio.google.com/) o [OpenAI](https://platform.openai.com/)

### Installazione Locale

1. **Clona il repository**:
   ```bash
   git clone https://github.com/TUO_UTENTE/InstantTraducer.git
   cd InstantTraducer
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

InstantTraducer è progettato con la privacy in mente:
- Le tue chiavi API sono memorizzate localmente e non vengono mai inviate a server di terze parti (eccetto i provider AI ufficiali).
- I file PDF vengono elaborati localmente sul tuo dispositivo.
- Il file `.env.local` è automaticamente escluso dai commit per evitare fughe di dati accidentali.

---

<div align="center">
Fatto con ❤️ per gli amanti dei libri di tutto il mondo.
</div>
