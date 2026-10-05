import { editorialJson, publicContentDetail } from '@/lib/padelleriaServer';

export const dynamic='force-dynamic';

export async function GET(_req:Request,ctx:{params:Promise<{id:string}>}) {
  const {id}=await ctx.params;
  try {
    const data=await publicContentDetail(id);
    return data?editorialJson({data}):editorialJson({error:'Contenuto non trovato'},404);
  } catch {
    return editorialJson({error:'Contenuto temporaneamente non disponibile'},500);
  }
}
