# Sift

A small routing and utility library for building HTTP servers on Deno.

[![JSR](https://jsr.io/badges/@satya/sift)](https://jsr.io/@satya/sift)
![ci](https://github.com/satyarohith/sift/actions/workflows/ci.yml/badge.svg)

## Install

```sh
deno add jsr:@satya/sift
```

Or import it directly:

```ts
import { serve } from "jsr:@satya/sift";
```

## `serve()`

`serve()` maps URL patterns to handlers and starts a server. Paths are matched
with [URLPattern]; the matched groups are passed to the handler as the third
argument. The `404` route handles requests that nothing else matches.

```ts
import { serve } from "@satya/sift";

serve({
  "/": () => new Response("hello world"),
  "/blog/:slug": (_request, _info, params) => {
    return new Response(`you visited ${params?.slug}`);
  },
  404: () => new Response("not found", { status: 404 }),
});
```

A handler may return a `Response` or a JSX element. `serve()` returns the
`Deno.HttpServer`, so you can `await server.shutdown()` when you're done.

## `serveStatic()`

Serve files from disk, resolved relative to `baseUrl` (usually
`import.meta.url`). To serve a directory, end the route with `:filename+`. Files
under 10MB are cached in memory unless you pass `cache: false`.

```ts
import { serve, serveStatic } from "@satya/sift";

serve({
  // A single file.
  "/": serveStatic("public/index.html", { baseUrl: import.meta.url }),
  // A directory of files.
  "/assets/:filename+": serveStatic("public", { baseUrl: import.meta.url }),
  // Modify the response before it's sent.
  "/style.css": serveStatic("style.css", {
    baseUrl: import.meta.url,
    intervene: (_request, response) => response,
  }),
});
```

## `json()`

Serialize a value to JSON and return it as an `application/json` response.

```ts
import { json, serve } from "@satya/sift";

serve({
  "/": () => json({ message: "hello world" }),
  "/create": () => json({ message: "created" }, { status: 201 }),
});
```

## `jsx()`

Render a JSX element to HTML and return it as a `text/html` response. Configure
the JSX runtime in your `deno.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "preact"
  }
}
```

```tsx
import { jsx, serve } from "@satya/sift";

const App = () => <h1>Hello world!</h1>;

serve({
  "/": () => jsx(<App />),
  404: () => jsx(<h1>Page not found</h1>, { status: 404 }),
});
```

## `validateRequest()`

Check that a request uses an allowed method and includes the named headers,
query params and body fields. The parsed body is returned so you don't have to
read it again.

```ts
import { serve, validateRequest } from "@satya/sift";

serve({
  "/": async (request) => {
    const { error, body } = await validateRequest(request, {
      POST: { body: ["name"] },
    });
    if (error) return new Response(error.message, { status: error.status });
    return new Response(`hello ${body?.name}`);
  },
});
```

## License

[MIT](./LICENSE)

[URLPattern]: https://developer.mozilla.org/en-US/docs/Web/API/URLPattern
