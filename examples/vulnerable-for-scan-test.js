// This file is intentionally insecure to test the security-scan GitHub Action.
// It contains patterns that should trigger findings:
// - Hardcoded credential / secret
// - SQL injection
// - Use of dangerous function (eval)

const API_KEY = "sk-FAKE-TEST-SECRET-1234567890ABCDEF";  // hardcoded secret - should be detected as high/critical

function getUserById(userId) {
  // SQL injection vulnerability
  const query = `SELECT * FROM users WHERE id = ${userId}`;
  // pretend db call
  return `executing: ${query}`;
}

function runUnsafe(code) {
  // dangerous function - eval
  return eval(code);
}

module.exports = { getUserById, runUnsafe, API_KEY };
