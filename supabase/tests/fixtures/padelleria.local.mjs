// LOCAL ONLY. Never import from migrations or production application code.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
if(process.env.PADELLERIA_LOCAL_VERIFIED!=='1'||process.env.SUPABASE_URL!=='http://127.0.0.1:55421')throw new Error('Verified local runner required');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const check=({error})=>{if(error)throw error;};
const adminId='eded1000-0000-4000-8000-000000000001';
check(await db.from('staff_users').upsert({id:adminId,email:'padelleria-admin@example.invalid',full_name:'Admin editoriale locale',role:'admin',is_active:true}));
check(await db.rpc('set_staff_password',{p_staff_id:adminId,p_password:'Padelleria-Local-2026!'}));
const prefix='eded2000-0000-4000-8000-';
const common={excerpt:'Esempio sintetico LOCAL ONLY — media segnaposto, non contenuto di produzione.',body:'Questa è una prova editoriale locale.\n\nUsa questa anteprima per controllare titolo, testo, media, CTA e visibilità. Le immagini sono segnaposto già presenti nel repository.',status:'published',featured:false,delete_on_expiry:false,sort_order:0,visible_from:null,visible_until:null,occurred_at:null,cta_label:null,cta_url:null,deleted_at:null};
const rows=[
 {...common,id:`${prefix}000000000001`,kind:'succede',title:'3 giorni Fluo',featured:true,sort_order:1,visible_from:'2027-01-04T08:00:00Z',visible_until:'2027-01-06T22:59:59Z',cta_label:'Scopri i tornei',cta_url:'/tornei'},
 {...common,id:`${prefix}000000000002`,kind:'succede',title:'Partner MOVI',sort_order:2,cta_label:'Contattaci',cta_url:'/contatti'},
 {...common,id:`${prefix}000000000003`,kind:'e_successo',title:'Open Day Junior',sort_order:3,occurred_at:'2026-09-20T14:00:00Z'},
 {...common,id:`${prefix}000000000004`,kind:'succede',title:'Bozza locale da completare',status:'draft',sort_order:4},
 {...common,id:`${prefix}000000000005`,kind:'succede',title:'Weekend Vintage MOVI',sort_order:5,visible_from:'2026-09-01T08:00:00Z',visible_until:'2026-09-03T22:00:00Z',occurred_at:'2026-09-03T18:00:00Z'},
 {...common,id:`${prefix}000000000006`,kind:'succede',title:'Contenuto effimero scaduto',delete_on_expiry:true,sort_order:6,visible_from:'2026-09-01T08:00:00Z',visible_until:'2026-09-02T22:00:00Z'},
];
for(const row of rows){check(await db.from('padelleria_contents').upsert(row));}
const bytes=readFileSync('public/home/tournaments.jpg');
for(const [index,row] of rows.slice(0,3).entries()){
 const mediaId=`eded3000-0000-4000-8000-${String(index+1).padStart(12,'0')}`;
 const path=`${row.id}/${mediaId}.jpg`;
 check(await db.storage.from('padelleria-content-media').upload(path,bytes,{contentType:'image/jpeg',upsert:true}));
 check(await db.from('padelleria_content_media').upsert({id:mediaId,content_id:row.id,media_type:'image',role:'cover',storage_path:path,caption:'Segnaposto locale: immagine già nel repository',sort_order:0,deleted_at:null}));
}
const galleryId='eded3000-0000-4000-8000-000000000010',archive=rows[2].id,path=`${archive}/${galleryId}.jpg`;
check(await db.storage.from('padelleria-content-media').upload(path,readFileSync('public/home/hero-bg.jpg'),{contentType:'image/jpeg',upsert:true}));
check(await db.from('padelleria_content_media').upsert({id:galleryId,content_id:archive,media_type:'image',role:'gallery',storage_path:path,caption:'Gallery dimostrativa locale',sort_order:1,deleted_at:null}));
check(await db.from('padelleria_content_media').upsert({id:'eded3000-0000-4000-8000-000000000011',content_id:archive,media_type:'video',role:'video',external_url:'https://vimeo.com/76979871',caption:'Esempio link video esterno: caricato soltanto al clic',sort_order:2,deleted_at:null}));
console.log('LOCAL fixtures ready: current, archive, retained-expired, ephemeral-expired and draft contents. Admin: padelleria-admin@example.invalid / Padelleria-Local-2026!');
console.log('Preview: http://localhost:3100/admin/padelleria/eded2000-0000-4000-8000-000000000003/preview');
