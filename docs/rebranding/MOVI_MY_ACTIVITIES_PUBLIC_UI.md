# MOVI — Le mie attività, Public UI

## Riferimento e perimetro

La content area di `/le-mie-attivita` segue il riferimento certificato `docs/rebranding/references/activities/MOVI_MY_ACTIVITIES_CERTIFIED_REFERENCE.png`: gerarchia compatta, feed verticale, identità visiva per tipo, stato leggibile e CTA contestuale. Il riferimento non sostituisce la shell corrente: `PublicHeader`, `PublicBottomNav`, azione QR, ordine della navigazione, profilo e notifiche restano quelli del design system pubblico MOVI. Meteo, vecchio header e vecchia bottom navigation non sono implementati.

## Modello finale

Le viste pubbliche sono esclusivamente:

- **In programma** (`upcoming`)
- **Storico** (`history`)

Il precedente tab **Da completare** (`action`) era un placeholder sempre vuoto: nessuna attività veniva composta con quella classificazione, non esistevano CTA o transizioni e non risultavano consumatori interni di `?tab=action`. Il tab, lo stato vuoto e il contratto API sono stati rimossi. `tab=action` è ora un parametro non valido.

Questa rimozione non riclassifica attività. `composeActivities` conserva integralmente le regole esistenti di ownership, richieste, tornei, circuiti e Monday League.

## Tipi e gerarchia delle card

Il read model produce cinque tipi reali:

- Torneo
- Gioca
- Allenati
- Circuito
- Monday League

La vecchia dichiarazione Prenotazione non aveva un adapter ed è stata rimossa dal DTO delle attività. Nessuna attività viene inventata dal mockup.

Ogni card usa la stessa gerarchia: icona e label del tipo, titolo, riepilogo, data e luogo quando disponibili, metadati reali, stato umano e azioni effettivamente fornite dal read model. Gli accenti distinguono le famiglie senza affidare il significato al solo colore: Torneo royal/cyan, Gioca magenta/royal, Allenati cyan/royal, Circuito violetto, Monday League teal.

Le date concrete hanno un trattamento compatto giorno/mese e una descrizione estesa. Non vengono aggiunti media o dati sintetici.

## Stati e destinazioni

La UI mostra esclusivamente `status_label`; gli enum interni non sono esposti come testo. Le tonalità success, info, warning e danger accompagnano sempre una label leggibile.

Le CTA restano quelle prodotte dal server:

- Torneo futuro: `/tornei?tournament=[id]`
- Gioca/Allenati: `/le-mie-attivita/richiesta/[id]`
- Circuito: `/circuiti/[slug]?group=[classification_id]`
- Monday League: `/monday-league`

Lo storico dei tornei non riceve una CTA artificiale. L'annullamento richiesta continua a usare esclusivamente l'endpoint preesistente e le sue regole di autorizzazione.

## Accessibilità e responsive

I due tab usano ruoli `tablist`, `tab` e `tabpanel`, `aria-selected`, relazione `aria-controls`/`aria-labelledby`, focus visibile e target di almeno 44 px. Le card restano un feed a colonna singola da 320 a 1280 px. A 320 px data e azioni si ricompongono senza overflow; da 390 px la card mantiene l'identità compatta. La shell riserva già lo spazio per la bottom navigation e la safe area.

Restano due soli empty state: In programma, con collegamenti reali a Gioca, Allenati e Tornei; Storico, senza CTA inventate.
