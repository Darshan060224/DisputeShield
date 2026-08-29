import { AlertTriangle, FileText, Home as HomeIcon, Landmark, Link2, RefreshCw, ShieldCheck } from "lucide-react";

export const dashboardNavigation = [
  { label: "Home", icon: HomeIcon, href: "/" },
  { label: "Disputes", icon: AlertTriangle, href: "/operations/disputes" },
  { label: "Transactions", icon: RefreshCw, href: "/payments" },
  { label: "Settlements", icon: Landmark, href: "/operations/settlements" },
  { label: "Reports", icon: FileText, href: "/operations/reports" },
] as const;

export const disputeOperationNavigation = [
  { label: "Evidence packets", icon: ShieldCheck, href: "/operations/evidence-packets" },
  { label: "Case timeline", icon: Link2, href: "/operations/case-timeline" },
  { label: "Document vault", icon: FileText, href: "/operations/document-vault" },
  { label: "Webhook ledger", icon: FileText, href: "/operations/webhook-ledger" },
  { label: "Evaluation lab", icon: FileText, href: "/operations/evaluation-lab" },
] as const;

export const customerSpaceHref = "/customer-space";
