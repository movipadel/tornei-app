import { validSlug } from '@/lib/partners';
import { editorialJson } from '@/lib/padelleriaServer';
import { publicPartnerBySlug } from '@/lib/partnersServer';
export const dynamic='force-dynamic';
export async function GET(_req:Request,ctx:{params:Promise<{slug:string}>}){const {slug}=await ctx.params;if(!validSlug(slug))return editorialJson({error:'Partner non trovato'},404);try{const partner=await publicPartnerBySlug(slug);return partner?editorialJson({data:partner}):editorialJson({error:'Partner non trovato'},404);}catch{return editorialJson({error:'Partner non disponibili'},500);}}
