const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");

const ROOT_DIR = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT_DIR, "out");
const HOST = process.env.HOSTINGER_HOST || "86.38.243.155";
const PORT = process.env.HOSTINGER_PORT || "65002";
const USER = process.env.HOSTINGER_USER || "u408450631";
const REMOTE_PATH =
  process.env.HOSTINGER_REMOTE_PATH ||
  "/home/u408450631/domains/ifleon.com/public_html/honestreps";
const SUBDOMAIN = process.env.HOSTINGER_SUBDOMAIN || "honestreps.ifleon.com";

let PASSWORD = process.env.HOSTINGER_PASSWORD || "";
const envFiles = [
  path.join(ROOT_DIR, ".env.local"),
  path.resolve(ROOT_DIR, "..", "carzlync-main", ".env.local"),
];
for (const envFile of envFiles) {
  if (!PASSWORD && fs.existsSync(envFile)) {
    try {
      const lines = fs.readFileSync(envFile, "utf8").split(/\r?\n/);
      for (const line of lines) {
        if (line.trim().startsWith("HOSTINGER_PASSWORD=")) {
          PASSWORD = line.trim().split("=").slice(1).join("=").replace(/^['"]|['"]$/g, "").trim();
          break;
        }
      }
    } catch {}
  }
}

function run(cmd, extraEnv = {}) {
  console.log(`>> Executing: ${cmd}`);
  execSync(cmd, {
    cwd: ROOT_DIR,
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, ...extraEnv },
  });
}

function verifyRoute(subpath) {
  return new Promise((resolve, reject) => {
    const url = `https://${SUBDOMAIN}${subpath}`;
    https
      .get(url, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          console.log(`  [PASS] HTTP ${res.statusCode}: ${url}`);
          resolve();
        } else {
          reject(new Error(`HTTP ${res.statusCode} on ${url}`));
        }
      })
      .on("error", reject);
  });
}

async function main() {
  const releaseId = `${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}-${Math.random()
    .toString(16)
    .slice(2, 10)}`;

  console.log("=".repeat(60));
  console.log("  Honest Reps — Hostinger SSH Deployment");
  console.log(`  Target URL : https://${SUBDOMAIN}`);
  console.log(`  Remote Path: ${REMOTE_PATH}`);
  console.log("=".repeat(60));

  if (!process.env.SKIP_BUILD) {
    console.log(">> Building Next.js static export (npm run build)...");
    run("npm run build");
  }

  // Ensure .htaccess and version.json are present in out/
  const htSrc = path.join(ROOT_DIR, "public", ".htaccess");
  const htDest = path.join(OUT_DIR, ".htaccess");
  if (fs.existsSync(htSrc)) {
    fs.copyFileSync(htSrc, htDest);
  }
  fs.writeFileSync(
    path.join(OUT_DIR, "version.json"),
    JSON.stringify({ app: "honest-reps", releaseId, deployedAt: new Date().toISOString() }, null, 2)
  );

  const tarFile = path.join(os.tmpdir(), `honestreps_dist_${Date.now()}.tar.gz`);
  console.log(`>> Packaging ${OUT_DIR} into ${tarFile}...`);
  run(`tar.exe -czf "${tarFile}" -C "${OUT_DIR}" .`);

  if (!PASSWORD) {
    const readline = require("readline").createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    PASSWORD = await new Promise((resolve) => {
      readline.question(">> Enter Hostinger SSH Password: ", (ans) => {
        readline.close();
        resolve(ans.trim());
      });
    });
  }

  if (!PASSWORD) {
    throw new Error("Deployment aborted: HOSTINGER_PASSWORD is required.");
  }

  const askpassBat = path.join(os.tmpdir(), `askpass_honestreps_${Date.now()}.bat`);
  fs.writeFileSync(askpassBat, `@echo ${PASSWORD}\n`);

  const sshEnv = {
    SSH_ASKPASS: askpassBat,
    SSH_ASKPASS_REQUIRE: "force",
    DISPLAY: "dummy:0",
  };

  const SSH_OPTS = `-p ${PORT} -o StrictHostKeyChecking=accept-new -o ConnectTimeout=25 -o ServerAliveInterval=15 -o ServerAliveCountMax=3`;
  const remoteTar = `${REMOTE_PATH}/dist.tar.gz`;

  try {
    console.log(`>> Ensuring remote directory exists: ${REMOTE_PATH}`);
    run(`ssh ${SSH_OPTS} ${USER}@${HOST} "mkdir -p ${REMOTE_PATH}"`, sshEnv);

    console.log(`>> Uploading archive via SCP...`);
    run(
      `scp -P ${PORT} -o StrictHostKeyChecking=accept-new -o ConnectTimeout=25 "${tarFile}" ${USER}@${HOST}:${remoteTar}`,
      sshEnv
    );

    console.log(">> Extracting and atomically swapping release on Hostinger...");
    const remoteCommands = [
      "set -eu",
      `site='${REMOTE_PATH}'`,
      `stage='${REMOTE_PATH}.stage-${releaseId}'`,
      `rollback='${REMOTE_PATH}.rollback-${releaseId}'`,
      `backup='previous-${releaseId}.tar.gz'`,
      'backup_dir="$HOME/.honestreps-backups"',
      'mkdir -p "$backup_dir"',
      'tar -czf "$backup_dir/$backup" -C "$site" . 2>/dev/null || true',
      'mkdir -p "$stage"',
      'tar -xzf "$site/dist.tar.gz" -C "$stage"',
      'test -s "$stage/index.html" && test -s "$stage/.htaccess"',
      'find "$stage" -type d -exec chmod 755 {} +',
      'find "$stage" -type f -exec chmod 644 {} +',
      'mv "$site" "$rollback"',
      'if mv "$stage" "$site"; then rm -rf "$rollback"; else mv "$rollback" "$site"; exit 1; fi',
      'ls -la "$site/index.html" "$site/admin/index.html" "$site/.htaccess"',
    ].join("; ");

    run(`ssh ${SSH_OPTS} ${USER}@${HOST} "${remoteCommands}"`, sshEnv);

    console.log("=".repeat(60));
    console.log("  DEPLOYMENT SUCCESSFUL");
    console.log(`  Live URL : https://${SUBDOMAIN}`);
    console.log(`  Admin    : https://${SUBDOMAIN}/admin/`);
    console.log("=".repeat(60));

    for (const p of ["/", "/signin/", "/onboarding/", "/admin/", "/manifest.json", "/icons/logo-icon.png", "/version.json"]) {
      try {
        await verifyRoute(p);
      } catch (err) {
        console.warn(`  [WARN] ${p}: ${err.message}`);
      }
    }
    process.exit(0);
  } finally {
    try {
      if (fs.existsSync(askpassBat)) fs.unlinkSync(askpassBat);
    } catch {}
    try {
      if (fs.existsSync(tarFile)) fs.unlinkSync(tarFile);
    } catch {}
  }
}

main().catch((err) => {
  console.error(">> Deployment failed:", err.message);
  process.exit(1);
});
