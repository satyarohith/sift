import {
  match,
  pathToRegexp,
} from "https://deno.land/x/path_to_regexp@v6.2.0/index.ts";
import { json, jsx } from "./util.ts";

interface ResponseCache {
  [path: string]: Response;
}

export type Handler = (
  request: Request,
  params?: { [key: string]: string },
) => Response | Promise<Response>;

export interface Routes {
  [path: string]: Handler;
}

function serve(routes: Routes) {
  routes = { 404: defaultNotFoundPage, ...routes };
  // deno-lint-ignore no-explicit-any
  addEventListener("fetch", (event: any) => {
    event.respondWith(handleRequest(event.request, routes));
  });
}

/**
 * Static assets handler.
 *
 * All static assets are cached in memory on first request.
 * @param baseUrl The base url (mostly `import.meta.url`).
 * @param relativeDir Path to the directory where static assets are stored (defaults to `./static/`).
 */
function serveStaticAssets(
  baseUrl: string,
  relativeDir: string = "./static/",
): (request: Request) => Promise<Response> {
  return cache((request: Request, params?: { [key: string]: string }) => {
    const { pathname } = new URL(request.url);
    const STATIC = new URL(relativeDir, baseUrl);
    const url = new URL("." + pathname.substring(7), STATIC).toString();
    return fetch(new Request(url, request));
  });
}

const responseCache: ResponseCache = {};
async function handleRequest(request: Request, routes: Routes) {
  const { search, pathname } = new URL(request.url);
  try {
    if (!responseCache["404"]) {
      responseCache["404"] = await routes[404](request);
    }

    const startTime = Date.now();
    let response = responseCache["404"].clone();
    response.headers.set("from-function-cache", "true");
    for (const route of Object.keys(routes)) {
      if (pathToRegexp(route).test(pathname)) {
        const getParams = match(route);
        const { params = {} } = getParams(pathname) as any;
        response = await routes[route](request, params);
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
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/** Caches the response - it's really dumb and only works for static assets.
 *
 * @param {Function} handler
 */
function cache(handler: Handler) {
  return async (request: Request) => {
    const { pathname } = new URL(request.url);
    if (responseCache[pathname]) {
      const response = responseCache[pathname].clone();
      response.headers.set("from-function-cache", "true");
      return response;
    }

    let response = await handler(request);
    if (!(response instanceof Response)) {
      response = jsx(response);
    }
    responseCache[pathname] = response.clone();
    return response;
  };
}

function defaultNotFoundPage() {
  return new Response("page not found", {
    status: 404,
    headers: { "Content-Type": "text/html" },
  });
}

export { json, jsx, serve, serveStaticAssets };
export * from "https://x.lcas.dev/preact@10.5.7/mod.js";
