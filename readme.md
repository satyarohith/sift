# Sift

Sift is a routing and utility library for
[Deno Deploy](https://deno.com/deploy).

![ci](https://github.com/satyarohith/sift/actions/workflows/ci.yml/badge.svg)
[![deno doc](https://doc.deno.land/badge.svg)](https://doc.deno.land/https/deno.land/x/sift@0.3.0/mod.ts)

## Usage

The documentation below briefly explains the common usage of the functions. You
can visit [deno doc](https://doc.deno.land/https/deno.land/x/sift@0.3.0/mod.ts)
site to learn more about the API.

Sift imports some functions from preact which causes type conflicts when
running using `deployctl`. You can avoid these conflicts by limiting the types
to `ns,fetchevent`.

```sh
deployctl run --libs=ns,fetchevent script.ts
```

### `serve()`

`serve()` is the routing funciton. It accepts an object literal with path
strings as keys and their corresponding route handlers as values. The path
string is processed using
[`path-to-regexp`](https://github.com/pillarjs/path-to-regexp/tree/v6.2.0) and
when the requested path matches the regex, the corresponding handler will be
invoked.

```js
import { serve } from "https://deno.land/x/sift@0.3.0/mod.ts";

serve({
  "/": () => new Response("hello world"),
  "/blog/:slug": (request, params) => {
    const post = `Hello, you visited ${params.slug}!`;
    return new Response(post);
  },
  // The route handler of 404 will be invoked when a route handler
  // for the requested path is not found.
  404: () => new Response("not found"),
});
```

### `serveStatic()`

Serve static files hosted on the internet or relative to your source code. It
does so by acting as a proxy.

By default, up to 20 static assets that are less than 10MB are cached. You can
disable caching by setting `cache: false` in the options object.

If you're serving a directory, it is required that the path string end with
`:filename+` as serveStatic uses this param to construct the absolute URL to the
requested resource.

```js
import { serve, serveStatic } from "https://deno.land/x/sift@0.3.0/mod.ts";

serve({
  // You can serve a single file.
  "/": serveStatic("public/index.html", { baseUrl: import.meta.url }),
  // Or a directory of files.
  "/:filename+": serveStatic("public", { baseUrl: import.meta.url }),
  // Serve files hosted on the internet.
  // The URL to the resouce would become https://yourbucket.aws.com/profile.png
  "/profile.png": serveStatic("profile.png", {
    baseUrl: "https://yourbucket.aws.com",
  }),
  // You can modify the fetched response before returning to the request
  // by using the intervene option.
  "/style.css": serveStatic("style.css", {
    baseUrl: import.meta.url,
    // The intervene function is called with the request as first argument and
    // the fetched response as the second argument and it should return a
    // response as a result.
    intervene: (request, response) => {
      response.headers.set("content-type", "text/css; charset=utf-8");
      return response;
    },
  }),
});
```

### `json()`

Converts an object literal to a JSON string and creates a `Response` instance
with `application/json` as the `content-type`.

```js
import { json, serve } from "https://deno.land/x/sift@0.3.0/mod.ts";

serve({
  "/": () => json({ message: "hello world" }),
  "api/create": () => json({ message: "created" }, { status: 201 }),
});
```

### `jsx()`

Renders JSX components to HTML string and creates a `Response` instance with
`text/html` as the `content-type`.

When using this function, it is important that your file extension is `.jsx` or
`.tsx` for Deno Deploy to transform you code and you've the `h` function
imported.

```jsx
import { h, jsx, serve } from "https://deno.land/x/sift@0.3.0/mod.ts";

const App = () => (
  <div>
    <h1>Hello world!</h1>
  </div>
);

const NotFound = () => (
  <div>
    <h1>Page not found</h1>
  </div>
);

serve({
  "/": () => jsx(<App />),
  404: () => jsx(<NotFound />, { status: 404 }),
});
```
