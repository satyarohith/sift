import { serve } from "../mod.ts";

serve({
  "/": (_request) => new Response("Hello World!"),
  404: (_request) => new Response("Custom 404"),
});
