// LOCAL ONLY. Requires the verified loopback Supabase runner; never points at hosted projects.
import { createClient } from '@supabase/supabase-js';
if (process.env.CUSTOMER_HUB_LOCAL_VERIFIED !== '1' || process.env.SUPABASE_URL !== 'http://127.0.0.1:55021') throw new Error('Verified local Customer Hub runner required');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const check=({error})=>{if(error)throw error;};
const password='CustomerHub-Local-2026!';
const day=(offset)=>{const date=new Date();date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10);};

const bucket=await db.storage.getBucket('medical-certificates');
if(bucket.error)check(await db.storage.createBucket('medical-certificates',{public:false,fileSizeLimit:8*1024*1024,allowedMimeTypes:['application/pdf','image/jpeg','image/png','image/webp']}));
const people=[
 ['A','Certificato valido','active'],['B','Tolleranza 20 giorni','grace'],['C','Stand-by 70 giorni','standby'],
 ['D','Stand-by con nuovo certificato','pending'],['E','Riattivato dopo approvazione','reactivated'],['F','Senza MoviBack','none'],['G','Attivazione iniziale','initial'],
];
for(let index=0;index<people.length;index++){
 const number=String(index+1).padStart(12,'0'), userId=`c7001000-0000-4000-8000-${number}`, playerId=`c7002000-0000-4000-8000-${number}`;
 const email=`customer-hub-${people[index][0].toLowerCase()}@example.invalid`, phone=`+39349000700${index+1}`;
 const existing=await db.from('users').select('id,auth_user_id').eq('id',userId).maybeSingle();check(existing);
 let authUserId=existing.data?.auth_user_id;
 if(!authUserId){const auth=await db.auth.admin.createUser({email,password,email_confirm:true});check(auth);authUserId=auth.data.user.id;}
 check(await db.from('users').upsert({id:userId,full_name:`Customer ${people[index][0]} · ${people[index][1]}`,phone,email,gender:index%2?'F':'M',auth_user_id:authUserId,auth_migration_state:'linked',identity_status:'active'}));
 check(await db.from('player_identities').upsert({id:playerId,full_name:`Customer ${people[index][0]} · ${people[index][1]}`,normalized_phone:phone,gender:index%2?'F':'M',account_user_id:userId,status:'active'}));
}
const membershipRows=people.filter(([, ,kind])=>kind!=='none').map(([letter,,kind],index)=>{
 const slot=people.findIndex(([value])=>value===letter)+1, number=String(slot).padStart(12,'0');
 return {id:`c7003000-0000-4000-8000-${number}`,user_id:`c7001000-0000-4000-8000-${number}`,status:kind==='initial'?'pending_review':'approved',membership_code:`MOVI-HUB-${letter}`,tax_code:`RSSMRA80A01H50${slot}`,membership_type:'ASC',fee_points:0,fee_paid:true,approved_at:kind==='initial'?null:new Date().toISOString(),health_data_consent_at:new Date().toISOString()};
});
check(await db.from('loyalty_memberships').upsert(membershipRows));
const certificateRows=[];
for(const [letter,,kind] of people){
 if(kind==='none')continue;
 const slot=people.findIndex(([value])=>value===letter)+1, number=String(slot).padStart(12,'0'), userId=`c7001000-0000-4000-8000-${number}`;
 const add=async(suffix,status,expiry,uploadedOffset)=>{
   const certId=`c70040${suffix}0-0000-4000-8000-${number}`, path=`${userId}/${certId}.pdf`;
   const pdf=Buffer.from('%PDF-1.4\n% synthetic LOCAL certificate\n%%EOF\n');
   check(await db.storage.from('medical-certificates').upload(path,pdf,{contentType:'application/pdf',upsert:true}));
   certificateRows.push({id:certId,user_id:userId,file_path:path,status,expiry_date:expiry,uploaded_at:new Date(Date.now()+uploadedOffset*86400000).toISOString(),reviewed_at:status==='approved'?new Date().toISOString():null,notes:'Fixture sintetica Customer Hub LOCAL ONLY'});
 };
 if(kind==='active')await add('1','approved',day(120),-10);
 if(kind==='grace')await add('1','approved',day(-20),-40);
 if(kind==='standby')await add('1','approved',day(-70),-100);
 if(kind==='pending'){await add('1','approved',day(-70),-100);await add('2','pending_review',day(300),-1);}
 if(kind==='reactivated'){await add('1','approved',day(-70),-100);await add('2','approved',day(300),-1);}
 if(kind==='initial')await add('2','pending_review',day(300),-1);
}
check(await db.from('medical_certificates').upsert(certificateRows));
const transactions=membershipRows.filter(row=>row.status==='approved').flatMap((row,index)=>[
 {id:`c7005000-0000-4000-8000-${String(index*2+1).padStart(12,'0')}`,membership_id:row.id,type:'earn',source:'club_payment',euro_amount:50,points_delta:50,club:'MANTA',notes:'Fixture accredito Customer Hub'},
 {id:`c7005000-0000-4000-8000-${String(index*2+2).padStart(12,'0')}`,membership_id:row.id,type:'adjustment',source:'manual_adjustment',euro_amount:null,points_delta:5,notes:'Fixture correzione Customer Hub'},
]);
check(await db.from('loyalty_transactions').upsert(transactions));
check(await db.from('loyalty_user_promos').upsert({id:'c7006000-0000-4000-8000-000000000001',membership_id:'c7003000-0000-4000-8000-000000000001',multiplier:2,starts_at:new Date().toISOString(),ends_at:new Date(Date.now()+7*86400000).toISOString(),is_active:true,notes:'Fixture promo personale'}));
check(await db.from('rewards_catalog').upsert({id:'c7007000-0000-4000-8000-000000000001',name:'Premio Customer Hub locale',description:'Fixture LOCAL ONLY',category:'test',points_cost:10,is_active:true,stock_qty:100,reward_type:'club',fulfillment_type:'service'}));
check(await db.from('reward_redemptions').upsert({id:'c7008000-0000-4000-8000-000000000001',membership_id:'c7003000-0000-4000-8000-000000000001',reward_id:'c7007000-0000-4000-8000-000000000001',points_cost:10,status:'requested',notes:'Fixture riscatto Customer Hub'}));
const staffId='c7009000-0000-4000-8000-000000000001';
check(await db.from('staff_users').upsert({id:staffId,email:'customer-hub-staff@example.invalid',full_name:'Staff Customer Hub locale',role:'staff',is_active:true}));
check(await db.rpc('set_staff_password',{p_staff_id:staffId,p_password:'CustomerHub-Staff-2026!'}));
console.log('Customer Hub LOCAL fixtures ready. Users customer-hub-a..g@example.invalid / CustomerHub-Local-2026!; staff customer-hub-staff@example.invalid / CustomerHub-Staff-2026!');
