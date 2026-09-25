export async function notificationAttempt(mode:'disabled'|'live',send:()=>Promise<{ok:boolean}>,record:(result:{telegram_state:string;telegram_error:string|null;telegram_notified_at:string|null})=>Promise<void>){
 if(mode==='disabled'){await record({telegram_state:'disabled',telegram_error:'local_disabled',telegram_notified_at:null});return;}
 let ok=false;try{ok=(await send()).ok;}catch{ok=false;}
 await record({telegram_state:ok?'sent':'failed',telegram_error:ok?null:'send_failed',telegram_notified_at:ok?new Date().toISOString():null});
}
