import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  // The server's CSRF gate rejects any POST/PUT/PATCH/DELETE under /api that
  // is not application/json, so the header goes on every state-changing
  // request, body or not (an empty JSON body parses to {}).
  const mutating = !["GET", "HEAD"].includes(method.toUpperCase());
  const res = await fetch(url, {
    method,
    headers: mutating || data !== undefined ? { "Content-Type": "application/json" } : {},
    body: data !== undefined ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

/**
 * The server's JSON `message` out of the "<status>: <body>" error apiRequest
 * throws, or the fallback. apiRequest throws on every non-2xx, so a `!res.ok`
 * branch after it never runs; read the message from the thrown error instead.
 */
export function serverMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  try {
    const body = JSON.parse(err.message.replace(/^\d{3}:\s*/, "")) as { message?: string };
    return body.message || fallback;
  } catch {
    return err.message || fallback;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
