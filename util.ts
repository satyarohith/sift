import { render } from "https://x.lcas.dev/preact@10.5.7/ssr.js";

export function json(jsobj: { [key: string]: any }, init?: ResponseInit) {
  return new Response(JSON.stringify(jsobj), {
    statusText: init?.statusText,
    status: init?.status ?? 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...init?.headers,
    },
  });
}

export function jsx(jsx: unknown, init?: ResponseInit) {
  return new Response(render(jsx), {
    statusText: init?.statusText,
    status: init?.status ?? 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...init?.headers,
    },
  });
}
