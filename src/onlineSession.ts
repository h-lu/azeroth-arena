import type { Side } from "../packages/data/src";
import type { ConnectionStatus, RoomErrorPayload } from "./onlineProtocol";

export type PreferredSide = "auto" | Side;

export interface StoredOnlineSession {
  serverUrl: string;
  preferredSide: PreferredSide;
  roomCode: string;
  side: Side | null;
  seatToken: string;
}

export const ONLINE_STORAGE_KEYS = {
  serverUrl: "azeroth-arena.serverUrl",
  roomCode: "azeroth-arena.roomCode",
  roomSide: "azeroth-arena.roomSide",
  seatToken: "azeroth-arena.seatToken",
  preferredSide: "azeroth-arena.preferredSide",
} as const;

function defaultServerUrl() {
  if (typeof window === "undefined") return "ws://localhost:8788";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  if (window.location.pathname.startsWith("/wow")) {
    return `${protocol}//${window.location.host}/wow-ws`;
  }
  return `${protocol}//${window.location.hostname}:8788`;
}

function browserStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStorage(key: string, fallback: string) {
  return browserStorage()?.getItem(key) ?? fallback;
}

function writeStorage(key: string, value: string) {
  browserStorage()?.setItem(key, value);
}

function removeStorage(key: string) {
  browserStorage()?.removeItem(key);
}

export function parseSide(value: string): Side | null {
  return value === "blue" || value === "red" ? value : null;
}

export function parsePreferredSide(value: string): PreferredSide {
  return value === "blue" || value === "red" ? value : "auto";
}

export function sanitizeRoomCode(value: string) {
  return value.trim().toUpperCase();
}

export function readStoredOnlineSession(): StoredOnlineSession {
  return {
    serverUrl: readStorage(ONLINE_STORAGE_KEYS.serverUrl, defaultServerUrl()),
    preferredSide: parsePreferredSide(readStorage(ONLINE_STORAGE_KEYS.preferredSide, "auto")),
    roomCode: sanitizeRoomCode(readStorage(ONLINE_STORAGE_KEYS.roomCode, "")),
    side: parseSide(readStorage(ONLINE_STORAGE_KEYS.roomSide, "")),
    seatToken: readStorage(ONLINE_STORAGE_KEYS.seatToken, ""),
  };
}

export function persistServerUrl(serverUrl: string) {
  writeStorage(ONLINE_STORAGE_KEYS.serverUrl, serverUrl);
}

export function persistPreferredSide(preferredSide: PreferredSide) {
  writeStorage(ONLINE_STORAGE_KEYS.preferredSide, preferredSide);
}

export function persistOnlineSeat(roomCode: string, side: Side | null, seatToken: string) {
  if (roomCode) writeStorage(ONLINE_STORAGE_KEYS.roomCode, sanitizeRoomCode(roomCode));
  else removeStorage(ONLINE_STORAGE_KEYS.roomCode);

  if (side) writeStorage(ONLINE_STORAGE_KEYS.roomSide, side);
  else removeStorage(ONLINE_STORAGE_KEYS.roomSide);

  if (seatToken) writeStorage(ONLINE_STORAGE_KEYS.seatToken, seatToken);
  else removeStorage(ONLINE_STORAGE_KEYS.seatToken);
}

export function clearOnlineSeat() {
  removeStorage(ONLINE_STORAGE_KEYS.roomCode);
  removeStorage(ONLINE_STORAGE_KEYS.roomSide);
  removeStorage(ONLINE_STORAGE_KEYS.seatToken);
}

export function hasReconnectSession(roomCode: string, side: Side | null, seatToken: string) {
  return !!sanitizeRoomCode(roomCode) && !!side && !!seatToken;
}

export function describeConnectionStatus(status: ConnectionStatus) {
  switch (status) {
    case "connected":
      return "已连接";
    case "connecting":
      return "正在连接";
    case "reconnecting":
      return "正在恢复";
    case "disconnected":
      return "已断开";
    case "error":
      return "连接错误";
  }
}

export function describeRoomError(payload: RoomErrorPayload) {
  switch (payload.code) {
    case "STALE_CONNECTION":
      return "当前连接已被新的恢复会话替换。请点击 Reconnect 恢复后再操作。";
    case "VERSION_MISMATCH":
      return "本地房间状态版本已过期，请等待最新状态下发；如果没有恢复，请点击 Reconnect。";
    case "INVALID_SEAT_TOKEN":
      return "保存的座位令牌无效，无法恢复这个座位。请确认房间信息或重新加入。";
    case "ROOM_NOT_FOUND":
      return "房间不存在或服务端已重启，无法恢复这个房间。";
    case "AUTH_REQUIRED":
      return "当前 WebSocket 没有绑定有效房间会话，请重新连接。";
    default:
      return `[${payload.code}] ${payload.message}`;
  }
}

export function statusAfterRoomError(payload: RoomErrorPayload, currentStatus: ConnectionStatus): ConnectionStatus {
  switch (payload.code) {
    case "STALE_CONNECTION":
    case "INVALID_SEAT_TOKEN":
    case "ROOM_NOT_FOUND":
    case "AUTH_REQUIRED":
      return "error";
    default:
      return currentStatus;
  }
}
