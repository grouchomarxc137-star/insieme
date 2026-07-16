import { io } from 'socket.io-client';

// Not auto-connected — ResetRoomSession explicitly connects/disconnects as
// the session view mounts/unmounts, same lifecycle as lovissimi's socket.js.
export const socket = io({
  autoConnect: false,
  path: '/socket.io',
  transports: ['websocket', 'polling'],
});

export function emitAction(event, payload) {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (res) => {
      if (res?.ok) resolve(res);
      else reject(new Error(res?.message || 'Something went wrong'));
    });
  });
}
