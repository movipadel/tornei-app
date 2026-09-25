import PlayerDetail from './PlayerDetail';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <PlayerDetail id={id}/>;}
