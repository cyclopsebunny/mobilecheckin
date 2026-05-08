import { DockGrantedScreen } from "@/components/checkin/DockGrantedScreen";
import { NoMatchScreen } from "@/components/checkin/NoMatchScreen";

interface ResultPageProps {
  searchParams: Promise<{
    status?: string;
    dock?: string;
    appointmentId?: string;
  }>;
}

export default async function ResultPage({ searchParams }: ResultPageProps) {
  const params = await searchParams;

  if (params.status === "granted") {
    return (
      <DockGrantedScreen
        appointmentId={params.appointmentId ?? ""}
        dockFromQuery={params.dock ?? ""}
      />
    );
  }

  return <NoMatchScreen />;
}
