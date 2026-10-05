import assert from 'node:assert/strict';

const base='http://127.0.0.1:3100';
const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'requests-demo-1@example.invalid',password:'Requests-Local-2026!'})});
assert.equal(login.status,200);
const session=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
const post=async body=>{const response=await fetch(base+'/api/user/requests',{method:'POST',headers:{Cookie:session,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
const common={playing_side:'left',clubs:['Manta'],date_mode:'flexible',requested_date:null,time_window:'evening',preferred_time_text:'20:00',level:'intermedio',notes:'Fixture multi-select LOCAL ONLY'};
const gioca={...common,client_request_id:'efef1000-0000-4000-8000-000000000001',request_type:'gioca',match_type:['male','mixed'],has_partner:false,training_type:null,training_goal:null};
const allenati={...common,client_request_id:'efef1000-0000-4000-8000-000000000002',request_type:'allenati',match_type:null,has_partner:null,training_type:['individual','group'],training_goal:['technique','regular','other']};
const createdGioca=await post(gioca);assert.equal(createdGioca.status,201);assert.deepEqual(createdGioca.body.data.match_type,['male','mixed']);
const createdAllenati=await post(allenati);assert.equal(createdAllenati.status,201);assert.deepEqual(createdAllenati.body.data.training_type,['individual','group']);assert.deepEqual(createdAllenati.body.data.training_goal,['technique','regular','other']);
for(const payload of [{...gioca,client_request_id:'efef1000-0000-4000-8000-000000000003',match_type:[]},{...gioca,client_request_id:'efef1000-0000-4000-8000-000000000004',match_type:['any','mixed']},{...allenati,client_request_id:'efef1000-0000-4000-8000-000000000005',training_type:['advice','group']},{...allenati,client_request_id:'efef1000-0000-4000-8000-000000000006',training_goal:['invalid']}])assert.equal((await post(payload)).status,400);
console.log('Request multi-select HTTP PASS: Gioca and Allenati arrays persisted; empty, invalid and catch-all combinations rejected.');
