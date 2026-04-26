import type { Server as SocketIOServer } from "socket.io";

let _io: SocketIOServer | null = null;

export function setIo(io: SocketIOServer) {
  _io = io;
}

export function getIo(): SocketIOServer | null {
  return _io;
}
