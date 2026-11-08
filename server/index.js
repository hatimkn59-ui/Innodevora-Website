"use strict";

const { loadEnv, createConfig } = require("./config");
const { createApp } = require("./app");
const { hasAdmin } = require("./db");

loadEnv();
const config = createConfig();

const logger = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(message),
  error: (message) => console.error(message),
  debug: () => {},
};

const app = createApp({ config, logger });
const server = app.server;

server.listen(config.port, config.host, () => {
  const displayHost = config.host === "0.0.0.0" ? "localhost" : config.host;
  const knowledge = app.knowledge.getStatus();
  console.log("");
  console.log("  Innodevora website + AI assistant");
  console.log(`  Site:   http://${displayHost}:${config.port}/`);
  console.log(`  Admin:  http://${displayHost}:${config.port}/admin/`);
  console.log(`  Health: http://${displayHost}:${config.port}/api/health`);
  console.log("");
  console.log(
    `  Knowledge: ${knowledge.available ? `loaded (${knowledge.sectionCount} sections, v${knowledge.version})` : "UNAVAILABLE"}`
  );
  console.log(`  AI mode:   ${app.aiService.mode}`);
  if (!hasAdmin(app.db)) {
    console.warn("");
    console.warn("  ADMIN DASHBOARD DISABLED: no admin credential is configured.");
    console.warn("  Run `npm run admin:hash`, then put the result in .env as ADMIN_PASSWORD_HASH.");
  }
  if (config.isProduction && app.aiService.mode === "demo") {
    console.warn("  WARNING: keyless demo mode is enabled in production. Set AI_API_KEY for live answers.");
  }
  if (config.isProduction && app.aiService.mode === "unavailable") {
    console.warn("  WARNING: no AI provider is configured. Chat requests will return a graceful 503.");
  }
  console.log("");
});

function shutdown(signal) {
  console.log(`\n[server] ${signal} received, shutting down.`);
  server.close(() => {
    app.close();
    process.exit(0);
  });
  setTimeout(() => {
    app.close();
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (error) => {
  logger.error(`[server] unhandled rejection: ${error?.stack || error}`);
});
process.on("uncaughtException", (error) => {
  logger.error(`[server] uncaught exception: ${error?.stack || error}`);
});
