import {
  AlertOctagon, BarChart3, Bell, Boxes, ClipboardCheck, FileSearch, LayoutDashboard, ScanBarcode, ShieldAlert,
  ShieldCheck, SlidersHorizontal, Tag, UserRound, Users, Warehouse, Wrench, type LucideIcon,
} from "lucide-react";

export const ICONES_ROTA: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/prontuario": FileSearch,
  "/scanner": ScanBarcode,
  "/montagem": Wrench,
  "/qualidade": ClipboardCheck,
  "/avarias": AlertOctagon,
  "/etiquetagem": Tag,
  "/estoque": Warehouse,
  "/inventario": Boxes,
  "/relatorios": BarChart3,
  "/equipe": Users,
  "/perfis": ShieldCheck,
  "/auditoria": ShieldAlert,
  "/configuracoes": SlidersHorizontal,
  "/notificacoes": Bell,
  "/perfil": UserRound,
};

export const iconeDaRota = (href: string): LucideIcon => ICONES_ROTA[href] ?? LayoutDashboard;
