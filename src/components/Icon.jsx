import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  Analytics01Icon,
  AnalyticsUpIcon,
  AiSparklesIcon,
  BarChartIcon,
  Cancel01Icon,
  ChampionIcon,
  ChartDecreaseIcon,
  CheckListIcon,
  CheckmarkCircle01Icon,
  Coins01Icon,
  Copy01Icon,
  DashboardSquare01Icon,
  Download01Icon,
  File01Icon,
  FileEditIcon,
  GlobeIcon,
  HelpCircleIcon,
  Image01Icon,
  Invoice01Icon,
  Layout01Icon,
  Location01Icon,
  Money01Icon,
  PackageAddIcon,
  PackageIcon,
  PackageRemoveIcon,
  PencilEdit02Icon,
  PrinterIcon,
  Search01Icon,
  SleepingIcon,
  SnowIcon,
  SparklesIcon,
  Store01Icon,
  Tag01Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";

/**
 * Hugeicons, as required by Salla's embedded design guidelines.
 * Components use semantic names so icons can be swapped in one place.
 */
const ICONS = {
  aiSparkles: AiSparklesIcon,
  alert: Alert02Icon,
  analytics: Analytics01Icon,
  analyticsUp: AnalyticsUpIcon,
  barChart: BarChartIcon,
  checkCircle: CheckmarkCircle01Icon,
  checklist: CheckListIcon,
  close: Cancel01Icon,
  coins: Coins01Icon,
  copy: Copy01Icon,
  dashboard: DashboardSquare01Icon,
  download: Download01Icon,
  edit: PencilEdit02Icon,
  file: File01Icon,
  fileEdit: FileEditIcon,
  globe: GlobeIcon,
  help: HelpCircleIcon,
  image: Image01Icon,
  invoice: Invoice01Icon,
  layout: Layout01Icon,
  location: Location01Icon,
  money: Money01Icon,
  outOfStock: PackageRemoveIcon,
  package: PackageIcon,
  printer: PrinterIcon,
  restock: PackageAddIcon,
  search: Search01Icon,
  sleeping: SleepingIcon,
  snow: SnowIcon,
  sparkles: SparklesIcon,
  store: Store01Icon,
  tag: Tag01Icon,
  trendDown: ChartDecreaseIcon,
  trophy: ChampionIcon,
  view: ViewIcon,
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
