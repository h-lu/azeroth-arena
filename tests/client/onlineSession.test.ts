import { describe, expect, test } from "vitest";
import {
  describeConnectionStatus,
  describeRoomError,
  hasReconnectSession,
  sanitizeRoomCode,
  statusAfterRoomError,
} from "../../src/onlineSession";

describe("online client session helpers", () => {
  test("normalizes room codes and validates reconnect credentials without exposing tokens", () => {
    expect(sanitizeRoomCode(" ab12ef ")).toBe("AB12EF");
    expect(hasReconnectSession("AB12EF", "blue", "secret-seat-token")).toBe(true);
    expect(hasReconnectSession("AB12EF", null, "secret-seat-token")).toBe(false);
    expect(hasReconnectSession("AB12EF", "blue", "")).toBe(false);
  });

  test("labels recovery lifecycle states for the UI", () => {
    expect(describeConnectionStatus("connected")).toBe("已连接");
    expect(describeConnectionStatus("reconnecting")).toBe("正在恢复");
    expect(describeConnectionStatus("disconnected")).toBe("已断开");
  });

  test("maps stale and version errors to actionable client messages", () => {
    const stale = {
      code: "STALE_CONNECTION",
      message: "connection is stale",
    };
    const versionMismatch = {
      code: "VERSION_MISMATCH",
      message: "expected version 1, got 2",
    };

    expect(describeRoomError(stale)).toContain("Reconnect");
    expect(statusAfterRoomError(stale, "connected")).toBe("error");
    expect(describeRoomError(versionMismatch)).toContain("版本已过期");
    expect(statusAfterRoomError(versionMismatch, "connected")).toBe("connected");
    expect(JSON.stringify({
      stale: describeRoomError(stale),
      versionMismatch: describeRoomError(versionMismatch),
    })).not.toContain("secret-seat-token");
  });
});
