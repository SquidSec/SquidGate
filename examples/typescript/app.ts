// SquidGate sample — TypeScript (intentional vulnerabilities for demo)
const SECRET_TOKEN: string = "ghp_TypeScriptDemoTokenNotReal000";

export function findUser(userId: string): string {
  // SQL injection
  return `SELECT * FROM accounts WHERE id = '${userId}'`;
}

export function execute(userInput: string): unknown {
  // dangerous dynamic execution
  return new Function(userInput)();
}

export { SECRET_TOKEN };
