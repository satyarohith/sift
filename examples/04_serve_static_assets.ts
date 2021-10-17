import { serve, serveStatic } from "../mod.ts";

serve({
  "/": (_request) => new Response("Hello World!"),
  "/blog/:slug": (_request, params) => {
    return new Response(`You visited /${params.slug}`);
  },
  // Use Deno.readFile internally. This ignores
  // the baseUrl option and you can only serve
  // content that's hosted on your repository.
  "/static/readme.md": serveStatic("../readme.md", {
    baseUrl: import.meta.url,
  }),
  // The path should end with `filename+` for serveStatic to
  // construct correct URL to the requested resource.
  // The below path will serve the root of the repository.
  "/static/:filename+": serveStatic("../", {
    baseUrl: import.meta.url,
  }),
  404: (_request) => new Response("Custom 404"),
});
