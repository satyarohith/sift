import { flare } from "../mod.ts";

export default flare({
  "/": () => new Response("Hello World!"),
  404: () => new Response("Not Found"),
});
