/// <reference lib="dom.iterable" />
import {
  match,
  pathToRegexp,
} from "https://deno.land/x/path_to_regexp@v6.2.0/index.ts";
import {
  Status,
  STATUS_TEXT,
} from "https://deno.land/std@0.100.0/http/http_status.ts";
import { inMemoryCache } from "https://deno.land/x/httpcache@0.1.2/in_memory.ts";
import { render } from "https://x.lcas.dev/preact@10.5.12/ssr.js";
import {
  contentType as getContentType,
  lookup,
} from "https://raw.githubusercontent.com/usesift/media_types/34656bf398c81f2687fa5010e56844dac4e7a2e9/mod.ts";
import type { VNode } from "https://x.lcas.dev/preact@10.5.12/mod.d.ts";
import { listenAndServe } from "https://deno.land/std@0.111.0/http/server.ts";

export * from "https://x.lcas.dev/preact@10.5.12/mod.js";

const globalCache = inMemoryCache(20);

let routes: Routes = { 404: defaultNotFoundPage };

export interface PathParams {
  [key: string]: string | string[];
}

export type Handler = (
  request: Request,
  params: PathParams,
) => Response | Promise<Response>;

export interface Routes {
  [path: string]: Handler;
}

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
export function serve(userRoutes: Routes): void {
  routes = { ...routes, ...userRoutes };
  listenAndServe(":8000", (req: Request) => {
    return handleRequest(req, routes);
  });
  const isDeploy = Deno.env.get("DENO_REGION");
  if (!isDeploy) {
    console.log("Listening at http://localhost:8000/");
  }
}

function newResponse(
  response: Response,
  headers: HeadersInit,
): Response {
  // Clone it to make it mutable.
  response = new Response(response.body, response);
  const newHeaders = headers instanceof Headers
    ? headers
    : new Headers(headers);

  // GitHub provides a CSP header which embeding
  // content. This is a bad and temperory solution
  // until deploy has a solid static assets offering.
  if (response.headers.has("x-github-request-id")) {
    response.headers.delete("content-security-policy");
  }

  for (const [key, value] of newHeaders) {
    response.headers.set(key, value);
  }

  return response;
}

async function handleRequest(
  request: Request,
  routes: Routes,
): Promise<Response> {
  const { search, pathname } = new URL(request.url);

  try {
    const startTime = Date.now();
    let response = await globalCache.match(request);
    if (typeof response === "undefined") {
      for (const route of Object.keys(routes)) {
        if (pathToRegexp(route).test(pathname)) {
          const getParams = match(route);
          const { params = {} } = getParams(pathname) as {
            params: { [key: string]: string };
          };
          try {
            response = await routes[route](request, params);
          } catch (error) {
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
      response = newResponse(response, {
        "x-function-cache-hit": "true",
      });
    }

    // return not found page if no handler is found.
    if (response === undefined) {
      response = await routes["404"](request, {});
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
  return async (request: Request, params: PathParams): Promise<Response> => {
    // Construct URL for the request resource.
    let filePath = relativePath;
    if (params && params.filename) {
      if (Array.isArray(params.filename)) {
        params.filename = params.filename.join("/");
      }
      filePath = relativePath.endsWith("/")
        ? relativePath + params.filename
        : relativePath + "/" + params.filename;
    }
    const fileUrl = new URL(filePath, baseUrl);

    let response: Response | undefined;
    if (cache) {
      response = await globalCache.match(request);
    }

    if (typeof response === "undefined") {
      const body = await Deno.readFile(fileUrl);
      response = new Response(new Blob([body]));

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
      return routes[404](request, {});
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
  return new Response(JSON.stringify(jsobj) + "\n", {
    statusText: init?.statusText ?? STATUS_TEXT.get(init?.status ?? Status.OK),
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

  return new Response(render(jsx), {
    statusText: init?.statusText ?? STATUS_TEXT.get(init?.status ?? Status.OK),
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
