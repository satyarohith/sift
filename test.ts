import { assertEquals } from "https://deno.land/std@0.85.0/testing/asserts.ts";
import { Status } from "https://deno.land/std@0.85.0/http/http_status.ts";
import { json, jsx, validateRequest } from "./mod.ts";
import {
  createWorker,
  handlers,
} from "https://deno.land/x/dectyl@0.6.2/mod.ts";

Deno.test("01_hello_world.ts", async () => {
  const script = await createWorker(
    "./examples/01_hello_world.ts",
  );
  await script.start();

  const [response] = await script.fetch("/");
  assertEquals(await response.text(), "Hello World!");

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
  ignore: true,
  fn: async () => {
    const script = await createWorker(
      "./examples/04_serve_static_assets.ts",
      {
        fetchHandler: handlers.fileFetchHandler,
      },
    );
    await script.start();

    const expected = await Deno.readTextFile("./readme.md");
    const [response] = await script.fetch("/static/readme.md");
    assertEquals(await response.text(), expected);

    script.close();
  },
});

// Deno.test(
//   "serveStatic() serves cache content after first request",
//   async () => {
//     startServer(8910);
//     serve({
//       "/static/:filename+": serveStatic(".", { baseUrl: import.meta.url }),
//     });
//     const response1 = await fetch("http://localhost:8910/static/readme.md");
//     let _body = await response1.arrayBuffer();
//     assertEquals(response1.headers.get("x-function-cache-hit"), null);
//     const response2 = await fetch("http://localhost:8910/static/readme.md");
//     _body = await response2.arrayBuffer();
//     assertEquals(response2.status, 200);
//     assertEquals(response2.headers.get("x-function-cache-hit"), "true");
//     stopServer();
//   },
// );

// Deno.test(
//   "serveStatic() sets the appropriate content-type",
//   async () => {
//     startServer(8910);
//     serve({
//       "/static/:filename+": serveStatic(".", { baseUrl: import.meta.url }),
//     });
//     const response = await fetch("http://localhost:8910/static/readme.md");
//     const _body = await response.arrayBuffer();
//     assertEquals(
//       response.headers.get("content-type"),
//       "text/markdown; charset=utf-8",
//     );
//     stopServer();
//   },
// );

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
    const vnode = {type: 'div', props: {children: null}, key: 'div'};
    const response = jsx(vnode, {headers});
    for (const [key, value] of entries) {
      assertEquals(response.headers.get(key), value);
    }
  });
}
