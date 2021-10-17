/** @jsx h */
import { h, jsx, serve } from "../mod.ts";

const App = () => (
  <div>
    <h1>Hello world!</h1>
  </div>
);

serve({
  "/": () => jsx(<App />),
});
