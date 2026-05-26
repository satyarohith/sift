import { serve, serveStatic } from "../mod.ts";

serve({
  "/": () => new Response("Hello World!"),
  "/blog/:slug": (_request, _info, params) => {
    return new Response(`You visited /${params?.slug}`);
  },
  // Serve a single file.
  "/about": serveStatic("../readme.md", { baseUrl: import.meta.url }),
  // Serve a directory. The route must end with `:filename+`.
  "/static/:filename+": serveStatic("../", { baseUrl: import.meta.url }),
  404: () => new Response("Custom 404", { status: 404 }),
});
