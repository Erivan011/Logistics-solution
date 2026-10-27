export const formatCurrency = (cents: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
export const formatNumber = (n: number) =>
  new Intl.NumberFormat("pt-BR").format(n);
export const formatDistance = (m: number) =>
  (m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " km";
// Scenario times are minutes from 08:00, the start of the planning day.
export const formatPlanningTime = (min: number) =>
  `${String(8 + Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
export const priorityLabels = {
  urgent: "Urgente",
  high: "Alta",
  normal: "Normal",
};
