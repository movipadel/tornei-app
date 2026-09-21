self.addEventListener("activate", (event) => {
  const activationEvent = event as Event & {
    waitUntil(promise: Promise<unknown>): void;
  };

  activationEvent.waitUntil(caches.delete("apis"));
});