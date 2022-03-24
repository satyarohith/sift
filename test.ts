import { assertEquals } from "https://deno.land/std@0.126.0/testing/asserts.ts";
import { Status } from "https://deno.land/std@0.126.0/http/http_status.ts";
import { json, jsx, validateRequest, VNode } from "./mod.ts";
import {
  createWorker,
  handlers,
} from "https://deno.land/x/dectyl@0.10.7/mod.ts";

Deno.test("01_hello_world.ts", async () => {
  const script = await createWorker(
    "./examples/01_hello_world.ts",
  );
  await script.start();

  const [response] = await script.fetch("/");
  assertEquals(await response.text(), "Hello World!");

  script.close();
});

Deno.test("01_hello_world.tsx", async () => {
  const script = await createWorker(
    "./examples/01_hello_world.tsx",
  );
  await script.start();

  const [response] = await script.fetch("/");
  assertEquals(await response.text(), "<div><h1>Hello world!</h1></div>");

  script.close();
});

Deno.test("02_custom_404.ts", async () => {
  const script = await createWorker(
    "./examples/02_custom_404.ts",
  );
  await script.start();

  const [response] = await script.fetch("/this_route_doesnt_exist");
  assertEquals(await response.text(), "Custom 404");

  script.close();
});

Deno.test("03_route_params", async () => {
  const script = await createWorker(
    "./examples/03_route_params.ts",
  );
  await script.start();

  const [response] = await script.fetch("/blog/hello-world");
  assertEquals(await response.text(), "You visited /hello-world");

  script.close();
});

Deno.test({
  name: "04_serve_static_assets",
  fn: async () => {
    const script = await createWorker(
      "./examples/04_serve_static_assets.ts",
      {
        fetchHandler: handlers.fileFetchHandler,
      },
    );
    await script.start();

    // Test /static/* which serves a directory.
    const expected = await Deno.readTextFile("./readme.md");
    const [response] = await script.fetch("/static/readme.md");
    const text = await response.text();
    assertEquals(text, expected);
    assertEquals(response.headers.get("x-function-cache-hit"), null);
    assertEquals(
      response.headers.get("content-type"),
      "text/markdown; charset=utf-8",
    );

    // Test /about which serves a single file.
    const [response2] = await script.fetch("/about");
    const text2 = await response2.text();
    assertEquals(text2, expected);
    assertEquals(response.headers.get("x-function-cache-hit"), null);
    assertEquals(
      response.headers.get("content-type"),
      "text/markdown; charset=utf-8",
    );

    // Test /static/missing which should serve a 404.
    const expectedMissing = "Custom 404";
    const [response3] = await script.fetch("/static/missing");
    const text3 = await response3.text();
    assertEquals(text3, expectedMissing);
    assertEquals(response3.headers.get("x-function-cache-hit"), null);
    assertEquals(
      response3.headers.get("content-type"),
      "text/plain;charset=UTF-8",
    );
    assertEquals(response3.status, 404);

    script.close();
  },
});

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

const headersInitCases: {
  description: string;
  headers: HeadersInit;
  entries: [string, string][];
}[] = [
  {
    description: "merges Headers",
    headers: new Headers({
      "content-type": "type/subtype",
      "custom-header-1": "1",
      "custom-header-2": "2",
    }),
    entries: [
      ["content-type", "type/subtype"],
      ["custom-header-1", "1"],
      ["custom-header-2", "2"],
    ],
  },
  {
    description: "merges [string, string][]",
    headers: [
      ["content-type", "type/subtype"],
      ["custom-header-1", "1"],
      ["custom-header-2", "2"],
    ],
    entries: [
      ["content-type", "type/subtype"],
      ["custom-header-1", "1"],
      ["custom-header-2", "2"],
    ],
  },
  {
    description: "merges Record<string, string>",
    headers: {
      "content-type": "type/subtype",
      "custom-header-1": "1",
      "custom-header-2": "2",
    },
    entries: [
      ["content-type", "type/subtype"],
      ["custom-header-1", "1"],
      ["custom-header-2", "2"],
    ],
  },
];

for (const { entries, headers, description } of headersInitCases) {
  Deno.test(`HeadersInit: json() ${description}`, () => {
    const response = json(null, { headers });
    for (const [key, value] of entries) {
      assertEquals(response.headers.get(key), value);
    }
  });

  Deno.test(`HeadersInit: jsx() ${description}`, () => {
    const vnode: VNode = { type: "div", props: { children: null }, key: "div" };
    const response = jsx(vnode, { headers });
    for (const [key, value] of entries) {
      assertEquals(response.headers.get(key), value);
    }
  });
}
