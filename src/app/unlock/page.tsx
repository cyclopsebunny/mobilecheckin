import Image from "next/image";

export const metadata = {
  title: "myQ DockPass — Enter access code"
};

export default async function UnlockPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = params.next ?? "/checkin";
  const failed = params.error === "1";

  return (
    <div className="dp-shell">
      <header className="dp-nav">
        <span className="dp-nav-side" aria-hidden="true" />
        <div className="dp-nav-logo">
          <Image src="/myQLogo.svg" alt="myQ" width={51.65} height={56} />
        </div>
        <span className="dp-nav-side" aria-hidden="true" />
      </header>

      <div className="dp-layout">
        <div className="dp-card">
          <div className="dp-dockpass-logo">
            <Image
              src="/DockpassLogo.svg"
              alt="DockPass"
              width={334}
              height={59}
              style={{ width: "100%", height: 59 }}
            />
          </div>

          <h2 className="dp-section-title">Internal prototype</h2>
          <p className="dp-hint">
            This is a work-in-progress demo, not a production system. Enter the access
            code shared with your team to continue.
          </p>

          <form action="/api/unlock" method="post" className="stack">
            <input type="hidden" name="next" value={next} />
            <input
              className="dp-field-input"
              style={{ textAlign: "center", fontSize: "1rem", padding: "0.75rem" }}
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="Access code"
              aria-label="Access code"
              required
              autoFocus
            />
            {failed ? (
              <p className="dp-error" role="alert">
                That access code is not correct.
              </p>
            ) : null}
            <button className="dp-continue-btn" type="submit">
              Continue
            </button>
          </form>
        </div>
      </div>

      <div className="dp-home-indicator" />
    </div>
  );
}
