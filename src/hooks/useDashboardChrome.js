import { useEffect, useRef } from "react";

/**
 * useDashboardChrome - Page title and top action through the Embedded SDK.
 *
 * Salla's design guidelines forbid a header/navbar inside the iframe: the
 * dashboard shows the title (embedded.page.setTitle) and the primary action
 * button (embedded.nav.setAction) in its own chrome.
 *
 * @param {object} options
 * @param {object} options.embedded - SDK instance
 * @param {boolean} options.enabled - Only after embedded.ready()
 * @param {string} options.title - Page title shown by the dashboard
 * @param {{ title: string, value: string, icon?: string, disabled?: boolean }} [options.action]
 * @param {function} [options.onAction] - Called when the action is clicked
 */
export function useDashboardChrome({
  embedded,
  enabled,
  title,
  action,
  onAction,
}) {
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  useEffect(() => {
    if (!enabled || !title) return;
    embedded?.page?.setTitle?.(title);
  }, [embedded, enabled, title]);

  const actionTitle = action?.title;
  const actionValue = action?.value;
  const actionIcon = action?.icon;
  const actionDisabled = action?.disabled ?? false;

  useEffect(() => {
    const nav = embedded?.nav;
    if (!enabled || !actionValue || !nav?.setAction) return;

    nav.setAction({
      title: actionTitle,
      value: actionValue,
      icon: actionIcon,
      disabled: actionDisabled,
    });
    const unsubscribe = nav.onActionClick?.((value) => {
      if (value === actionValue) onActionRef.current?.();
    });

    return () => {
      unsubscribe?.();
      nav.clearAction?.();
    };
  }, [embedded, enabled, actionTitle, actionValue, actionIcon, actionDisabled]);
}
