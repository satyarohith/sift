import { pathToRegexp } from "https://deno.land/x/path_to_regexp@v6.2.0/index.ts";
import { render } from "https://x.lcas.dev/preact@10.5.7/ssr.js";
export * from "https://x.lcas.dev/preact@10.5.7/mod.js";

const CACHE = {};

function defaultNotFoundPage(request) {
  return new Response("page not found", {
    status: 404,
    headers: { "Content-Type": "text/html" },
  });
}

function renderJsx(response) {
  if (!(response instanceof Response)) {
    return new Response(render(response), {
      status: 200,
      headers: {
        "Content-Type": "text/html",
      },
    });
  }

  return response;
}

async function handleRequest(request, routes) {
  try {
    let response;
    const { search, pathname } = new URL(request.url);

    const startTime = Date.now();
    for (const route of Object.keys(routes)) {
      if (pathToRegexp(route).test(pathname)) {
        response = renderJsx(await routes[route](request));
        break;
      }
    }

    if (!response) {
      response = renderJsx(await routes["404"](request));
      response.status = 404;
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
function cache(handler) {
  return async (request) => {
    const { pathname } = new URL(request.url);
    if (CACHE[pathname]) {
      const response = CACHE[pathname].clone();
      response.headers.set("from-function-cache", "true");
      return response;
    }

    const response = renderJsx(await handler(request));
    CACHE[pathname] = response.clone();
    return response;
  };
}

/**
 * Redirect to the provided url.
 * @param {string} url The destination path.
 * @param {number} status Redirect code (300-399).
 */
export function redirect(url, status = 301) {
  return (request) => Response.redirect(url, status);
}

/**
 * Proxies requests to a different domain.
 *
 * The path of the src site should be same as the destination site for now.
 * @param {string} hostname The domain name.
 */
export function proxy(hostname) {
  return (request) => {
    const url = new URL(request.url);
    url.port = "443";
    url.protocol = "https";
    url.hostname = hostname;
    request.url = url.toString();
    return fetch(request);
  };
}

/**
 * Static assets handler.
 *
 * All static assets are cached in memory on first request.
 * @param {string} baseUrl The base url (mostly `import.meta.url`).
 * @param {string} relativeDir Path to the directory where static assets are stored (defaults to `./static/`).
 */
export function serveStaticAssets(baseUrl, relativeDir = "./static/") {
  return cache((request) => {
    const { pathname } = new URL(request.url);
    const STATIC = new URL(relativeDir, baseUrl);
    const url = new URL("." + pathname.substring(7), STATIC).toString();
    request.url = url;
    return fetch(request);
  });
}

export function serve(routes) {
  routes = { 404: defaultNotFoundPage, ...routes };

  addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event.request, routes));
  });
}
