import test from "node:test";
import assert from "node:assert/strict";
import { classifyPlayerCompatibility, createUnifiedPlaybackPlan, validatePlayerCapabilities } from "../lib/display/player-protocol.ts";

const sample = {
  protocolVersion: 1, platform: "linux", architecture: "x64", playerVersion: "1.0.0",
  outputs: [{ id: "HDMI-A-1", connector: "hdmi", connected: true, width: 3840, height: 2160, refreshRateHz: 60, hdr: true }],
  decoders: ["h264", "hevc"], offlineCache: true, websocket: false, reportedAt: "2026-11-05T20:00:00Z",
};

test("accepts a bounded and well-formed capability report", () => {
  assert.equal(validatePlayerCapabilities(sample), true);
  assert.equal(validatePlayerCapabilities({ ...sample, outputs: Array(33).fill(sample.outputs[0]) }), false);
});

test("reports 4K only when a connected output negotiated 3840x2160", () => {
  const result = classifyPlayerCompatibility(sample);
  assert.equal(result.status, "compatible");
  assert.deepEqual(result.capable4kOutputs, ["HDMI-A-1"]);
});

test("does not classify a silent-output device as unsupported", () => {
  const silent = { ...sample, decoders: ["h264"], outputs: [{ ...sample.outputs[0], width: 1920, height: 1080 }] };
  const plan = createUnifiedPlaybackPlan([{ id: "still-image", durationSeconds: 12 }], silent);
  assert.equal(plan.audioPresenceRequired, false);
  assert.deepEqual(plan.outputIds, ["HDMI-A-1"]);
});

test("marks devices without connected outputs unsupported", () => {
  const result = classifyPlayerCompatibility({ ...sample, outputs: [{ ...sample.outputs[0], connected: false }] });
  assert.equal(result.status, "unsupported");
});
