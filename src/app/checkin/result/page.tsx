import Link from "next/link";
import { DockGrantedScreen } from "@/components/checkin/DockGrantedScreen";

interface ResultPageProps {
  searchParams: Promise<{
    status?: string;
    dock?: string;
    appointmentId?: string;
  }>;
}

export default async function ResultPage({ searchParams }: ResultPageProps) {
  const params = await searchParams;
  const granted = params.status === "granted";

  if (granted) {
    return (
      <DockGrantedScreen
        appointmentId={params.appointmentId ?? ""}
        dockFromQuery={params.dock ?? ""}
      />
    );
  }

  return (
    <main className="app-shell">
      <section className="card stack">
        <span className="pill">No Match Found</span>
        <h1 className="title">Please contact the facility.</h1>
        <p className="subtitle">
          We could not locate a matching appointment from the provided information.
        </p>
        <p className="alert alert-error">Use the posted contact number at the check-in gate.</p>

        <Link href="/checkin">
          <button className="button button-primary" type="button">
            Start New Check-In
          </button>
        </Link>
      </section>
    </main>
  );
}
