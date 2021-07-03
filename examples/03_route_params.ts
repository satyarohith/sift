import { serve } from "../mod.ts";

serve({
  "/": (_request) => new Response("Hello World!"),
  "/blog/:slug": (_request, params) => {
    return new Response(`You visited /${params.slug}`);
  },
  404: (_request) => new Response("Custom 404"),
});
