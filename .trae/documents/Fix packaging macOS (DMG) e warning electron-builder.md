## Diagnosi
- L’errore vero che fa fallire la build è la combinazione di:
  - `hdiutil: create failed - Operazione non consentita`
  - `TRAE Sandbox Error: ... Not allow operate files: "/dev/rdisk…"`
- Su macOS, il target `dmg` di electron-builder usa `hdiutil` che, durante create/attach/detach, accede a device raw tipo `/dev/rdisk*`. Nel sandbox di Trae questo accesso è bloccato, quindi il DMG può fallire in modo intermittente e la build esce con code 1.
- `plistlib.InvalidFileException` e i `FileNotFoundError` sono effetti collaterali: dmgbuild prova a parsare output plist, ma riceve testo d’errore da `hdiutil`.
- `cannot find path for dependency name=undefined reference=undefined` è un warning di electron-builder (nodeModulesCollector) che capita con output anomalo del collector; la build prosegue. È fastidioso ma non è la causa del crash.
- `arm64 requires signing...` è un warning: avete `build.mac.identity: null` (signing disabilitato). Non blocca la zip, ma può bloccare distribuzione “vera” (Gatekeeper/notarization).

## Obiettivo
- Rendere `npm run package:mac:arm64` stabile in Trae: niente crash su DMG, e artefatti zip sempre prodotti/copiatI.
- Ridurre i warning inutili e rendere chiaro il “perché” (sandbox vs firma).

## Modifiche che farò nel repo
1) Rendere il packaging macOS “resiliente”
- Creare uno script Node dedicato (es. `scripts/package-mac.mjs`) che:
  - esegue prima `electron-builder --mac zip --arm64` con output in `/tmp/gemini-pdf-translator-release`
  - copia subito gli artefatti zip+blockmap in `release/`
  - poi prova `electron-builder --mac dmg --arm64` (stesso output)
  - se la parte DMG fallisce con errori legati a `/dev/rdisk` / `Operation not permitted`, non fa fallire l’intera build: stampa un messaggio chiaro e termina con successo (zip già pronta)

2) Agganciare lo script agli npm scripts
- Aggiornare `package.json` per fare in modo che `package:mac:arm64` usi lo script wrapper invece della singola invocation “tutto insieme”.
- Lasciare uno script “solo DMG” (facoltativo) per build fuori sandbox.

3) Mitigare warning di code signing
- Aggiungere `build.forceCodeSigning: false` (se manca) per evitare che futuri cambiamenti rendano il warning un hard-fail.
- Non abilito signing/notarization automaticamente (richiede certificati), ma preparo la struttura per attivarla via env in futuro.

4) Warning “dependency undefined”
- Verificare se sparisce dopo l’aggiornamento del flusso (zip/dmg separati).
- Se resta, proporre upgrade di `electron-builder` a una patch più recente della stessa major (26.x) e verificare che il warning non compaia più.

## Verifica
- Eseguire `npm run package:mac:arm64` e verificare:
  - exit code 0
  - presenza in `release/` di `Gemini PDF Translator-1.6.1-arm64.zip` (+ `.blockmap`)
  - (se possibile nel sandbox) DMG; altrimenti il comando termina comunque ok con zip pronta.

Se confermi questo piano, applico le modifiche e rilancio la build per verificare che l’errore non si ripresenti.