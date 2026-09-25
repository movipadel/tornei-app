import PartnerEditor from '../PartnerEditor';
export default async function Page({params}:{params:Promise<{id:string}>}){return <PartnerEditor id={(await params).id}/>;}
