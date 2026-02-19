import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relPath) {
  const abs = path.join(root, relPath);
  return fs.readFileSync(abs, "utf8");
}

function hasAll(content, markers) {
  return markers.every((m) => content.includes(m));
}

function runCheck(name, relPath, markers) {
  try {
    const content = read(relPath);
    const pass = hasAll(content, markers);
    return {
      name,
      file: relPath,
      pass,
      missing: pass ? [] : markers.filter((m) => !content.includes(m)),
    };
  } catch (error) {
    return {
      name,
      file: relPath,
      pass: false,
      missing: [`File unreadable: ${error.message}`],
    };
  }
}

const checks = [
  runCheck("Admin chat send/read receipts", "client/src/pages/AdminMessages.tsx", [
    "MessageStatusTicks",
    "message_status_updated",
    "message_delivered",
  ]),
  runCheck("Admin voice/video/group call controls", "client/src/pages/AdminMessages.tsx", [
    "startCall('voice')",
    "startCall('video')",
    "startGroupCall(",
    "JitsiCallDialog",
  ]),
  runCheck("Seller messaging flow", "client/src/pages/SellerMessages.tsx", [
    "MessageStatusTicks",
    "VoiceRecorderControls",
    "message_status_updated",
  ]),
  runCheck("Rider messaging flow", "client/src/pages/RiderMessages.tsx", [
    "MessageStatusTicks",
    "VoiceRecorderControls",
    "message_status_updated",
  ]),
  runCheck("Buyer/support messaging flow", "client/src/pages/CustomerSupport.tsx", [
    "MessageStatusTicks",
    "support_typing",
    "support_stop_typing",
  ]),
  runCheck("Connected chat call controls", "client/src/pages/ChatPageConnected.tsx", [
    "button-audio-call",
    "button-video-call",
    "call-incoming",
    "call-offer",
  ]),
  runCheck("Server message receipt events", "server/routes.ts", [
    "message_status_updated",
    "message_delivered",
    "/api/messages/:userId/read",
  ]),
  runCheck("Server call signaling + group call", "server/routes.ts", [
    "socket.on(\"call-offer\"",
    "socket.on(\"group_call_start\"",
    "socket.on(\"group_call_offer\"",
  ]),
];

const total = checks.length;
const passed = checks.filter((c) => c.pass).length;

console.log("Messaging/Call QA Checklist");
console.log("===========================");
for (const c of checks) {
  console.log(`${c.pass ? "PASS" : "FAIL"} | ${c.name} | ${c.file}`);
  if (!c.pass) {
    for (const m of c.missing) {
      console.log(`  - Missing: ${m}`);
    }
  }
}
console.log("---------------------------");
console.log(`Result: ${passed}/${total} checks passed`);
process.exit(passed === total ? 0 : 1);

