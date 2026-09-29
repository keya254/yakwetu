import "server-only";
import { connect, type ChannelModel, type ConfirmChannel, type RecoveringChannelModel } from "amqplib";
import type { EventEnvelope } from "@/lib/events/envelope";

/**
 * One RabbitMQ connection per server process, with publisher confirms: a
 * publish only counts once the broker says the message is stored in every
 * queue it routed to. Anything short of that (broker down, blocked, no
 * confirm within the timeout) is an error, and the outbox keeps the row for
 * the next drain.
 *
 * Messages are persistent and carry the event id as messageId and the event
 * name as type, so consumers (and n8n) can dedupe and route without parsing.
 */

const CONFIRM_TIMEOUT_MS = 5_000;
/** Right after boot the connection is still opening: give it this long before counting a publish as failed. */
const CONNECT_WAIT_MS = 3_000;

interface PublisherState {
  connection: RecoveringChannelModel | null;
  channel: ConfirmChannel | null;
  connecting: Promise<void> | null;
}

// Survives hot reloads in development, so edits don't pile up connections.
const globalForPublisher = globalThis as unknown as { yakwetuPublisher?: PublisherState };
const state: PublisherState = (globalForPublisher.yakwetuPublisher ??= { connection: null, channel: null, connecting: null });

export function publisherConfigured(): boolean {
  return Boolean(process.env.RABBITMQ_URL);
}

function ensureConnection(): Promise<void> {
  if (state.connection) return Promise.resolve();
  state.connecting ??= (async () => {
    const url = new URL(process.env.RABBITMQ_URL!);
    if (!url.searchParams.has("heartbeat")) url.searchParams.set("heartbeat", "30");
    const connection = await connect(url.toString(), {
      clientProperties: { connection_name: "yakwetu storefront publisher" },
      recovery: {
        initialDelay: 500,
        maxDelay: 15_000,
        waitForConnect: false,
        async setup(model: ChannelModel) {
          state.channel = await model.createConfirmChannel();
          state.channel.on("error", () => {}); // a channel error closes it; the next connect makes a new one
          state.channel.on("close", () => {
            state.channel = null;
          });
        },
      },
    });
    connection.on("disconnect", () => {
      state.channel = null;
    });
    connection.on("connect-failed", (error: Error) => console.warn(`[events] RabbitMQ unreachable (${error.message}); events wait in the outbox`));
    connection.on("blocked", (reason: string) => console.warn(`[events] RabbitMQ is blocking publishers: ${reason}`));
    connection.on("error", () => {});
    state.connection = connection;
  })().finally(() => {
    state.connecting = null;
  });
  return state.connecting;
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * Publishes a batch and resolves with the ids the broker confirmed. Throws
 * only when nothing could be attempted (not configured, no channel yet).
 */
export async function publishEvents(events: { exchange: string; envelope: EventEnvelope }[]): Promise<{ confirmed: string[]; failed: { id: string; error: string }[] }> {
  if (!publisherConfigured()) throw new Error("RABBITMQ_URL is not set");
  await ensureConnection();
  const deadline = Date.now() + CONNECT_WAIT_MS;
  while (!state.channel && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
  const channel = state.channel;
  if (!channel) throw new Error("not connected to RabbitMQ");

  const results = await Promise.all(
    events.map(({ exchange, envelope }) =>
      withTimeout(
        new Promise<string>((resolve, reject) => {
          channel.publish(
            exchange,
            envelope.type,
            Buffer.from(JSON.stringify(envelope)),
            {
              persistent: true,
              contentType: "application/json",
              messageId: envelope.id,
              type: envelope.type,
              timestamp: Math.floor(Date.parse(envelope.occurredAt) / 1000),
              appId: "yakwetu-storefront",
            },
            (error) => (error ? reject(error instanceof Error ? error : new Error("broker nacked the message")) : resolve(envelope.id)),
          );
        }),
        CONFIRM_TIMEOUT_MS,
        "publisher confirm",
      ).then(
        (id) => ({ ok: true as const, id }),
        (error: unknown) => ({ ok: false as const, id: envelope.id, error: error instanceof Error ? error.message : String(error) }),
      ),
    ),
  );

  return {
    confirmed: results.filter((result) => result.ok).map((result) => result.id),
    failed: results.filter((result) => !result.ok).map(({ id, error }) => ({ id, error: error ?? "unknown" })),
  };
}
