import {redirect} from 'next/navigation';
import {getCurrentOperator} from '@/lib/operatorAuthorization';
import RoutingEditor from './RoutingEditor';
export default async function StaffNotificationsPage(){const actor=await getCurrentOperator();if(actor?.role!=='admin')redirect('/staff');return <RoutingEditor/>;}
