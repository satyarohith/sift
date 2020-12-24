# Sift

**WIP**

## Usage

The main function of the library is `serve`. It accepts an object of routes with the route being the key and and the route handler being the value. The route handler is provided a `Request` object and it can return a `Response` object or JSX.

```js
import { serve } from "https://deno.land/x/sift/mod.js";

serve({
  "/": (request) => new Response("Hello world")
});
```
