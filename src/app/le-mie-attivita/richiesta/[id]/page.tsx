import Detail from './Detail';
export default async function Page({params}:{params:Promise<{id:string}>}){return <Detail id={(await params).id}/>;}
