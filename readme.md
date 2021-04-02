# Sift

Sift is a routing and utility library for [Deno Deploy][deploy].

[deploy]: https://deno.com/deploy

## Usage

### `serve()`

serve accepts an object literal that where the keys are routes in path

```js
import { serve } from "https://deno.land/x/sift/mod.ts";

serve({
  "/": () => new Response("hello world"),
  "/blog/:slug": (request, { slug }) => {
    const post = `Hello, you visited ${slug}!`;
    return new Response(post);
  },
  404: () => new Response("not found"),
});
```

### `jsx()`

render with `preact` to create html Response

```js
import {
  jsx,
  serve,
} from "https://deno.land/x/sift@0.1.7/mod.ts";
import { html } from "https://cdn.skypack.dev/htm@v3.0.4/preact/standalone.module.js";

const App = html`
  <div>
    <h1>Hello world!</h1>
  </div>
`;

serve({
  "/": (_request: Request) => jsx(App),
});
```
