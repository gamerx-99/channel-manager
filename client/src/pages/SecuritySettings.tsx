import MfaSettings from "@/components/MfaSettings";

export default function SecuritySettings() {
  return (
    <div className="page-content">
      <section className="page-intro intro-split">
        <div>
          <div className="eyebrow">Settings / Security</div>
          <h1>
            Security<span className="title-mark">.</span>
          </h1>
          <p className="lede">Manage your authenticator app and step-up verification for sensitive actions.</p>
        </div>
      </section>
      <MfaSettings />
    </div>
  );
}
