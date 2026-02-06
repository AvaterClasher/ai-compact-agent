import { describe, expect, test } from "bun:test";
import { AgentAPIClient } from "../api-client.js";

/**
 * Helper to create a mock fetch response with a ReadableStream
 * that emits chunks on the given schedule.
 */
function mockStreamResponse(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
        // Small delay to simulate network chunking
        await new Promise((r) => setTimeout(r, 1));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

/** Collect all events from the async generator */
async function collectEvents(client: AgentAPIClient, sessionId: string, content: string) {
  const events: { type: string; data: unknown }[] = [];
  for await (const event of client.streamMessage(sessionId, { content })) {
    events.push(event);
  }
  return events;
}

describe("AgentAPIClient SSE parser", () => {
  test("parses complete SSE events in a single chunk", async () => {
    const sseText =
      'event: token\ndata: {"delta":"Hello "}\n\n' +
      'event: token\ndata: {"delta":"world!"}\n\n' +
      'event: done\ndata: {"messageId":"msg-1","usage":{"input":10,"output":5}}\n\n';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => mockStreamResponse([sseText]);

    try {
      const client = new AgentAPIClient("http://localhost:5001");
      const events = await collectEvents(client, "session-1", "hello");

      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({ type: "token", data: { delta: "Hello " } });
      expect(events[1]).toEqual({ type: "token", data: { delta: "world!" } });
      expect(events[2]).toEqual({
        type: "done",
        data: { messageId: "msg-1", usage: { input: 10, output: 5 } },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("parses events split across chunks (event line in one, data in next)", async () => {
    const chunks = [
      "event: token\n",
      'data: {"delta":"Hello"}\n\n',
      "event: done\n",
      'data: {"messageId":"msg-1","usage":{}}\n\n',
    ];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => mockStreamResponse(chunks);

    try {
      const client = new AgentAPIClient("http://localhost:5001");
      const events = await collectEvents(client, "session-1", "hello");

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({ type: "token", data: { delta: "Hello" } });
      expect(events[1]).toEqual({ type: "done", data: { messageId: "msg-1", usage: {} } });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("parses events when empty line separator is in a separate chunk", async () => {
    const chunks = [
      'event: done\ndata: {"messageId":"msg-1","usage":{}}', // no trailing \n\n
      "\n\n", // separator arrives in next chunk
    ];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => mockStreamResponse(chunks);

    try {
      const client = new AgentAPIClient("http://localhost:5001");
      const events = await collectEvents(client, "session-1", "hello");

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ type: "done", data: { messageId: "msg-1", usage: {} } });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("handles id field without breaking event parsing", async () => {
    const sseText =
      'id: 0\nevent: token\ndata: {"delta":"Hi"}\n\n' +
      'id: 1\nevent: done\ndata: {"messageId":"msg-1","usage":{}}\n\n';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => mockStreamResponse([sseText]);

    try {
      const client = new AgentAPIClient("http://localhost:5001");
      const events = await collectEvents(client, "session-1", "hello");

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe("token");
      expect(events[1].type).toBe("done");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("handles data split mid-JSON across chunks", async () => {
    const chunks = ['event: done\ndata: {"messageId":"msg-1",', '"usage":{"input":10}}\n\n'];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => mockStreamResponse(chunks);

    try {
      const client = new AgentAPIClient("http://localhost:5001");
      const events = await collectEvents(client, "session-1", "hello");

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: "done",
        data: { messageId: "msg-1", usage: { input: 10 } },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("skips malformed JSON data gracefully", async () => {
    const sseText =
      "event: token\ndata: {not valid json}\n\n" +
      'event: done\ndata: {"messageId":"msg-1","usage":{}}\n\n';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => mockStreamResponse([sseText]);

    try {
      const client = new AgentAPIClient("http://localhost:5001");
      const events = await collectEvents(client, "session-1", "hello");

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("done");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("handles many small chunks (byte-at-a-time)", async () => {
    const fullSSE =
      'event: token\ndata: {"delta":"ok"}\n\nevent: done\ndata: {"messageId":"m","usage":{}}\n\n';
    // Split into individual characters
    const chunks = fullSSE.split("").map((c) => c);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => mockStreamResponse(chunks);

    try {
      const client = new AgentAPIClient("http://localhost:5001");
      const events = await collectEvents(client, "session-1", "hello");

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe("token");
      expect(events[1].type).toBe("done");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
