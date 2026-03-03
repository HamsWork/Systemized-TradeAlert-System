/**
 * Normalize req.params or req.query value to a single string (Express can give string | string[]).
 */
export function getParam(
  req: { params?: Record<string, string | string[]> },
  key: string,
): string {
  const v = req.params?.[key];
  return Array.isArray(v) ? v[0] ?? "" : (v ?? "");
}

export function getQuery(
  req: { query?: Record<string, string | string[] | undefined> },
  key: string,
): string {
  const v = req.query?.[key];
  if (v == null) return "";
  return Array.isArray(v) ? v[0] ?? "" : (v ?? "");
}
