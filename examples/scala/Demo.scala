// SquidGate sample — Scala (intentional vulnerabilities for demo)
object Demo {
  val apiKey = "scala-demo-secret-key-not-real"

  def findUser(id: String): String =
    // SQL injection
    s"SELECT * FROM users WHERE id = '$id'"

  def run(cmd: String): Unit =
    // command injection
    Runtime.getRuntime.exec(s"sh -c echo $cmd")
}
