import { serve, serveStatic } from "../mod.ts";

serve({
  "/": (_request) => new Response("Hello World!"),
  "/blog/:slug": (_request, params) => {
    return new Response(`You visited /${params?.slug}`);
  },
  "/about": serveStatic("../readme.md", {
    baseUrl: import.meta.url,
  }),
  // The path should end with `filename+` for serveStatic to
  // construct correct URL to the requested resource.
  // The below path will serve the root of the repository.
  "/static/:filename+": serveStatic("../", {
    baseUrl: import.meta.url,
  }),
  404: (_request) => new Response("Custom 404", { status: 404 }),
});
