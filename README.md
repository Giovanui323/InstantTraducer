<div align="center">
<img width="1200" height="475" alt="InstantTraducer Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# InstantTraducer 📚⚡
### *Il tuo libro gemello, finalmente nella tua lingua*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built with Gemini](https://img.shields.io/badge/Built%20with-Gemini-blue.svg)](https://ai.google.dev/)
[![Built with OpenAI](https://img.shields.io/badge/Built%20with-OpenAI-green.svg)](https://openai.com/)

</div>

---

Hai presente quel PDF o quel libro che hai sul computer, con tutte le sue pagine, i capitoli e la sua struttura originale? Ecco, immagina di premere un tasto e vederlo trasformarsi esattamente com'è, ma nella tua lingua.

Il vero punto di forza di **InstantTraducer** non è solo che "traduce", ma che ti restituisce il tuo **libro gemello**:

- **Stessa struttura, altra lingua**: Se il tuo PDF originale ha 200 pagine, ne avrai uno nuovo di 200 pagine. Se in una pagina c'è una nota a fondo pagina o un commento particolare, lo ritroverai nello stesso identico punto, ma tradotto perfettamente.
- **Un "Clona-Libri" intelligente**: Il programma non si limita a estrarre il testo. Legge la pagina come farebbe un occhio umano, ne capisce la forma e la ricostruisce da zero nella tua lingua. È come se il libro fosse stato scritto originariamente in italiano.
- **Nessuna confusione**: Spesso, quando si traduce un PDF, il testo si sballa o le frasi finiscono sopra le immagini. InstantTraducer lavora con una precisione chirurgica per fare in modo che l'aspetto visivo rimanga pulito e ordinato, proprio come l'originale che avevi tra le mani.
- **Esporta il tuo "Nuovo Originale"**: Quando hai finito, puoi scaricare un nuovo file PDF. Se li metti uno accanto all'altro, sembreranno lo stesso libro, solo che uno finalmente puoi leggerlo senza sforzo.

In pratica: **non perdi nulla del libro originale, tranne la barriera della lingua.**

---

## ✨ Caratteristiche Tecniche

- 🧠 **Traduzione Multimodale**: Sfrutta Gemini 3 Pro/Flash e OpenAI (o1/o3) per analizzare visivamente le pagine.
- 📖 **Consistenza Contestuale**: Mantiene il filo logico tra i capitoli per una narrazione fluida.
- 🗂️ **Libreria Personale**: Gestisci i tuoi libri, crea gruppi e non perdere mai il segno.
- 🔍 **Ricerca Visuale**: Trova termini istantaneamente sia nell'originale che nella traduzione.
- 🛠️ **Controllo Totale**: Regola i parametri dell'AI per adattarli a testi tecnici, legali o letterari.

## 📂 Riferimenti al Codice (Core Logic)

Per gli sviluppatori che vogliono esplorare il cuore di InstantTraducer:

- **Mantenimento Layout**: La logica che preserva le dimensioni e la struttura delle pagine originali durante l'esportazione si trova in [exportHtml.js](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/exportHtml.js).
- **Ricostruzione Testuale**: Il sistema che ricostruisce il testo mantenendo note e annotazioni è gestito in [useAppTranslation.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAppTranslation.ts).
- **Vista Specchio**: La visualizzazione sincronizzata per confrontare l'originale con la traduzione è implementata in [ReaderView.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/ReaderView.tsx).

## 🚀 Inizia Subito

### Installazione Locale

1. **Clona il repository**:
   ```bash
   git clone https://github.com/Giovanui323/InstantTraducer.git
   cd InstantTraducer
   ```

2. **Installa le dipendenze**:
   ```bash
   npm install
   ```

3. **Configura le chiavi API**:
   Crea un file `.env.local` nella root:
   ```bash
   GEMINI_API_KEY=tua_chiave_qui
   ```

4. **Avvia l'applicazione**:
   ```bash
   npm run electron:dev
   ```

---

<div align="center">
Fatto con ❤️ per gli amanti dei libri di tutto il mondo.
</div>
