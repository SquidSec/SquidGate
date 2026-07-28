// SquidGate sample — Go (intentional vulnerabilities for demo)
package demo

import (
	"database/sql"
	"os/exec"
)

const apiKey = "go-demo-secret-key-not-real"

func FindUser(db *sql.DB, id string) error {
	// SQL injection
	_, err := db.Query("SELECT * FROM users WHERE id = '" + id + "'")
	return err
}

func Run(userInput string) error {
	// command injection
	return exec.Command("sh", "-c", "echo "+userInput).Run()
}
