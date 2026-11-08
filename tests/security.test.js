"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  hashPassword,
  verifyPassword,
  parseCookies,
  buildCookie,
  clearCookie,
  normalizeText,
  isValidEmail,
  redactPII,
  csvCell,
  originMatchesHost,
  assertSameOrigin,
  hashIp,
} = require("../server/security");

test("scrypt passwords verify and reject wrong credentials", () => {
  const hash = hashPassword("a-strong-local-password");
  assert.match(hash, /^scrypt\$/);
  assert.equal(verifyPassword("a-strong-local-password", hash), true);
  assert.equal(verifyPassword("wrong-password", hash), false);
  assert.equal(verifyPassword("a-strong-local-password", "garbage"), false);
  assert.throws(() => hashPassword("short"), /between 8 and 200/);
});

test("cookie helpers create hardened cookies and clear them", () => {
  const cookie = buildCookie("ndv_test", "abc def", {
    maxAge: 120,
    secure: true,
    sameSite: "Strict",
    httpOnly: true,
  });
  assert.match(cookie, /^ndv_test=abc%20def/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Max-Age=120/);
  assert.match(clearCookie("ndv_test", { secure: true }), /Max-Age=0/);

  const parsed = parseCookies(cookie);
  assert.equal(parsed.ndv_test, "abc def");
});

test("normalization removes control characters and limits length", () => {
  assert.equal(normalizeText("  hello\u0000\r\nworld  "), "hello\nworld");
  assert.equal(normalizeText("abcdef", 3), "abc");
  assert.equal(normalizeText(null), "");
});

test("email validation and PII redaction", () => {
  assert.equal(isValidEmail("hello@example.com"), true);
  assert.equal(isValidEmail("not-an-email"), false);

  const redacted = redactPII(
    "Email me at Jane.Doe@example.com or +33 6 12 34 56 78. Card 4242 4242 4242 4242. password: hunter22"
  );
  assert.match(redacted, /\[email hidden until consent\]/);
  assert.doesNotMatch(redacted, /Jane\.Doe/i);
  assert.doesNotMatch(redacted, /4242 4242 4242 4242/);
  assert.match(redacted, /\[hidden\]/);
});

test("CSV output guards formulas and quotes fields", () => {
  assert.equal(csvCell("=cmd|' /C calc'!A0"), "'=cmd|' /C calc'!A0");
  assert.equal(csvCell('Hello, "world"'), '"Hello, ""world"""');
  assert.equal(csvCell(null), "");
});

test("same-origin checks compare the Origin host with the Host header", () => {
  assert.equal(originMatchesHost({ headers: { host: "example.com" } }), true);
  assert.equal(
    originMatchesHost({ headers: { host: "example.com", origin: "https://example.com" } }),
    true
  );
  assert.equal(
    originMatchesHost({ headers: { host: "example.com", origin: "https://evil.example" } }),
    false
  );
  assert.equal(assertSameOrigin({ headers: { host: "example.com", origin: "null" } }), false);
});

test("IP hashes are keyed and never expose the raw address", () => {
  const config = { ipHashSalt: "s".repeat(32), trustProxy: false };
  const req = { socket: { remoteAddress: "::ffff:203.0.113.9" }, headers: {} };
  const hashed = hashIp(req, config);
  assert.match(hashed, /^[a-f0-9]{64}$/);
  assert.equal(hashed.includes("203.0.113.9"), false);
  assert.equal(
    hashed,
    hashIp({ socket: { remoteAddress: "203.0.113.9" }, headers: {} }, config)
  );
});
