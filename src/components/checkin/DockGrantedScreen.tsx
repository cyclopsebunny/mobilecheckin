"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { formatDockTitle } from "@/lib/checkin/dockFormat";
import { formatAppointmentWindow } from "@/lib/checkin/formatAppointment";
import { gateCodeFromAppointmentId } from "@/lib/checkin/gateCode";
import { getAppointmentById } from "@/lib/checkin/getAppointment";
import {
  GRANTED_RESULT_STORAGE_KEY,
  parseGrantedSnapshot,
  type GrantedResultSnapshot
} from "@/lib/checkin/resultSnapshot";
import { resolveDestinationQuery } from "@/lib/checkin/destinationAddress";
import type { Appointment, ExtractedDocumentData } from "@/types/checkin";

function formatAddressBlock(query: string) {
  const segments = query.split(",").map((s) => s.trim()).filter(Boolean);
  if (segments.length <= 1) {
    return query;
  }
  const line1 = segments[0];
  const line2 = segments.slice(1).join(", ");
  return (
    <>
      {line1},<br />
      {line2}
    </>
  );
}

function GateIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <path
        d="M6 14h22v12H6V14zm2-2V10a8 8 0 0116 0v2M8 26v4M28 26v4"
        stroke="#009CDE"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DockDoorIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="6" y="4" width="20" height="24" rx="2" stroke="#009CDE" strokeWidth="2" />
      <circle cx="22" cy="16" r="1.5" fill="#009CDE" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <rect x="6" y="8" width="24" height="22" rx="2" stroke="#009CDE" strokeWidth="2" />
      <path d="M6 14h24M12 6v4M24 6v4" stroke="#009CDE" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function DetailRow({
  label,
  value,
  valueClass
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="dp-result-kv">
      <span className="dp-result-kv-label">{label}</span>
      <span className={valueClass ?? "dp-result-kv-value"}>{value}</span>
    </div>
  );
}

export interface DockGrantedScreenProps {
  appointmentId: string;
  dockFromQuery: string;
}

