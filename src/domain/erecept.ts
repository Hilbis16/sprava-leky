const ERECEPT_ID = /^[A-Z0-9]{12}$/;

export function normalizeEreceptId(raw: string): string | null {
  const value = raw.trim();
  const fromUrl = value.match(/[?&]i=([a-zA-Z0-9\s]{12,16})/i)?.[1];
  const candidate = (fromUrl ?? value).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return ERECEPT_ID.test(candidate) ? candidate : null;
}

export function formatEreceptId(value: string): string {
  return value.replace(/(.{4})(?=.)/g, '$1 ');
}
