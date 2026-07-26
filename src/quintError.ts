/** Compatibility shim required by the vendored Quint grammar's semantic actions. */
export function quintErrorToString(error: { code: string; message: string }): string {
  return `${error.code}: ${error.message}`;
}
