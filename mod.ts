/// <reference no-default-lib="true"/>
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />

import {
  Status,
  STATUS_TEXT,
} from "https://deno.land/std@0.154.0/http/http_status.ts";

import {
  ConnInfo,
  serve as stdServe,
  ServeInit,
} from "https://deno.land/std@0.154.0/http/server.ts";

import { inMemoryCache } from "https://deno.land/x/httpcache@0.1.2/in_memory.ts";

import {
  contentType as getContentType,
  lookup,
} from "https://deno.land/x/media_types@v2.11.1/mod.ts";
import { renderToString } from "https://esm.sh/preact-render-to-string@5.2.4?target=deno";
import { type VNode } from "https://esm.sh/preact@10.10.6?target=deno";
export * from "https://esm.sh/preact@10.10.6?target=deno";

export {
  Status,
  STATUS_TEXT,
} from "https://deno.land/std@0.154.0/http/http_status.ts";

export type PathParams = Record<string, string> | undefined;

export type { ConnInfo } from "https://deno.land/std@0.154.0/http/server.ts";

/** Note: we should aim to keep it the same as std handler. */
export type Handler = (
  request: Request,
  connInfo: ConnInfo,
  params: PathParams,
) => Promise<Response> | Response;

export interface Routes {
  [path: string]: Handler;
}

const globalCache = inMemoryCache(20);

let routes: Routes = { 404: defaultNotFoundPage };

/** serve() registers "fetch" event listener and invokes the provided route
 * handler for the route with the request as first argument and processed path
 * params as the second.
 *
 * @example
 * ```ts
 * serve({
 *  "/": (request: Request) => new Response("Hello World!"),
 *  404: (request: Request) => new Response("not found")
 * })
 * ```
 *
 * The route handler declared for `404` will be used to serve all
 * requests that do not have a route handler declared.
 */
export function serve(
  userRoutes: Routes,
  options: ServeInit = { port: 8000 },
): void {
  routes = { ...routes, ...userRoutes };
  stdServe((req, connInfo) => handleRequest(req, connInfo, routes), options);
}

async function handleRequest(
  request: Request,
  connInfo: ConnInfo,
  routes: Routes,
): Promise<Response> {
  const { search, pathname } = new URL(request.url);

  try {
    const startTime = Date.now();
    let response = await globalCache.match(request);
    if (typeof response === "undefined") {
      for (const route of Object.keys(routes)) {
        // @ts-ignore URLPattern is still not available in dom lib.
        const pattern = new URLPattern({ pathname: route });
        if (pattern.test({ pathname })) {
          const params = pattern.exec({ pathname })?.pathname.groups;
          try {
            response = await routes[route](request, connInfo, params);
          } catch (error) {
            if (error.name == "NotFound") {
              break;
            }

            console.error("Error serving request:", error);
            response = json({ error: error.message }, { status: 500 });
          }
          if (!(response instanceof Response)) {
            response = jsx(response);
          }
          break;
        }
      }
    } else {
      response.headers.set("x-function-cache-hit", "true");
    }

    // return not found page if no handler is found.
    if (response === undefined) {
      response = await routes["404"](request, connInfo, {});
    }

    // method path+params timeTaken status
    console.log(
      `${request.method} ${pathname + search} ${
        response.headers.has("x-function-cache-hit")
          ? String.fromCodePoint(0x26a1)
          : ""
      }${Date.now() - startTime}ms ${response.status}`,
    );

    return response;
  } catch (error) {
    console.error("Error serving request:", error);
    return json({ error: error.message }, { status: 500 });
  }
}

