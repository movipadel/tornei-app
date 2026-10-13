import { NextResponse } from "next/server";
import { requireOperatorPermission, OperatorAccessDenied } from "@/lib/operatorAuthorization";
import { safeDatabaseError } from "@/lib/movibackAgreementAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 let operator;try{operator=await requireOperatorPermission("moviback.manage");}catch(error){return NextResponse.json({error:error instanceof OperatorAccessDenied&&error.code==="OPERATOR_REQUIRED"?"Authentication required":"Forbidden"},{status:error instanceof OperatorAccessDenied&&error.code==="OPERATOR_REQUIRED"?401:403});}
 if(request.headers.get("origin")&&request.headers.get("origin")!==new URL(request.url).origin)return NextResponse.json({error:"Origine non consentita"},{status:403});
 const {id}=await params;const body=await request.json().catch(()=>({}));const membershipId=String(body.membership_id??"");const from=String(body.effective_from??"")||null;const until=String(body.effective_until??"")||null;
 const {data,error}=await supabaseAdmin().rpc("assign_moviback_agreement",{p_membership_id:membershipId,p_agreement_id:id,p_effective_from:from,p_effective_until:until,p_actor_staff_id:operator.sid});if(error)return NextResponse.json({error:safeDatabaseError(error)},{status:409});return NextResponse.json({ok:true,data},{status:201});
}
