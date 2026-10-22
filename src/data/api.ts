import { getAuthToken } from './sessionStore';

const baseUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/,'');
export const apiEnabled = Boolean(baseUrl);
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export async function apiResponse(path: string, init: RequestInit = {}, expectedUserId?: string) {
  if (!baseUrl) throw new ApiError(0,'NOT_CONFIGURED','Server není připojený.');
  const token = await getAuthToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(),30000);
  try {
    const response = await fetch(`${baseUrl}${path}`, { ...init,credentials: 'include',signal: controller.signal,
      headers: { 'Content-Type': 'application/json',...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(expectedUserId ? { 'X-Expected-User': expectedUserId } : {}),...init.headers },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { code?: string; message?: string };
      const code = body.code ?? 'REQUEST_FAILED';
      const isAuth = path.startsWith('/api/auth/');
      const message = isAuth ? (code.includes('OTP') ? 'Kód není platný nebo vypršel. Vyžádejte si nový.' : 'Přihlášení se nepodařilo. Zkuste to prosím za chvíli.')
        : body.message ?? 'Server nemohl dokončit požadavek.';
      throw new ApiError(response.status,code,message);
    }
    return response;
  } finally { clearTimeout(timer); }
}
export async function apiRequest<T>(path: string, init: RequestInit = {}, expectedUserId?: string): Promise<T> {
  return (await apiResponse(path,init,expectedUserId)).json();
}
