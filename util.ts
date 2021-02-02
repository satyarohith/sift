import { render } from "https://x.lcas.dev/preact@10.5.7/ssr.js";
import {
  Status,
  STATUS_TEXT,
} from "https://deno.land/std@0.85.0/http/http_status.ts";

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