export function DockGrantedScreen({ appointmentId, dockFromQuery }: DockGrantedScreenProps) {
  const [snapshot, setSnapshot] = useState<GrantedResultSnapshot | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem(GRANTED_RESULT_STORAGE_KEY);
    const parsed = parseGrantedSnapshot(raw);
    if (parsed?.appointmentId === appointmentId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is only available after mount; initial null matches SSR HTML.
      setSnapshot(parsed);
    }
  }, [appointmentId]);

  const appointment = useMemo(() => getAppointmentById(appointmentId), [appointmentId]);

  const bol: Partial<ExtractedDocumentData> = snapshot?.bol ?? {};

  const merged: Appointment | null = appointment ?? null;

  const dockRaw = decodeURIComponent(dockFromQuery || "") || merged?.dockNumber || "";
  const dockTitle = formatDockTitle(dockRaw || "—");
  const gateCode = gateCodeFromAppointmentId(appointmentId || "unknown");

  const destQuery = resolveDestinationQuery(bol, merged);

  const mapSrc = useMemo(() => {
    const q = encodeURIComponent(destQuery);
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (key) {
      return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${q}`;
    }
    return `https://www.google.com/maps?q=${q}&z=16&output=embed`;
  }, [destQuery]);

  const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destQuery)}`;

  const { startsLine, endsLine } = formatAppointmentWindow(
    bol.appointmentDate ?? merged?.appointmentDate,
    bol.appointmentTime ?? merged?.appointmentTime
  );

  const carrier = bol.carrierName ?? merged?.carrierName ?? "—";
  const trailer = bol.trailerNumber ?? merged?.trailerNumber ?? "—";
  const driver = bol.driverName ?? "—";
  const bolNum = bol.bolNumber ?? merged?.bolNumber ?? "—";
  const shipmentId =
    bol.referenceNumber ??
    bol.referenceLast5 ??
    merged?.referenceLast5 ??
    "—";

  if (!appointmentId) {
    return (
      <div className="dp-result-shell dp-result-shell--success">
        <p className="dp-result-error">Missing appointment. Return to check-in and try again.</p>
        <Link className="dp-result-link-btn" href="/checkin">
          Start New Check-In
        </Link>
      </div>
    );
  }

  return (
    <div className="dp-result-shell dp-result-shell--success">
      <header className="dp-result-top">
        <div className="dp-result-status-spacer" aria-hidden="true" />
        <div className="dp-result-brand">
          <Image src="/myQLogo.svg" alt="myQ" width={26} height={28} />
        </div>
        <button type="button" className="dp-result-menu" aria-label="Menu">
          <svg width="22" height="16" viewBox="0 0 22 16" fill="none" aria-hidden="true">
            <path d="M1 1H21M1 8H21M1 15H21" stroke="white" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className="dp-result-scroll">
        <section className="dp-result-card">
          <div className="dp-result-dockpass-row">
            <div className="dp-dockpass-logo dp-result-dockpass-logo">
              <Image src="/DockpassLogo.svg" alt="DockPass" width={167} height={36} />
            </div>
          </div>

          <div className="dp-result-cta">
            <GateIcon />
            <h2 className="dp-result-cta-title">Proceed to the gate</h2>
            <p className="dp-result-cta-body">
              Come to the entry gate and enter the code shown below on the kiosk
            </p>
            <div className="dp-result-gate-code" aria-label={`Gate code ${gateCode}`}>
              {gateCode}
            </div>
          </div>

          <div className="dp-result-divider dp-result-divider--assignment" />

          <div className="dp-result-assignment">
            <DockDoorIcon />
            <h3 className="dp-result-assignment-title">Trailer assigned to:</h3>
            <p className="dp-result-dock-big">{dockTitle}</p>
            <a className="dp-result-directions-link" href={directionsHref} target="_blank" rel="noreferrer">
              Get directions to the dock &gt;
            </a>
            <p className="dp-result-dock-note">
              Once parked at the dock, please check in at the Shipping and Receiving office.
            </p>
          </div>
        </section>

        <section className="dp-result-card dp-result-card--details">
          <div className="dp-result-divider dp-result-divider--header" />
          <div className="dp-result-appt-header">
            <CalendarIcon />
            <h3 className="dp-result-appt-title">Appointment Details</h3>
          </div>
          <div className="dp-result-time-block">
            <p className="dp-result-time-starts">{startsLine}</p>
            <p className="dp-result-time-ends">{endsLine}</p>
          </div>

          <div className="dp-result-divider dp-result-divider--section" />

          <div className="dp-result-details-body">
            <DetailRow label="Carrier:" value={carrier} />
            <DetailRow label="Trailer:" value={trailer} />
            <DetailRow label="Driver:" value={driver} />
            <div className="dp-result-kv-sep" />
            <div className="dp-result-kv dp-result-kv-bol">
              <span className="dp-result-kv-label dp-result-kv-label-bold">BOL:</span>
              <span className="dp-result-kv-value dp-result-kv-bold">{bolNum}</span>
            </div>
            <DetailRow label="Shipment ID:" value={shipmentId} />
            {bol.proNumber ? <DetailRow label="PRO #:" value={bol.proNumber} /> : null}
            {bol.poNumber ? <DetailRow label="PO #:" value={bol.poNumber} /> : null}
            {bol.shipperReference ? (
              <DetailRow label="Shipper ref:" value={bol.shipperReference} />
            ) : null}
            {bol.agentNumber ? <DetailRow label="Agent / Broker #:" value={bol.agentNumber} /> : null}
          </div>

          <div className="dp-result-map-wrap">
            <iframe
              title="Destination map"
              className="dp-result-map-frame"
              src={mapSrc}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
          <p className="dp-result-address">{formatAddressBlock(destQuery)}</p>
        </section>

        <Link className="dp-result-new-checkin" href="/checkin">
          Start New Check-In
        </Link>
      </div>
      <div className="dp-home-indicator" />
    </div>
  );
}
