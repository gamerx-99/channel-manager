import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { AppRouter } from "../../server/routers";
import { localizeServerMessage, storedLanguage } from "@/lib/serverErrors";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";

export const queryClient = new QueryClient();

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    console.error("[API Mutation Error]", error);
  }
});

/**
 * Resolves request headers for tRPC client.
 * Null-safe when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing.
 * Better Auth session cookies are transmitted automatically via credentials: "include".
 */
export async function getTrpcHeaders(): Promise<Record<string, string>> {
  // Better Auth sessions travel via httpOnly cookies (credentials: "include").
  return {};
}

/** Shows known server error messages in the viewer's language (servers answer in English). */
export const localizeErrorsLink: TRPCLink<AppRouter> = () => ({ next, op }) =>
  observable(observer => next(op).subscribe({
    next: value => observer.next(value),
    error: error => {
      error.message = localizeServerMessage(error.message, storedLanguage());
      observer.error(error);
    },
    complete: () => observer.complete(),
  }));

export function createTrpcClient() {
  return trpc.createClient({
    links: [
      localizeErrorsLink,
      httpBatchLink({
        url: "/api/trpc",
        transformer: superjson,
        headers: getTrpcHeaders,
        fetch(input, init) {
          return globalThis.fetch(input, {
            ...(init ?? {}),
            credentials: "include",
          });
        },
      }),
    ],
  });
}

export const trpcClient = createTrpcClient();

const rootElement = typeof document !== "undefined" ? document.getElementById("root") : null;
if (rootElement) {
  createRoot(rootElement).render(
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  );
}
