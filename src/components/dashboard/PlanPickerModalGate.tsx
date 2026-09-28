"use client";

import { useDashboard } from "./DashboardContext";
import PlanPickerModal from "./PlanPickerModal";
import type { CaktoCheckoutUrls } from "@/lib/billing/cakto";

// Montado uma vez no layout (mesmo padrão do CreateVideoWizard) — assim
// qualquer lugar do dashboard (Sidebar, wizard de vídeo bloqueado por falta
// de assinatura, tela de Guias) pode abrir o mesmo modal global via
// `openPlanModal()` do DashboardContext, sem duplicar o componente.
export default function PlanPickerModalGate({
  caktoCheckoutUrls,
}: {
  caktoCheckoutUrls: CaktoCheckoutUrls | null;
}) {
  const { isPlanModalOpen, closePlanModal } = useDashboard();
  if (!isPlanModalOpen) return null;
  return <PlanPickerModal onClose={closePlanModal} caktoCheckoutUrls={caktoCheckoutUrls} />;
}
