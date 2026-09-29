import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  Cancel01Icon,
  ChampionIcon,
  ChartDecreaseIcon,
  CheckListIcon,
  Coins01Icon,
  HelpCircleIcon,
  Invoice01Icon,
  PackageAddIcon,
  PackageIcon,
  PackageRemoveIcon,
  PencilEdit02Icon,
  SleepingIcon,
  SnowIcon,
  Tag01Icon,
} from "@hugeicons/core-free-icons";

/**
 * Hugeicons, as required by Salla's embedded design guidelines.
 * Components use semantic names so icons can be swapped in one place.
 */
const ICONS = {
  alert: Alert02Icon,
  checklist: CheckListIcon,
  close: Cancel01Icon,
  coins: Coins01Icon,
  edit: PencilEdit02Icon,
  help: HelpCircleIcon,
  invoice: Invoice01Icon,
  outOfStock: PackageRemoveIcon,
  package: PackageIcon,
  restock: PackageAddIcon,
  sleeping: SleepingIcon,
  snow: SnowIcon,
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
