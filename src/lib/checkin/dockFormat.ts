/** e.g. D04 → "Dock 4", D12 → "Dock 12" */
export function formatDockTitle(dockNumber: string): string {
  const t = dockNumber.trim();
  const m = /^D0*(\d+)$/i.exec(t);
  if (m) {
    return `Dock ${m[1]}`;
  }
  return t ? `Dock ${t}` : "Dock";
}
