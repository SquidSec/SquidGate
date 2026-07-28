#!/usr/bin/env bash
# SquidGate sample — Shell (intentional vulnerabilities for demo)
API_KEY="shell-demo-secret-key-not-real"

find_user() {
  # SQL-ish injection into mysql client
  mysql -e "SELECT * FROM users WHERE id = '$1'"
}

run_user() {
  # command injection
  eval "echo $1"
}
