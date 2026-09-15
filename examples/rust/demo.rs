// SquidGate sample — Rust (intentional vulnerabilities for demo)
use std::process::Command;

const API_KEY: &str = "rust-demo-secret-key-not-real";

pub fn find_user(id: &str) -> String {
    // SQL injection via format!
    format!("SELECT * FROM users WHERE id = '{}'", id)
}

pub fn run_shell(input: &str) {
    // command injection
    Command::new("sh")
        .arg("-c")
        .arg(format!("echo {}", input))
        .status()
        .ok();
}
