<?php
// SquidGate sample — PHP (intentional vulnerabilities for demo)
$api_key = "php-demo-secret-key-not-real";

function getUser($id) {
    // SQL injection
    $q = "SELECT * FROM users WHERE id = " . $_GET['id'];
    return mysqli_query($GLOBALS['db'], $q);
}

function greet() {
    // XSS
    echo "Hello " . $_GET['name'];
}

function run($code) {
    eval($code); // dangerous
}
