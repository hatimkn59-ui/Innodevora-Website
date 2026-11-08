"use strict";

const { hashPassword } = require("./security");

function readHidden(promptText) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      process.stdout.write(promptText);
      let data = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => {
        data += chunk;
        if (data.includes("\n")) {
          process.stdin.pause();
          resolve(data.split(/\r?\n/)[0]);
        }
      });
      process.stdin.on("end", () => resolve(data.trim()));
      process.stdin.on("error", reject);
      return;
    }

    process.stdout.write(promptText);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    let value = "";
    const onData = (char) => {
      if (char === "\u0003") {
        process.stdout.write("\n");
        cleanup();
        process.exit(130);
      }
      if (char === "\r" || char === "\n") {
        process.stdout.write("\n");
        cleanup();
        resolve(value);
        return;
      }
      if (char === "\u007f" || char === "\b") {
        if (value.length) {
          value = value.slice(0, -1);
          process.stdout.write("\b \b");
        }
        return;
      }
      if (char >= " " || char === "\t") {
        value += char;
        process.stdout.write("*");
      }
    };
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  let password = process.argv[2] || process.env.ADMIN_PASSWORD || "";
  if (!password) {
    password = await readHidden("Choose an admin password (min 8 chars): ");
    const confirmation = await readHidden("Confirm password: ");
    if (password !== confirmation) {
      console.error("Passwords do not match.");
      process.exit(1);
    }
  }
  if (password.length < 8) {
    console.error("Use at least 8 characters. 16+ random characters is strongly recommended.");
    process.exit(1);
  }
  const hash = hashPassword(password);
  console.log("");
  console.log("Add this line to .env (leave ADMIN_PASSWORD empty):");
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
  console.log("");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
