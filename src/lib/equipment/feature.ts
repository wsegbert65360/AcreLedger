/** Equipment UI is off for the Oct 15 AU pilot unless this build flag is set. */
export function isEquipmentUiEnabled(
  env: Record<string, string | undefined> = import.meta.env,
): boolean {
  return env.VITE_EQUIPMENT_UI_ENABLED === 'true';
}
