import { assertEquals } from "https://deno.land/std@0.85.0/testing/asserts.ts";
import { Status } from "https://deno.land/std@0.85.0/http/http_status.ts";
import { startServer, stopServer } from "./test_helper.ts";
import { json, serve, serveStatic, validateRequest } from "./mod.ts";

Deno.test("serve() invokes appropriate route handler", async () => {
  startServer(8910);
  serve({
    "/": () => new Response("hello world"),
  });
  const response = await fetch("http://localhost:8910");
  const body = await response.text();
  assertEquals(body, "hello world");
  stopServer();
});

Deno.test("serve() uses custom 404 when provided", async () => {
  startServer(8910);
  serve({
    404: () => new Response("custom not found page"),
  });
  const response = await fetch("http://localhost:8910/_knowhere_");
  const body = await response.text();
  assertEquals(body, "custom not found page");
  stopServer();
});

Deno.test("serve() passes params correctly to handler", async () => {
  startServer(8910);
  serve({
    "/blog/:slug?": (request, params) => {
      return json({ params });
    },
  });
  const response = await fetch("http://localhost:8910/blog/hello-world");
  const body = await response.json();
  assertEquals(body, { params: { slug: "hello-world" } });
  stopServer();
});

Deno.test(
  "serveStatic() serves cache content after first request",
  async () => {
    startServer(8910);
    serve({
      "/static/:filename+": serveStatic(".", { baseUrl: import.meta.url }),
    });
    const response1 = await fetch("http://localhost:8910/static/readme.md");
    let _body = await response1.arrayBuffer();
    assertEquals(response1.headers.get("x-function-cache-hit"), null);
    const response2 = await fetch("http://localhost:8910/static/readme.md");
    _body = await response2.arrayBuffer();
    assertEquals(response2.status, 200);
    assertEquals(response2.headers.get("x-function-cache-hit"), "true");
    stopServer();
  },
);

Deno.test("json() response has correct content-type", () => {
  const response = json({});
  assertEquals(
    response.headers.get("content-type"),
    "application/json; charset=utf-8",
  );
});

Deno.test("validateRequest() validates methods", async () => {
  const request = new Request("https://example.com", {
    method: "POST",
  });

  const { error } = await validateRequest(request, {
    GET: {},
  });

  assertEquals(error!.message, "method POST is not allowed for the URL");
  assertEquals(error!.status, Status.MethodNotAllowed);
});

Deno.test("validateRequest() validates headers", async () => {
  const request = new Request("https://example.com", {
    method: "POST",
    headers: {
      Authorization: "Bearer token",
    },
  });

  const { error } = await validateRequest(request, {
    POST: {
      headers: ["Authorization", "Content-Type"],
    },
  });

  assertEquals(error!.message, "header 'Content-Type' not available");
  assertEquals(error!.status, Status.BadRequest);
});

Deno.test("validateRequest() validates query strings", async () => {
  const request = new Request("https://example.com?name=Satya", {
    method: "GET",
  });

  const { error } = await validateRequest(request, {
    GET: {
      params: ["name", "age"],
    },
  });

  assertEquals(
    error!.message,
    "param 'age' is required to process the request",
  );
  assertEquals(error!.status, Status.BadRequest);
});

Deno.test("validateRequest() validates body of POST request", async () => {
  const request = new Request("https://example.com", {
    method: "POST",
    body: JSON.stringify({
      name: "Satya",
    }),
  });

  const { error, body } = await validateRequest(request, {
    POST: {
      body: ["name", "age"],
    },
  });

  assertEquals(body, undefined);
  assertEquals(error!.message, "field 'age' is not available in the body");
});

Deno.test("validateRequest() populates body as per schema", async () => {
  const request = new Request("https://example.com", {
    method: "POST",
    body: JSON.stringify({
      name: "Satya",
      age: 98,
    }),
  });

  const { error, body } = await validateRequest(request, {
    POST: {
      body: ["name", "age"],
    },
  });

  assertEquals(error, undefined);
  assertEquals(body, { name: "Satya", age: 98 });
});
