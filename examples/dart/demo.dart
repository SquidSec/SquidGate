// SquidGate sample — Dart (intentional vulnerabilities for demo)
const apiKey = 'dart-demo-secret-key-not-real';

String findUser(String id) {
  // SQL injection
  return "SELECT * FROM users WHERE id = '$id'";
}

void runShell(String input) {
  // dangerous Process pattern (demo)
  // ignore: avoid_print
  print('sh -c echo $input');
}
