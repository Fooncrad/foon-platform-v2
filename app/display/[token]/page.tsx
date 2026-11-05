import DisplayPlayer from "./display-player";
export const dynamic="force-dynamic";
export default async function PublicDisplayPage({params}:{params:Promise<{token:string}>}){const {token}=await params;return <DisplayPlayer token={token}/>;}
