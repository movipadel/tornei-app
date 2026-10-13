# Monday League Captain Guide — problemi e limiti rilevati

Nessun problema è stato corretto in questo task. Le osservazioni derivano dall'app reale locale e dal codice corrente.

## UX — “Contestazione inviata” resta visibile dopo la risoluzione

**Evidenza:** dopo che l'Admin ha respinto la contestazione, il Capitano B vede il risultato come **Definitivo**, ma sotto resta la frase **Contestazione inviata**.

**Impatto:** l'utente può chiedersi se la contestazione sia ancora aperta.

**Riferimento:** `src/components/monday-league/PublicLeagueViews.tsx`; screenshot `original/27-final-result-captain-b.png`.

## UX — formazione incompleta indicata solo dal pulsante disabilitato

**Evidenza:** con un solo giocatore selezionato, **Conferma i 2 giocatori** resta disabilitato ma non compare un messaggio esplicativo.

**Impatto:** la regola è comprensibile dal testo del pulsante, ma il feedback è meno chiaro di quello usato dalla rosa e dal risultato.

**Riferimento:** screenshot `original/15-lineup-one-player.png`.

## UX — banner installazione PWA sovrapposto ai comandi mobili

**Evidenza:** nel viewport mobile il banner **Installa MOVI App** resta fisso sopra la bottom navigation e in diverse schermate copre parte dei contenuti o CTA inferiori.

**Impatto:** durante attività operative può essere necessario chiudere il banner o scorrere ulteriormente.

**Riferimento:** molte schermate in `original/`, ad esempio `16-lineup-ready.png` e `23-contest-filled.png`.

## MINOR — nessun dettaglio partita dedicato

**Evidenza:** non esiste una route o CTA **Apri partita**. I comandi si riferiscono alla partita selezionata automaticamente nella pagina squadra.

**Impatto:** con più partite operative può essere meno evidente quale incontro stia gestendo il capitano.

**Classificazione prodotto:** funzione non implementata, non errore di autorizzazione.

## MINOR — Monday League assente da “Le mie attività”

**Evidenza:** il Capitano B non vede partite o attività Monday League in `/le-mie-attivita`; la pagina ha mostrato lo stato vuoto.

**Impatto:** l'ingresso operativo resta Home → Monday League, separato dall'hub personale.

**Riferimento:** `original/31-activities-no-league-item.png`.

## NOT IMPLEMENTED

- modifica nome squadra da parte del capitano;
- colori o descrizione estesa oltre allo slogan;
- ordine/ruoli giocatori, riserve e disponibilità;
- trasferimento del ruolo di capitano;
- pagina dettaglio partita autonoma;
- conferma esplicita del risultato da parte del capitano ospite;
- modifica del risultato già inviato da parte del capitano;
- risposta del capitano di casa a una contestazione;
- caricamento prove/allegati nella contestazione;
- partite Monday League in **Le mie attività**;
- email capitano specifica visibile nella UI Monday League.
