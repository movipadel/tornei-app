import ContentEditor from '../../ContentEditor';
export default async function PreviewContentPage({params}:{params:Promise<{id:string}>}){return <ContentEditor id={(await params).id} previewOnly/>;}
