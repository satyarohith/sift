import { serve } from "../mod.ts";

serve({
  "/": () => new Response("Hello World!"),
  "/blog/:slug": (_request, _info, params) => {
    return new Response(`You visited /${params?.slug}`);
  },
  404: () => new Response("Custom 404", { status: 404 }),
});
