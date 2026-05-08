"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

export function NoMatchScreen() {
  const router = useRouter();

  useEffect(() => {
    document.body.style.background = "#9e2d08";
    return () => { document.body.style.background = ""; };
  }, []);

  return (
    <div className="dp-shell dp-shell--fail">
      {/* Nav — identical structure to the rest of the app */}
      <header className="dp-nav dp-nav--fail">
        <button
          className="dp-nav-side dp-nav-back"
          type="button"
          onClick={() => router.back()}
          aria-label="Back"
        >
          <svg width="10" height="18" viewBox="0 0 10 18" fill="none" aria-hidden="true">
            <path
              d="M9 1L1 9L9 17"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="dp-nav-logo">
          <Image src="/myQLogo.svg" alt="myQ" width={51.65} height={56} />
        </div>
        <button className="dp-nav-side dp-nav-menu" type="button" aria-label="Menu">
          <svg width="22" height="16" viewBox="0 0 22 16" fill="none" aria-hidden="true">
            <path d="M1 1H21M1 8H21M1 15H21" stroke="white" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {/* Content */}
      <div className="dp-layout">
        <div className="dp-card">
          {/* DockPass logo — same size as all other screens */}
          <div className="dp-dockpass-logo">
            <Image
              src="/DockpassLogo.svg"
              alt="DockPass"
              width={334}
              height={59}
              style={{ width: "100%", height: 59 }}
            />
          </div>

          <h2 className="dp-fail-title">Appointment not found</h2>

          <p className="dp-fail-contact-label">Contact the facility at</p>
          <p className="dp-fail-phone">1 (212) 555-1212</p>

          {/* Push buttons to bottom */}
          <div className="dp-fail-spacer" />

          <div className="dp-fail-actions">
            <button
              className="dp-fail-btn dp-fail-btn--outline"
              type="button"
              onClick={() => router.push("/checkin")}
            >
              Edit Extracted Data
            </button>
            <button
              className="dp-fail-btn dp-fail-btn--solid"
              type="button"
              onClick={() => router.push("/checkin")}
            >
              Start Over
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
