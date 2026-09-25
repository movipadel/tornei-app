/** Bounded transport: a lost response must never keep the correction UI busy forever. */
export async function playerIdentityRequest(action:string,data:Record<string,unknown>,options:{fetcher?:typeof fetch;timeoutMs?:number}={}) {
 const controller=new AbortController();
 let timer:ReturnType<typeof setTimeout>|undefined;
 const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('La risposta tarda ad arrivare. Aggiorna la pagina per verificare l’esito prima di riprovare.'));},options.timeoutMs??20000);});
 try {
  return await Promise.race([timeout,(async()=>{
   const response=await (options.fetcher??fetch)('/api/admin/player-identities',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data}),signal:controller.signal});
   const json=await response.json().catch(()=>null);
   if(!response.ok)throw new Error(json?.error??'Operazione non completata. Aggiorna la pagina e riprova.');
   if(!json?.data||typeof json.data!=='object')throw new Error('Risposta non valida. Aggiorna la pagina per verificare l’esito.');
   return json.data;
  })()]);
 } catch(error) {
  if(error instanceof TypeError)throw new Error('Connessione interrotta. Aggiorna la pagina per verificare l’esito prima di riprovare.');
  throw error;
 } finally {clearTimeout(timer);}
}
