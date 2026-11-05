import DisplayPlayer from "./display-player";
import OfflineWorker from "@/app/restaurant/offline-worker";
import OfflineWorker from "@/app/restaurant/offline-worker";
export const dynamic="force-dynamic";
export default async function PublicDisplayPage({params}:{params:Promise<{token:string}>}){const {token}=await params;return <><OfflineWorker/><DisplayPlayer token={token}/></>;}
