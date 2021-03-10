import { serve } from "https://raw.githubusercontent.com/lucacasonato/deno-fetchevent/f4f7eee1934bbf425ce248bbcbc3dc014636da22/mod.ts";
import type { Server } from "https://raw.githubusercontent.com/lucacasonato/deno-fetchevent/f4f7eee1934bbf425ce248bbcbc3dc014636da22/mod.ts";
import "https://raw.githubusercontent.com/lucacasonato/deno_local_file_fetch/a464f5615be68be47d05114a0f5b32ccb2c26038/polyfill.ts";

let server: Server;

export function startServer(port: number): void {
  const originalAddEventListener = window.addEventListener;
  const FetchEventListener = (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) => {
    if (type === "fetch") {
      server = serve(":" + port);
      (async () => {
        for await (const event of server) {
          if (typeof listener === "function") {
            listener(event);
          } else if (typeof listener?.handleEvent === "function") {
            listener.handleEvent(event);
          }
        }
      })();
    } else {
      originalAddEventListener(type, listener, options);
    }
  };
  window.addEventListener = FetchEventListener;
}

export function stopServer() {
  server.close();
}
