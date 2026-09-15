// SquidGate sample — Swift (intentional vulnerabilities for demo)
let apiKey = "swift-demo-secret-key-not-real"

func findUser(id: String) -> String {
    // SQL injection
    return "SELECT * FROM users WHERE id = '\(id)'"
}

func runShell(_ input: String) {
    // command injection
    let task = Process()
    task.launchPath = "/bin/sh"
    task.arguments = ["-c", "echo \(input)"]
    task.launch()
}
