import {
  match,
  pathToRegexp,
} from "https://deno.land/x/path_to_regexp@v6.2.0/index.ts";
import { inMemoryCache } from "https://deno.land/x/httpcache@0.1.2/in_memory.ts";
import render from "https://cdn.skypack.dev/preact-render-to-string@v5.1.12";
import {
  Status,
  STATUS_TEXT,
} from "https://deno.land/std@0.85.0/http/http_status.ts";

const cache = inMemoryCache(10);

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

export function serve(routes: Routes): void {
  routes = { 404: defaultNotFoundPage, ...routes };
  // deno-lint-ignore no-explicit-any
  addEventListener("fetch", (event: any) => {
    event.respondWith(handleRequest(event.request, routes));
  });
}

async function handleRequest(
  request: Request,
  routes: Routes,
): Promise<Response> {
  const { search, pathname } = new URL(request.url);

  try {
    const startTime = Date.now();
    let response = await cache.match(request);
    if (response === undefined) {
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
    } else {
      response.headers.set("from-function-cache", "true");
    }

    // return not found page if no handler is found.
    if (response === undefined) {
      response = await routes["404"](request);
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
export function serveStatic(
  relativePath: string,
  config: {
    baseUrl: string;
    intervene?: (response: Response) => Promise<Response> | Response;
  },
): Handler {
  return async (request: Request, params?: PathParams): Promise<Response> => {
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
    let response = await cache.match(request);

    if (response === undefined) {
      response = await fetch(new Request(fileUrl, request));
      if (typeof config.intervene === "function") {
        response = await config.intervene(response);
      }

      if (response.status == 404) {
        return defaultNotFoundPage();
      }

      await cache.put(request, response);
    } else {
      response.headers.set("from-function-cache", "true");
    }

    return response;
  };
}

export function json(
  jsobj: { [key: string]: unknown },
  init?: ResponseInit,
): Response {
  return new Response(JSON.stringify(jsobj) + "\n", {
    statusText: init?.statusText ?? STATUS_TEXT.get(init?.status ?? Status.OK),
    status: init?.status ?? Status.OK,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...init?.headers,
    },
  });
}

export function jsx(jsx: unknown, init?: ResponseInit): Response {
  return new Response(render(jsx), {
    statusText: init?.statusText ?? STATUS_TEXT.get(init?.status ?? Status.OK),
    status: init?.status ?? Status.OK,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...init?.headers,
    },
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

export * from "https://x.lcas.dev/preact@10.5.7/mod.js";
