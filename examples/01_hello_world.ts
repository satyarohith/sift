import { serve } from "../mod.ts";

serve({
  "/": (_request) => new Response("Hello World!"),
});
