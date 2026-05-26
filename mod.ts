import { contentType } from "@std/media-types";
import { extname } from "@std/path/extname";
import { renderToString } from "preact-render-to-string";
import type { VNode } from "preact";

export * from "preact";
export type { VNode } from "preact";

/** Path parameters extracted from a matched route. */
export type PathParams = Record<string, string | undefined> | undefined;

/** A route handler. May return a `Response` or a JSX element. */
export type Handler = (
  request: Request,
  info: Deno.ServeHandlerInfo,
  params: PathParams,
) => Response | VNode | Promise<Response | VNode>;

/** A map of URL patterns to their handlers. The `404` key handles unmatched
 * requests. */
export interface Routes {
  [path: string]: Handler;
}

/** Register routes and start listening for requests.
 *
 * Paths are matched with {@linkcode URLPattern}; matched groups are passed to
 * the handler as the third argument. The `404` route handles every request
 * that no other route matches.
 *
 * @example
 * ```ts
 * import { serve } from "@satya/sift";
 *
 * serve({
 *   "/": () => new Response("hello"),
 *   "/blog/:slug": (_req, _info, params) => new Response(params?.slug),
 *   404: () => new Response("not found", { status: 404 }),
 * });
 * ```
 */
export function serve(
  routes: Routes,
  options: Deno.ServeTcpOptions = {},
): Deno.HttpServer<Deno.NetAddr> {
  const notFound = routes[404] ?? defaultNotFound;
  const compiled = Object.entries(routes)
    .filter(([path]) => path !== "404")
    .map(([path, handler]) => ({
      pattern: new URLPattern({ pathname: path }),
      handler,
    }));

  return Deno.serve(options, async (request, info) => {
    const url = new URL(request.url);
    const start = performance.now();
    let response: Response | undefined;

    for (const { pattern, handler } of compiled) {
      const match = pattern.exec(url);
      if (!match) continue;

      try {
        response = toResponse(
          await handler(request, info, match.pathname.groups),
        );
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) break;
        console.error("sift: unhandled error while serving request", error);
        response = json({ error: errorMessage(error) }, { status: 500 });
      }
      break;
    }

    response ??= toResponse(await notFound(request, info, {}));
    log(request, url, response, start);
    return response;
  });
}

function defaultNotFound(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function toResponse(result: Response | VNode): Response {
  return result instanceof Response ? result : jsx(result);
}

function log(
  request: Request,
  url: URL,
  response: Response,
  start: number,
): void {
  const ms = (performance.now() - start).toFixed(1);
  const cached = response.headers.has("x-cache-hit") ? "cached " : "";
  console.log(
    `${request.method} ${url.pathname}${url.search} ${cached}${ms}ms ${response.status}`,
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Options for {@linkcode serveStatic}. */
export interface ServeStaticOptions {
  /** Base URL used to resolve `path`, usually `import.meta.url`. */
  baseUrl: string;
  /** Transform the response before it is returned, e.g. to set headers. */
  intervene?: (
    request: Request,
    response: Response,
  ) => Response | Promise<Response>;
  /** Cache served files in memory. Enabled by default. */
  cache?: boolean;
}

/** A small least-recently-used cache. */
class LRU<K, V> {
  #map = new Map<K, V>();
  #max: number;

  constructor(max: number) {
    this.#max = max;
  }

  get(key: K): V | undefined {
    const value = this.#map.get(key);
    if (value !== undefined) {
      this.#map.delete(key);
      this.#map.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.#map.size >= this.#max) {
      const oldest = this.#map.keys().next().value;
      if (oldest !== undefined) this.#map.delete(oldest);
    }
    this.#map.set(key, value);
  }
}

const MAX_CACHE_BYTES = 10 * 1024 * 1024;
const fileCache = new LRU<string, Response>(20);

/** Serve files from disk, resolved relative to `options.baseUrl`.
 *
 * To serve a directory, end the route with a `:filename+` group; its value is
 * appended to `path`. Files under 10MB are cached in memory unless caching is
 * disabled.
 *
 * @example
 * ```ts
 * import { serve, serveStatic } from "@satya/sift";
 *
 * serve({
 *   "/": serveStatic("index.html", { baseUrl: import.meta.url }),
 *   "/assets/:filename+": serveStatic("assets", { baseUrl: import.meta.url }),
 * });
 * ```
 */
export function serveStatic(
  path: string,
  { baseUrl, intervene, cache = true }: ServeStaticOptions,
): Handler {
  return async (request, _info, params) => {
    const filePath = params?.filename
      ? `${path.replace(/\/$/, "")}/${params.filename}`
      : path;
    const url = new URL(filePath, baseUrl);
    const key = url.href;

    if (cache) {
      const hit = fileCache.get(key);
      if (hit) {
        const response = hit.clone();
        response.headers.set("x-cache-hit", "true");
        return response;
      }
    }

    const body = await Deno.readFile(url);
    let response = new Response(body);
    const type = contentType(extname(filePath));
    if (type) response.headers.set("content-type", type);
    if (intervene) response = await intervene(request, response);

    if (cache && body.byteLength < MAX_CACHE_BYTES) {
      fileCache.set(key, response.clone());
    }
    return response;
  };
}

/** Serialize `data` to JSON and return it as an `application/json` response. */
export function json(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(data) + "\n", { ...init, headers });
}

/** Render a JSX element to HTML and return it as a `text/html` response. */
export function jsx(node: VNode, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "text/html; charset=utf-8");
  }
  return new Response(renderToString(node), { ...init, headers });
}

/** Per-method requirements for {@linkcode validateRequest}. */
export interface RequestTerms {
  [method: string]: {
    headers?: string[];
    params?: string[];
    body?: string[];
  };
}

/** The result of {@linkcode validateRequest}. */
export interface ValidationResult {
  error?: { message: string; status: number };
  body?: Record<string, unknown>;
}

/** Check that a request satisfies the given terms: an allowed method and the
 * presence of the named headers, query params and body fields.
 *
 * The parsed JSON body is returned so callers don't need to read it again.
 */
export async function validateRequest(
  request: Request,
  terms: RequestTerms,
): Promise<ValidationResult> {
  const term = terms[request.method];
  if (!term) {
    return {
      error: {
        message: `method ${request.method} is not allowed for the URL`,
        status: 405,
      },
    };
  }

  if (term.params?.length) {
    const search = new URL(request.url).searchParams;
    for (const param of term.params) {
      if (!search.has(param)) {
        return {
          error: {
            message: `param '${param}' is required to process the request`,
            status: 400,
          },
        };
      }
    }
  }

  if (term.headers?.length) {
    for (const header of term.headers) {
      if (!request.headers.has(header)) {
        return {
          error: { message: `header '${header}' not available`, status: 400 },
        };
      }
    }
  }

  if (term.body?.length) {
    const body = await request.json();
    for (const field of term.body) {
      if (!(field in body)) {
        return {
          error: {
            message: `field '${field}' is not available in the body`,
            status: 400,
          },
        };
      }
    }
    return { body };
  }

  return { body: {} };
}
