/** Les notifications de la personne de l'équipe qui est connectée. */
import { useNetwork } from '../lib/network';
import { NotificationList } from '../ui/Notifications';
import '../ui/builder.css';

export function NotificationsPage() {
  const network = useNetwork();
  return (
    <>
      <header className="topbar">
        <h1>Notifications</h1>
        <div className="spacer" />
        <span className="faint" style={{ fontSize: 12.5 }}>What waits for you, and only for you.</span>
      </header>
      <div className="page">
        <NotificationList centers={network?.centers.map((c) => ({ id: c.id, name: c.name }))} />
      </div>
    </>
  );
}
