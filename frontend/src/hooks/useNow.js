import { useSyncExternalStore } from 'react';

// Shared 1Hz clock. A single interval drives every subscriber (there are up
// to ~44 patient cards) instead of each card running its own timer, and it
// guarantees freshness/staleness is re-evaluated even when no WebSocket
// message ever arrives again (a frozen React tree would otherwise look live
// forever if the Kafka feed dies).
let now = Date.now();
let intervalId = null;
const listeners = new Set();

function tick() {
  now = Date.now();
  listeners.forEach(listener => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  if (intervalId === null) {
    now = Date.now();
    intervalId = setInterval(tick, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

function getSnapshot() {
  return now;
}

export function useNow() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
