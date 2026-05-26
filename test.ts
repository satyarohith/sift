import { assertEquals } from "@std/assert";
import { h, json, serve, validateRequest } from "./mod.ts";

async function withServer(
  routes: Parameters<typeof serve>[0],
  test: (base: string) => Promise<void>,
): Promise<void> {
  const server = serve(routes, { port: 0, onListen: () => {} });
  const { port } = server.addr as Deno.NetAddr;
  try {
    await test(`http://localhost:${port}`);
  } finally {
    await server.shutdown();
  }
}

Deno.test("serve() routes requests", async () => {
  await withServer({
    "/": () => new Response("home"),
    "/blog/:slug": (_req, _info, params) => new Response(params?.slug),
  }, async (base) => {
    assertEquals(await (await fetch(`${base}/`)).text(), "home");
    assertEquals(await (await fetch(`${base}/blog/hello`)).text(), "hello");
  });
});

Deno.test("serve() falls back to the 404 handler", async () => {
  await withServer({
    "/": () => new Response("home"),
    404: () => new Response("custom", { status: 404 }),
  }, async (base) => {
    const response = await fetch(`${base}/missing`);
    assertEquals(response.status, 404);
    assertEquals(await response.text(), "custom");
  });
});

Deno.test("serve() renders returned JSX elements", async () => {
  await withServer({
    "/": () => h("h1", null, "hi"),
  }, async (base) => {
    const response = await fetch(`${base}/`);
    assertEquals(
      response.headers.get("content-type"),
      "text/html; charset=utf-8",
    );
    assertEquals(await response.text(), "<h1>hi</h1>");
  });
});

Deno.test("json() sets the content type", () => {
  assertEquals(
    json({}).headers.get("content-type"),
    "application/json; charset=utf-8",
  );
});

Deno.test("validateRequest() rejects disallowed methods", async () => {
  const request = new Request("https://example.com", { method: "POST" });
  const { error } = await validateRequest(request, { GET: {} });
  assertEquals(error?.message, "method POST is not allowed for the URL");
  assertEquals(error?.status, 405);
});

Deno.test("validateRequest() checks required headers", async () => {
  const request = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token" },
  });
  const { error } = await validateRequest(request, {
    POST: { headers: ["Authorization", "Content-Type"] },
  });
  assertEquals(error?.message, "header 'Content-Type' not available");
});

Deno.test("validateRequest() checks required query params", async () => {
  const request = new Request("https://example.com?name=satya", {
    method: "GET",
  });
  const { error } = await validateRequest(request, {
    GET: { params: ["name", "age"] },
  });
  assertEquals(
    error?.message,
    "param 'age' is required to process the request",
  );
});

Deno.test("validateRequest() checks and returns the body", async () => {
  const request = new Request("https://example.com", {
    method: "POST",
    body: JSON.stringify({ name: "satya", age: 98 }),
  });
  const { error, body } = await validateRequest(request, {
    POST: { body: ["name", "age"] },
  });
  assertEquals(error, undefined);
  assertEquals(body, { name: "satya", age: 98 });
});

const headerCases: { name: string; headers: HeadersInit }[] = [
  { name: "Headers", headers: new Headers({ "x-custom": "1" }) },
  { name: "entries", headers: [["x-custom", "1"]] },
  { name: "record", headers: { "x-custom": "1" } },
];

for (const { name, headers } of headerCases) {
  Deno.test(`json() merges ${name} headers`, () => {
    assertEquals(json(null, { headers }).headers.get("x-custom"), "1");
  });
}