function defaultNotFoundPage() {
  return new Response("<h1 align=center>page not found</h1>", {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export interface ServeStaticOptions {
  /** The base to be used for the construction of absolute URL. */
  baseUrl: string;
  /** A function to modify the response before it's served to the request.
   * For example, set appropriate content-type header.
   *
   * @default undefined */
  intervene?: (
    request: Request,
    response: Response,
  ) => Promise<Response> | Response;
  /** Disable caching of the responses.
   *
   * @default true */
  cache?: boolean;
}

/** Serve static files hosted on the internet or relative to your source code.
 *
 * Be default, up to 20 static assets that are less than 10MB are cached. You
 * can disable caching by setting `cache: false` in the options object.
 *
 * @example
 * ```
 * import { serve, serveStatic } from "https://deno.land/x/sift/mod.ts"
 *
 * serve({
 *  // It is required that the path ends with `:filename+`
 *  "/:filename+": serveStatic("public", { baseUrl: import.meta.url }),
 * })
 * ```
 */
export function serveStatic(
  relativePath: string,
  { baseUrl, intervene, cache = true }: ServeStaticOptions,
): Handler {
  return async (
    request: Request,
    connInfo: ConnInfo,
    params: PathParams,
  ): Promise<Response> => {
    // Construct URL for the request resource.
    const filename = params?.filename;
    let filePath = relativePath;
    if (filename) {
      filePath = relativePath.endsWith("/")
        ? relativePath + filename
        : relativePath + "/" + filename;
    }
    const fileUrl = new URL(filePath, baseUrl);

    let response: Response | undefined;
    if (cache) {
      response = await globalCache.match(request);
    }

    if (typeof response === "undefined") {
      const body = await Deno.readFile(fileUrl);
      response = new Response(body);
      const contentType = getContentType(String(lookup(filePath)));
      if (contentType) {
        response.headers.set("content-type", contentType);
      }
      if (typeof intervene === "function") {
        response = await intervene(request, response);
      }

      if (cache) {
        // We don't want to cache if the resource size if greater than 10MB.
        // The size is arbitrary choice.
        const TEN_MB = 1024 * 1024 * 10;
        if (Number(response.headers.get("content-length")) < TEN_MB) {
          await globalCache.put(request, response);
        }
      }
    }

    if (response.status == 404) {
      return routes[404](request, connInfo, {});
    }
    return response;
  };
}

/** Converts an object literal to a JSON string and returns
 * a Response with `application/json` as the `content-type`.
 *
 * @example
 * ```js
 * import { serve, json } from "https://deno.land/x/sift/mod.ts"
 *
 * serve({
 *  "/": () => json({ message: "hello world"}),
 * })
 * ```
 */
export function json(
  jsobj: Parameters<typeof JSON.stringify>[0],
  init?: ResponseInit,
): Response {
  const headers = init?.headers instanceof Headers
    ? init.headers
    : new Headers(init?.headers);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }
  const statusText = init?.statusText ??
    STATUS_TEXT[(init?.status as Status) ?? Status.OK];
  return new Response(JSON.stringify(jsobj) + "\n", {
    statusText,
    status: init?.status ?? Status.OK,
    headers,
  });
}

/** Renders JSX components to HTML and returns a Response with `text/html`
 * as the `content-type.`
 *
 * @example
 * ```jsx
 * import { serve, jsx, h } from "https://deno.land/x/sift/mod.ts"
 *
 * const Greet = ({name}) => <div>Hello, {name}</div>;
 *
 * serve({
 *  "/": () => jsx(<html><Greet name="Sift" /></html),
 * })
 * ```
 *
 * Make sure your file extension is either `.tsx` or `.jsx` and you've `h` imported
 * when using this function. */
export function jsx(jsx: VNode, init?: ResponseInit): Response {
  const headers = init?.headers instanceof Headers
    ? init.headers
    : new Headers(init?.headers);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "text/html; charset=utf-8");
  }
  const statusText = init?.statusText ??
    STATUS_TEXT[(init?.status as Status) ?? Status.OK];
  return new Response(renderToString(jsx), {
    statusText,
    status: init?.status ?? Status.OK,
    headers,
  });
}

// This is very naive and accepts only the field names to validate if
// the specified field exists at the specified place.
// FIXME(@satyarohith): do better.
export interface RequestTerms {
  [key: string]: {
    headers?: string[];
    body?: string[];
    params?: string[];
  };
}

/**
 * Validate whether the incoming request meets the provided terms.
 */
export async function validateRequest(
  request: Request,
  terms: RequestTerms,
): Promise<{
  error?: { message: string; status: number };
  body?: { [key: string]: unknown };
}> {
  let body = {};

  // Validate the method.
  if (!terms[request.method]) {
    return {
      error: {
        message: `method ${request.method} is not allowed for the URL`,
        status: Status.MethodNotAllowed,
      },
    };
  }

  // Validate the params if defined in the terms.
  if (
    terms[request.method]?.params &&
    terms[request.method].params!.length > 0
  ) {
    const { searchParams } = new URL(request.url);
    const requestParams = [];
    for (const param of searchParams.keys()) {
      requestParams.push(param);
    }

    for (const param of terms[request.method].params!) {
      if (!requestParams.includes(param)) {
        return {
          error: {
            message: `param '${param}' is required to process the request`,
            status: Status.BadRequest,
          },
        };
      }
    }
  }

  // Validate the headers if defined in the terms.
  if (
    terms[request.method].headers &&
    terms[request.method].headers!.length > 0
  ) {
    // Collect the headers into an array.
    const requestHeaderKeys = [];
    for (const header of request.headers.keys()) {
      requestHeaderKeys.push(header);
    }

    // Loop through the headers defined in the terms and check if they
    // are present in the request.
    for (const header of terms[request.method].headers!) {
      if (!requestHeaderKeys.includes(header.toLowerCase())) {
        return {
          error: {
            message: `header '${header}' not available`,
            status: Status.BadRequest,
          },
        };
      }
    }
  }

  // Validate the body of the request if defined in the terms.
  if (terms[request.method].body && terms[request.method].body!.length > 0) {
    const requestBody = await request.json();
    const bodyKeys = Object.keys(requestBody);
    for (const key of terms[request.method].body!) {
      if (!bodyKeys.includes(key)) {
        return {
          error: {
            message: `field '${key}' is not available in the body`,
            status: Status.BadRequest,
          },
        };
      }
    }

    // We store and return the body as once the request.json() is called
    // the user cannot call request.json() again.
    body = requestBody;
  }

  return { body };
}
