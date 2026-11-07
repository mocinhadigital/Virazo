import SeriesWizard from "@/components/dashboard/series/SeriesWizard";
import RealisticTopCard from "@/components/dashboard/realistic/RealisticTopCard";

export default function DashboardPage() {
  return (
    <>
      <div className="mx-auto max-w-[720px]">
        <RealisticTopCard />
      </div>
      <SeriesWizard />
    </>
  );
}
