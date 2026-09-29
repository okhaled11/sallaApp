import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  Analytics01Icon,
  AnalyticsUpIcon,
  BarChartIcon,
  Cancel01Icon,
  ChampionIcon,
  ChartDecreaseIcon,
  CheckListIcon,
  Coins01Icon,
  Download01Icon,
  File01Icon,
  HelpCircleIcon,
  Invoice01Icon,
  Money01Icon,
  PackageAddIcon,
  PackageIcon,
  PackageRemoveIcon,
  PencilEdit02Icon,
  PrinterIcon,
  SleepingIcon,
  SnowIcon,
  Store01Icon,
  Tag01Icon,
} from "@hugeicons/core-free-icons";

/**
 * Hugeicons, as required by Salla's embedded design guidelines.
 * Components use semantic names so icons can be swapped in one place.
 */
const ICONS = {
  alert: Alert02Icon,
  analytics: Analytics01Icon,
  analyticsUp: AnalyticsUpIcon,
  barChart: BarChartIcon,
  checklist: CheckListIcon,
  close: Cancel01Icon,
  coins: Coins01Icon,
  download: Download01Icon,
  edit: PencilEdit02Icon,
  file: File01Icon,
  help: HelpCircleIcon,
  invoice: Invoice01Icon,
  money: Money01Icon,
  outOfStock: PackageRemoveIcon,
  package: PackageIcon,
  printer: PrinterIcon,
  restock: PackageAddIcon,
  sleeping: SleepingIcon,
  snow: SnowIcon,
  store: Store01Icon,
  tag: Tag01Icon,
  trendDown: ChartDecreaseIcon,
  trophy: ChampionIcon,
};

export default function Icon({ name, size = 16, className }) {
  return (
    <HugeiconsIcon
      icon={ICONS[name]}
      size={size}
      strokeWidth={1.5}
      className={className}
      aria-hidden="true"
      focusable="false"
    />
  );
}
