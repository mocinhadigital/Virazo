"use client";

import { useDashboard } from "./DashboardContext";
import PlanPickerModal from "./PlanPickerModal";

// Montado uma vez no layout (mesmo padrão do CreateVideoWizard) — assim
// qualquer lugar do dashboard (Sidebar, wizard de vídeo bloqueado por falta
// de assinatura, tela de Guias) pode abrir o mesmo modal global via
// `openPlanModal()` do DashboardContext, sem duplicar o componente.
export default function PlanPickerModalGate() {
  const { isPlanModalOpen, closePlanModal } = useDashboard();
  if (!isPlanModalOpen) return null;
  return <PlanPickerModal onClose={closePlanModal} />;
}
