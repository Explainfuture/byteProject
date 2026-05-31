import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

const npmCommand = "npm";
const services = [
  { name: "api", args: ["run", "dev", "-w", "apps/api"] },
  { name: "web", args: ["run", "dev", "-w", "apps/web"] }
];
const children = [];
let shuttingDown = false;

for (const service of services) {
  const child = spawn(npmCommand, service.args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      FORCE_COLOR: "1"
    }
  });

  children.push({ ...service, child });

  child.on("error", (error) => {
    if (shuttingDown) return;
    console.error(`[dev] ${service.name} failed to start: ${error.message}`);
    void shutdown(1);
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    console.error(`[dev] ${service.name} exited with ${reason}; stopping remaining services.`);
    void shutdown(typeof code === "number" ? code : 1);
  });
}

console.log("[dev] Started api and web. Press Ctrl+C to stop both services.");

process.once("SIGINT", () => {
  void shutdown(130);
});

process.once("SIGTERM", () => {
  void shutdown(143);
});

process.once("SIGHUP", () => {
  void shutdown(129);
});

process.once("uncaughtException", (error) => {
  console.error(error);
  void shutdown(1);
});

process.once("exit", () => {
  if (shuttingDown) return;
  for (const { child } of children) {
    killProcessTreeSync(child.pid);
  }
});

async function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("[dev] Stopping api and web...");
  await Promise.all(children.map(({ child }) => killProcessTree(child.pid)));
  process.exit(exitCode);
}

function killProcessTreeSync(pid) {
  if (!pid || process.platform !== "win32") return;
  spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
    stdio: "ignore",
    windowsHide: true
  });
}

function killProcessTree(pid) {
  if (!pid) return Promise.resolve();

  if (process.platform === "win32") {
    return run("taskkill", ["/PID", String(pid), "/T", "/F"]);
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      return Promise.resolve();
    }
  }

  return new Promise((resolve) => setTimeout(resolve, 500));
}

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore", windowsHide: true });
    child.on("error", () => resolve());
    child.on("exit", () => resolve());
  });
}
