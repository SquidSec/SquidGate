// SquidGate sample — Kotlin (intentional vulnerabilities for demo)
const val API_KEY = "kotlin-demo-secret-key-not-real"

fun findUser(id: String): String {
    // SQL injection
    return "SELECT * FROM users WHERE id = '$id'"
}

fun runCmd(name: String) {
    // command injection
    Runtime.getRuntime().exec("sh -c echo $name")
}
