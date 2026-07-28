// SquidGate sample — JavaScript (intentional vulnerabilities for demo)
const API_KEY = "sk-live-js-demo-NOT-A-REAL-KEY-12345";

function getUser(id) {
  // SQL injection via string concat
  const q = "SELECT * FROM users WHERE id = " + id;
  return db.query(q);
}

function run(code) {
  return eval(code); // dangerous
}

module.exports = { getUser, run, API_KEY };
