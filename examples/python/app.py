# SquidGate sample — Python (intentional vulnerabilities for demo)
import pickle
import os

AWS_SECRET = "AKIAIOSFODNN7EXAMPLE_python_demo"

def get_user(user_id: str):
    # SQL injection
    query = f"SELECT * FROM users WHERE id = '{user_id}'"
    return query

def load_session(data: bytes):
    # insecure deserialization
    return pickle.loads(data)

def run_cmd(name: str):
    # command injection
    os.system("echo " + name)
