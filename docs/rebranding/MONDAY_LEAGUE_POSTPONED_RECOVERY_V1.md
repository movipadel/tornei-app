# Monday League: recuperi e formazioni per partita

## Regola

L'autorizzazione della formazione riguarda una partita precisa e la squadra del capitano. La nuova RPC `league_get_captain_lineup_matches` restituisce tutte le partite programmate o rinviate, ciascuna con stato, avversario, giornata, formazione propria e possibilità di modifica. `league_lineup_actionable` è la regola SQL condivisa dal contesto e dalla scrittura; `league_write_lineup` continua a verificare capitano, squadra, rosa attiva, due giocatori e revisioni.

- **Programmato:** restano obbligatori data, fase attiva, assenza di risultato/esito speciale, assenza del blocco e termine di un'ora prima dell'inizio.
- **Rinviato:** una partita senza risultato/esito speciale resta gestibile nella fase attiva anche con `scheduled_at = NULL` e con il vecchio `lineups_locked_at`. La formazione già inviata resta salvata e può essere revisionata fino alla registrazione del recupero. Il vecchio blocco resta come evidenza; non viene cancellato.
- **Concluso o sospeso/cancellato:** il capitano non può inviare una formazione. Le formazioni sono sempre isolate per `(match_id, team_id)`; la modifica di G3 non cambia G4.

La pagina del capitano mostra il prossimo incontro programmato, gli altri incontri programmati e i recuperi come schede separate. Ogni scheda usa l'ID della propria partita nelle API esistenti. Una data vecchia non viene mostrata come scadenza di un recupero. Se non ci sono azioni disponibili compare uno stato vuoto. I campi singolari `match_id` e `result` del vecchio contesto restano disponibili per compatibilità, ma la pagina non li usa più per le azioni.

## Risultato del recupero

Il capitano di casa può inviare il risultato di una partita rinviata senza nuova data. `league_captain_submit_result` applica le stesse verifiche di capitano, fase, payload set, risultato/esito già presente, audit e contestazione del risultato programmato. La transizione canonica è `postponed → submitted → confirmed` (oppure `contested` e relativa risoluzione). L'invio del risultato blocca ulteriori revisioni della formazione. La partita conserva `round_id` originale.

Il rinvio da solo non attribuisce punti. La classifica usa la formula esistente e cambia solo quando il risultato o un esito speciale valido entra nel normale flusso. I vincoli di completamento della fase restano separati dall'idoneità delle formazioni delle giornate successive.

## Promemoria e link

Il normale scanner continua a considerare solo `scheduled` con `scheduled_at`; un rinvio senza data non crea promemoria basati su orario. Il trigger sui nuovi promemoria di formazione, partita e risultato aggiunge `?match=<id>` all'URL della squadra. La pagina evidenzia l'incontro richiesto solo se compare fra gli incontri della squadra del capitano; ID estranei o non disponibili sono ignorati. Non cambia la privacy della formazione avversaria né viene introdotta una chiamata diretta per un ID preso dall'URL.

## Casi verificati localmente

Il fixture SQL sintetico riproduce G3 con data passata, rinvio senza data e G4 futura per entrambe le squadre. Verifica formazioni indipendenti, vecchio blocco, formazione preesistente e parziale, revisioni, due recuperi simultanei, autorizzazione, risultato e classifica, promemoria e rollback del fixture. Il test non usa dati reali.

## Rilascio

La forward migration `20261107142512_monday_league_postponed_recovery_multi_match.sql` è stata applicata in produzione il 2026-11-07, dopo il precheck in sola lettura. Le impronte di partite, formazioni, risultati, fasi e notifiche sono rimaste invariate. La distribuzione dell'app compatibile segue la migrazione. Non è richiesta una nuova colonna né una riapertura Admin per le formazioni rinviate.
