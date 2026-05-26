import { serve } from "../mod.ts";

serve({
  "/": () => new Response("Hello World!"),
  404: () => new Response("Custom 404", { status: 404 }),
});
