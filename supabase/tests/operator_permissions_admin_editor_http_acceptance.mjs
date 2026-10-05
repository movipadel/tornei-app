import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
if(process.env.PADELLERIA_LOCAL_VERIFIED!=="1"||process.env.SUPABASE_URL!=="http://127.0.0.1:55421")throw new Error("Safe local runner required");
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}),base=process.env.OPERATOR_EDITOR_TEST_BASE_URL??"http://127.0.0.1:3101";
const ids={actor:"17400000-0000-4000-8000-000000000001",target:"17400000-0000-4000-8000-000000000002",allStaff:"17400000-0000-4000-8000-000000000003",concurrentA:"17400000-0000-4000-8000-000000000004",concurrentB:"17400000-0000-4000-8000-000000000005"};
const token=async(id,role)=>new SignJWT({sid:id,role,name:"Phase 4",email:`${id}@example.invalid`}).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("15m").sign(new TextEncoder().encode(process.env.STAFF_COOKIE_SECRET));
const request=async(path,jwt,options={})=>fetch(base+path,{...options,headers:{...(options.headers??{}),Cookie:`staff_session=${jwt}`},redirect:"manual"});
let checks=0;
const initialAdmins=(await db.from("staff_users").select("id,role,is_active")).data??[];
try{
 assert.ifError((await db.from("staff_users").upsert([
  {id:ids.actor,full_name:"Phase 4 HTTP Actor",email:"phase4-http-actor@example.invalid",role:"admin",is_active:true},
  {id:ids.target,full_name:"Phase 4 HTTP Target",email:"phase4-http-target@example.invalid",role:"staff",is_active:true},
  {id:ids.allStaff,full_name:"Phase 4 All Staff",email:"phase4-http-all@example.invalid",role:"staff",is_active:true},
 ])).error);
 assert.ifError((await db.from("staff_permissions").delete().in("staff_user_id",[ids.target,ids.allStaff])).error);
 const allKeys=["scanner.manage","tournaments.manage","circuits.manage","players.manage","requests.manage","padelleria.manage","communications.manage","moviback.manage","partners.manage","store.manage","monday_league.manage"];
 assert.ifError((await db.from("staff_permissions").insert(allKeys.map(permission_key=>({staff_user_id:ids.allStaff,permission_key})))).error);
 const actorJwt=await token(ids.actor,"admin"),targetJwt=await token(ids.target,"staff"),allStaffJwt=await token(ids.allStaff,"staff");
 assert.equal((await request("/api/admin/users",allStaffJwt)).status,403);checks++;
 assert.equal((await request(`/api/admin/users/${ids.target}`,allStaffJwt)).status,403);checks++;
 let detail=await(await request(`/api/admin/users/${ids.target}`,actorJwt)).json();
 let response=await request(`/api/admin/users/${ids.target}`,actorJwt,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({full_name:"Phase 4 HTTP Target",email:"phase4-http-target@example.invalid",role:"admin",is_active:true,permissions:[],expected_updated_at:detail.data.updated_at})});assert.equal(response.status,200);checks++;
 assert.equal((await request("/api/admin/users",targetJwt)).status,200);checks++;
 detail=await(await request(`/api/admin/users/${ids.target}`,actorJwt)).json();
 response=await request(`/api/admin/users/${ids.target}`,actorJwt,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({full_name:"Phase 4 HTTP Target",email:"phase4-http-target@example.invalid",role:"staff",is_active:true,permissions:["tournaments.manage"],expected_updated_at:detail.data.updated_at})});assert.equal(response.status,200);checks++;
 assert.notEqual((await request("/api/admin/tournaments",targetJwt)).status,403);checks++;
 assert.equal((await request("/api/admin/padelleria",targetJwt)).status,403);checks++;
 assert.equal((await request("/api/admin/users",targetJwt)).status,403);checks++;
 detail=await(await request(`/api/admin/users/${ids.target}`,actorJwt)).json();
 response=await request(`/api/admin/users/${ids.target}`,actorJwt,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...detail.data,is_active:false,expected_updated_at:detail.data.updated_at})});assert.equal(response.status,200);checks++;
 assert.equal((await request("/api/staff/me",targetJwt)).status,403);checks++;
 detail=await(await request(`/api/admin/users/${ids.target}`,actorJwt)).json();
 response=await request(`/api/admin/users/${ids.target}`,actorJwt,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...detail.data,is_active:true,expected_updated_at:detail.data.updated_at})});assert.equal(response.status,200);checks++;
 assert.equal((await request("/api/staff/me",targetJwt)).status,200);checks++;
 const stale=detail.data.updated_at;response=await request(`/api/admin/users/${ids.target}`,actorJwt,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...detail.data,is_active:true,expected_updated_at:stale})});assert.equal(response.status,409);checks++;

 // Mandatory concurrent last-Admin test at the DB trigger boundary.
 assert.ifError((await db.from("staff_users").upsert([{id:ids.concurrentA,full_name:"Concurrent A",email:"phase4-concurrent-a@example.invalid",role:"admin",is_active:true},{id:ids.concurrentB,full_name:"Concurrent B",email:"phase4-concurrent-b@example.invalid",role:"admin",is_active:true}])).error);
 for(const row of initialAdmins.filter(row=>row.role==="admin"&&row.is_active&&!Object.values(ids).includes(row.id))){assert.ifError((await db.from("staff_users").update({role:"staff"}).eq("id",row.id)).error)}
 assert.ifError((await db.from("staff_users").update({role:"staff"}).eq("id",ids.actor)).error);
 const results=await Promise.all([db.from("staff_users").update({role:"staff"}).eq("id",ids.concurrentA),db.from("staff_users").update({is_active:false}).eq("id",ids.concurrentB)]);
 assert.equal(results.filter(result=>!result.error).length,1);assert.equal(results.filter(result=>result.error?.message.includes("LAST_ACTIVE_ADMIN")).length,1);checks++;
 const activeCount=await db.from("staff_users").select("id",{count:"exact",head:true}).eq("role","admin").eq("is_active",true);assert.equal(activeCount.count,1);checks++;
 console.log(`Operator editor HTTP/concurrency PASS: ${checks} checks.`);
}finally{
 await db.from("staff_users").update({role:"admin",is_active:true}).in("id",[ids.actor,ids.concurrentA,ids.concurrentB]);
 for(const row of initialAdmins)await db.from("staff_users").update({role:row.role,is_active:row.is_active}).eq("id",row.id);
 await db.from("staff_permissions").delete().in("staff_user_id",[ids.allStaff]);
 // actor/target stay as named local acceptance fixtures because immutable audit rows reference them.
 await db.from("staff_users").delete().in("id",[ids.concurrentA,ids.concurrentB,ids.allStaff]);
}
