import ContentEditor from '../ContentEditor';
export default async function EditContentPage({params}:{params:Promise<{id:string}>}){return <ContentEditor id={(await params).id}/>;}
