import { after } from "next/server";
import {
  createRuntimePerf,
  type ExternalProvider,
} from "@/lib/runtimePerf";

type PostCommitNotification = {
  provider: ExternalProvider;
  run: () => PromiseLike<unknown> | Promise<unknown>;
  failureLog: string;
  failureLogLevel?: "warn" | "error";
};

export function schedulePostCommitNotifications(
  endpoint: string,
  notifications: PostCommitNotification[]
) {
  if (notifications.length === 0) return;

  after(async () => {
    const perf = createRuntimePerf(`${endpoint}#notifications`);
    perf.setStatus(200);

    try {
      await Promise.all(
        notifications.map(async ({ provider, run, failureLog, failureLogLevel }) => {
          try {
            await perf.external(provider, run);
          } catch (error) {
            if (failureLogLevel === "error") {
              console.error(failureLog, error);
            } else {
              console.warn(failureLog, error);
            }
          }
        })
      );
    } finally {
      perf.finish();
    }
  });
}

export async function measureNotificationRequest(
  endpoint: string,
  operation: () => Promise<Response>
) {
  const perf = createRuntimePerf(endpoint);

  try {
    const response = await perf.business(operation);
    perf.setStatus(response.status);
    return response;
  } finally {
    perf.finish();
  }
}
