import { NextResponse } from "next/server";
import { requireOperatorPermission, OperatorAccessDenied } from "@/lib/operatorAuthorization";
import { safeDatabaseError } from "@/lib/movibackAgreementAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 let operator;try{operator=await requireOperatorPermission("moviback.manage");}catch(error){return NextResponse.json({error:error instanceof OperatorAccessDenied&&error.code==="OPERATOR_REQUIRED"?"Authentication required":"Forbidden"},{status:error instanceof OperatorAccessDenied&&error.code==="OPERATOR_REQUIRED"?401:403});}
 if(request.headers.get("origin")&&request.headers.get("origin")!==new URL(request.url).origin)return NextResponse.json({error:"Origine non consentita"},{status:403});
 const {id}=await params;const body=await request.json().catch(()=>({}));const reason=String(body.reason??"").trim();if(!reason)return NextResponse.json({error:"Motivo obbligatorio"},{status:400});
 const {data,error}=await supabaseAdmin().rpc("revoke_moviback_agreement_entitlement",{p_entitlement_id:id,p_reason:reason,p_actor_staff_id:operator.sid});if(error)return NextResponse.json({error:safeDatabaseError(error)},{status:409});return NextResponse.json({ok:true,data});
}
