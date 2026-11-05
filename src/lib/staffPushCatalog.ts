export const STAFF_PUSH_EVENTS = {
 'requests.gioca.received': {category:'Gioca',label:'Nuova richiesta',title:'Nuova richiesta Gioca',url:'/admin/requests',domain:'requests'},
 'requests.allenati.received': {category:'Allenati',label:'Nuova richiesta',title:'Nuova richiesta Allenati',url:'/admin/requests',domain:'requests'},
 'moviback.membership.requested': {category:'MoviBack',label:'Nuova richiesta membership',title:'Nuova richiesta MoviBack',url:'/admin/moviback/requests',domain:'moviback'},
 'moviback.reward.requested': {category:'MoviBack',label:'Nuova richiesta premio',title:'Nuova richiesta premio MoviBack',url:'/admin/moviback',domain:'moviback'},
 'store.order.received': {category:'Store',label:'Nuovo ordine',title:'Nuovo ordine Store',url:'/admin/store-orders',domain:'store'},
 'tournament.registration.created': {category:'Tornei',label:'Nuova iscrizione',title:'Nuova iscrizione torneo',url:'/admin/tournaments',domain:'tournaments'},
 'tournament.reserve.created': {category:'Tornei',label:'Nuova riserva',title:'Nuova riserva torneo',url:'/admin/tournaments',domain:'tournaments'},
 'tournament.registration.cancelled': {category:'Tornei',label:'Cancellazione',title:'Cancellazione iscrizione torneo',url:'/admin/tournaments',domain:'tournaments'},
 'tournament.reserve.promoted': {category:'Tornei',label:'Promozione da riserva',title:'Promozione da riserva',url:'/admin/tournaments',domain:'tournaments'},
} as const;
export type StaffPushEventKey=keyof typeof STAFF_PUSH_EVENTS;
export function isStaffPushEventKey(value:unknown):value is StaffPushEventKey{return typeof value==='string'&&Object.hasOwn(STAFF_PUSH_EVENTS,value);}
