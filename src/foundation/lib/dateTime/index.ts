export function nowIso(): string {
  return new Date().toISOString();
}

export function formatIsoForDisplay(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
