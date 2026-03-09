import { useEffect, useRef } from 'react';
import { Client } from '@stomp/stompjs';
// Use the dist bundle to avoid Vite's ESM transform of the CJS source
import SockJS from 'sockjs-client/dist/sockjs.min.js';

const WS_URL = import.meta.env.VITE_WS_URL ?? '/ws';

/**
 * useWebSocket — manages the STOMP over SockJS connection to the backend.
 *
 * Calls:
 *  - onSnapshot(CitySnapshotMessage) once on connect
 *  - onMutation(CityMutationMessage) for each live event
 *
 * Resource optimization:
 *  - Single STOMP client, recreated only on mount/unmount
 *  - Subscriptions cleaned up in useEffect return
 *
 * @param {{ onSnapshot: Function, onMutation: Function }} callbacks
 */
export function useWebSocket({ onSnapshot, onMutation }) {
  const clientRef = useRef(null);
  // Keep stable references so the effect doesn't re-run on re-renders
  const snapshotRef = useRef(onSnapshot);
  const mutationRef = useRef(onMutation);
  snapshotRef.current = onSnapshot;
  mutationRef.current = onMutation;

  useEffect(() => {
    const client = new Client({
      webSocketFactory: () => new SockJS(WS_URL),
      reconnectDelay: 3000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      onConnect: () => {
        // Subscribe to snapshot topic
        client.subscribe('/topic/city/snapshot', frame => {
          try {
            const msg = JSON.parse(frame.body);
            snapshotRef.current?.(msg);
          } catch (e) {
            console.error('[WS] Bad snapshot payload', e);
          }
        });

        // Subscribe to mutations topic
        client.subscribe('/topic/city/mutations', frame => {
          try {
            const msg = JSON.parse(frame.body);
            mutationRef.current?.(msg);
          } catch (e) {
            console.error('[WS] Bad mutation payload', e);
          }
        });
      },
      onStompError: frame => {
        console.error('[WS] STOMP error', frame);
      },
      onDisconnect: () => {
        console.info('[WS] Disconnected');
      },
    });

    client.activate();
    clientRef.current = client;

    return () => {
      client.deactivate();
      clientRef.current = null;
    };
  }, []); // run once on mount

  return clientRef;
}
