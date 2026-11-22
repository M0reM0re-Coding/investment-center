"""Set (or reset) a website login password, without sending any email.

Run on your PC from the "Investment Center" folder:
  python robot/set_password.py                 (your own account)
  python robot/set_password.py someone@email   (another existing account)

You type the password in this terminal; it is hidden and never stored in any file.
Uses the Supabase secret key from .env (admin access), so only run it on your own PC.
"""
import getpass
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from analyze import load_env  # noqa: E402


def admin(method, path, body=None):
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    req = urllib.request.Request(
        os.environ["SUPABASE_URL"].rstrip("/") + "/auth/v1/admin/" + path,
        data=json.dumps(body).encode() if body is not None else None, method=method,
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read() or b"{}")


def main():
    load_env()
    if len(sys.argv) > 1:
        email = sys.argv[1].strip().lower()
        users = admin("GET", "users?per_page=200").get("users", [])
        match = [u for u in users if (u.get("email") or "").lower() == email]
        if not match:
            sys.exit("No account with that email. They need to be invited first (Supabase > Authentication > Users).")
        uid, who = match[0]["id"], email
    else:
        uid, who = os.environ.get("OWNER_USER_ID"), "your account"
        if not uid:
            sys.exit("OWNER_USER_ID missing in .env")

    print(f"Setting a new password for {who}.")
    pw = getpass.getpass("New password (at least 8 characters, hidden): ")
    if len(pw) < 8:
        sys.exit("Too short. Use at least 8 characters.")
    if getpass.getpass("Type it again: ") != pw:
        sys.exit("The two passwords don't match. Nothing changed.")
    try:
        admin("PUT", f"users/{uid}", {"password": pw})
    except urllib.error.HTTPError as e:
        sys.exit(f"Supabase refused: HTTP {e.code} {e.read().decode(errors='replace')[:200]}")
    print("Done. Log in on the website with your email and this password.")


if __name__ == "__main__":
    main()
