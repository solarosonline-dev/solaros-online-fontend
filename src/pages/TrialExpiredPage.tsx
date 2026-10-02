import { useAuth } from "../lib/AuthContext";
import "./TrialExpiredPage.css";

export default function TrialExpiredPage() {
  const { signOut } = useAuth();

  return (
    <div className="trial-expired-container">
      <div className="trial-expired-card">
        <h1>Trial Expired</h1>
        <p>Your 7-day trial period has ended.</p>
        <p>Your data is safe, but you'll need to upgrade to a paid account to continue using SolarOS.</p>
        
        <div className="trial-expired-actions">
          <a href="mailto:support@solaros.online" className="trial-expired-btn primary">
            Contact Support to Upgrade
          </a>
          <button className="trial-expired-btn secondary" onClick={signOut}>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
