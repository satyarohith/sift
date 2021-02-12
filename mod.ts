import {
  match,
  pathToRegexp,
} from "https://deno.land/x/path_to_regexp@v6.2.0/index.ts";
import { json, jsx, validateRequest } from "./util.ts";

interface ResponseCache {
  [path: string]: Response;
}

export interface PathParams {
  [key: string]: string | string[];
}

export type Handler = (
  request: Request,
  params?: PathParams,
) => Response | Promise<Response>;

export interface Routes {
  [path: string]: Handler;
}

function serve(routes: Routes): void {
  routes = { 404: defaultNotFoundPage, ...routes };
  // deno-lint-ignore no-explicit-any
  addEventListener("fetch", (event: any) => {
    event.respondWith(handleRequest(event.request, routes));
  });
}

const responseCache: ResponseCache = {};
async function handleRequest(
  request: Request,
  routes: Routes,
): Promise<Response> {
  const { search, pathname } = new URL(request.url);
  try {
    if (!(responseCache["404"] instanceof Response)) {
      let NotFoundResponse = await routes[404](request);
      if (!(NotFoundResponse instanceof Response)) {
        responseCache["404"] = jsx(NotFoundResponse, { status: 404 });
      }
    }

    const startTime = Date.now();
    let response = responseCache["404"].clone();
    response.headers.set("from-function-cache", "true");
    for (const route of Object.keys(routes)) {
      if (pathToRegexp(route).test(pathname)) {
        const getParams = match(route);
        const { params = {} } = getParams(pathname) as {
          params: { [key: string]: string };
        };
        try {
          response = await routes[route](request, params);
        } catch (error) {
          response = json({ error: error.message }, { status: 500 });
        }
        if (!(response instanceof Response)) {
          response = jsx(response);
        }
        break;
      }
    }

    // method path+params timeTaken status
    console.log(
      `${request.method} ${pathname + search} ${
        response.headers.has("from-function-cache")
          ? String.fromCodePoint(0x26a1)
          : ""
      }${Date.now() - startTime}ms ${response.status}`,
    );

    return response;
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
}

/** Caches the response - it's really dumb and only works for static assets.
 *
 * @param {Function} handler
 */
function cache(handler: Handler) {
  return async (request: Request, params?: PathParams): Promise<Response> => {
    const { pathname } = new URL(request.url);
    if (responseCache[pathname]) {
      const response = responseCache[pathname].clone();
      response.headers.set("from-function-cache", "true");
      return response;
    }

    let response = await handler(request, params);
    if (!(response instanceof Response)) {
      response = jsx(response);
    }
    responseCache[pathname] = response.clone();
    return response;
  };
}

function defaultNotFoundPage() {
  return new Response("<h1 align=center>page not found</h1>", {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * This function serves a file or files inside a directory.
 *
 * All subsequent requests are served from in-memory cache.
 *
 * TODO(@satyarohith): add examples to show usage.
 */
function serveStatic(
  relativePath: string,
  config: {
    baseUrl: string;
    intervene?: (response: Response) => Promise<Response> | Response;
  },
): Handler {
  return cache(
    async (request: Request, params?: PathParams): Promise<Response> => {
      let filePath = relativePath;
      if (params && params.filename) {
        if (Array.isArray(params.filename)) {
          params.filename = params.filename.join("/");
        }
        filePath = relativePath.endsWith("/")
          ? relativePath + params.filename
          : relativePath + "/" + params.filename;
      }

      const fileUrl = new URL(filePath, config.baseUrl).toString();
      let response = await fetch(new Request(fileUrl, request));
      if (typeof config.intervene === "function") {
        response = await config.intervene(response);
      }

      if (response.status == 404) {
        return defaultNotFoundPage();
      }

      return response;
    },
  );
}

export { json, jsx, serve, serveStatic, validateRequest };
export * from "https://x.lcas.dev/preact@10.5.7/mod.js";
