import { serve, Status, STATUS_TEXT } from "./mod.ts";

serve({
  "/api": () => new Response("WIP"),
  404: () =>
    new Response(STATUS_TEXT.get(Status.BadRequest), {
      status: Status.BadRequest,
    }),
});
