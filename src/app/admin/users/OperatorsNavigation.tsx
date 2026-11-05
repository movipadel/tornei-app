import Link from 'next/link';
import styles from './users.module.css';

export default function OperatorsNavigation({current}: {current: 'operators' | 'notifications'}) {
 return <nav aria-label="Configurazione operatori" className={styles.navigation}>
  <Link href="/admin/users" aria-current={current === 'operators' ? 'page' : undefined} className={current === 'operators' ? styles.primary : styles.secondary}>Operatori</Link>
  <Link href="/admin/users/notifiche" aria-current={current === 'notifications' ? 'page' : undefined} className={current === 'notifications' ? styles.primary : styles.secondary}>Notifiche Staff</Link>
 </nav>;
}
