Il problema è che il box "Nota: dubbi interpretativi" (e gli altri disclaimer) si trovano all'interno del contenitore del testo che ha lo scorrimento (`overflow-auto`). Questo fa sì che il box rimanga ancorato al fondo del contenuto testuale invece che al fondo della cornice della pagina, risultando "troppo in alto" se il testo è breve, o scomparendo durante lo scorrimento se il testo è lungo.

Sposterò i box dei disclaimer e delle note all'esterno del contenitore a scorrimento, mantenendoli però all'interno della cornice della pagina. In questo modo rimarranno sempre fissi in basso a sinistra rispetto alla pagina visualizzata, indipendentemente dallo scorrimento del testo.

**Modifiche pianificate:**
1.  In [ReaderView.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/ReaderView.tsx), identificherò i blocchi condizionali per:
    -   Disclaimer per omissioni/pezzi non tradotti (linee 743-747)
    -   Disclaimer per verifica qualità fallita (linee 748-752)
    -   Nota per dubbi interpretativi (linee 753-757)
2.  Utilizzerò un React Fragment per avvolgere il contenitore a scorrimento e i box dei disclaimer.
3.  Sposterò i box dei disclaimer subito dopo la chiusura del contenitore a scorrimento (`div` che termina alla linea 814), ma prima della chiusura della condizione `{isTranslatedMode && hasTranslation && (...) }`.

Questo garantirà che i box siano posizionati in modo assoluto rispetto alla cornice della pagina (`relative` alla linea 706) e rimangano visibili nella posizione desiderata (in basso a sinistra).

Confermi di procedere con questa modifica?