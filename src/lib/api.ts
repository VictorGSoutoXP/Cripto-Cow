export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export const sessionExpiredEvent = 'cripto-cow:session-expired';

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      credentials: 'same-origin',
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(
      'Não foi possível conectar ao servidor. Confira sua conexão e tente novamente.',
      0,
      'NETWORK_ERROR',
    );
  }
  const body = await response.json().catch(() => null);
  if (
    response.status === 401 &&
    body?.code === 'SESSION_REQUIRED' &&
    (path !== '/admin' || (options.method && options.method !== 'GET')) &&
    typeof window !== 'undefined'
  )
    window.dispatchEvent(new Event(sessionExpiredEvent));
  if (!response.ok)
    throw new ApiError(
      typeof body?.error === 'string'
        ? body.error
        : 'Não foi possível carregar os dados. Tente novamente em instantes.',
      response.status,
      typeof body?.code === 'string' ? body.code : undefined,
    );
  if (body === null)
    throw new ApiError(
      'O servidor retornou uma resposta inválida. Tente novamente.',
      response.status,
    );
  return body as T;
}

export const money = (amount: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: amount % 100 === 0 ? 0 : 2,
  }).format(amount / 100);
export const date = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value.length === 10 ? `${value}T12:00:00-03:00` : value));

export function cents(value: FormDataEntryValue | null) {
  const input = String(value ?? '')
    .trim()
    .replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(input))
    throw new Error('Informe um valor com até duas casas decimais.');
  return Math.round(Number(input) * 100);
}
