"""Check that every key in .env works. Prints only pass/fail, never the keys themselves.

Run from the "Investment Center" folder:
  python robot/check_keys.py
"""
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from analyze import load_env  # reuse the same .env reader


def get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, {}
    except Exception as e:
        return None, {"error": type(e).__name__}


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    load_env()
    env = os.environ

    print("GEMINI")
    if not env.get("GEMINI_API_KEY"):
        print("  missing GEMINI_API_KEY")
    else:
        code, data = get("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200",
                         {"x-goog-api-key": env["GEMINI_API_KEY"]})
        if code == 200:
            names = [m["name"].replace("models/", "") for m in data.get("models", [])
                     if "generateContent" in m.get("supportedGenerationMethods", [])]
            flash = [n for n in names if "flash" in n and "image" not in n and "tts" not in n and "live" not in n]
            print(f"  ok: key works, {len(names)} text models available")
            print(f"  flash models: {', '.join(flash[:12])}")
        else:
            print(f"  FAIL: HTTP {code} {data.get('error', '')}")

    print("SUPABASE")
    url, key = env.get("SUPABASE_URL", "").rstrip("/"), env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url:
        print("  missing SUPABASE_URL")
    if not key:
        print("  missing SUPABASE_SERVICE_ROLE_KEY")
    elif not key.startswith("sb_secret_"):
        print("  note: key does not start with sb_secret_ (is it the secret key?)")
    if url and key:
        code, _ = get(f"{url}/rest/v1/", {"apikey": key})
        print(f"  {'ok: connected' if code == 200 else f'FAIL: HTTP {code}'}")

    print("TELEGRAM")
    tok = env.get("TELEGRAM_BOT_TOKEN", "")
    if not tok:
        print("  missing TELEGRAM_BOT_TOKEN")
    else:
        code, me = get(f"https://api.telegram.org/bot{tok}/getMe")
        if code != 200:
            print(f"  FAIL: token rejected (HTTP {code})")
        else:
            print(f"  ok: bot @{me['result'].get('username')}")
            if env.get("TELEGRAM_CHAT_ID"):
                print("  chat id: already set")
            else:
                _, upd = get(f"https://api.telegram.org/bot{tok}/getUpdates")
                chats = {(u.get("message") or {}).get("chat", {}).get("id") for u in upd.get("result", [])} - {None}
                if chats:
                    print(f"  chat id found: {', '.join(map(str, chats))}  (put this in TELEGRAM_CHAT_ID)")
                else:
                    print("  no chat id yet: send 'hi' to your bot in Telegram, then run this again")


if __name__ == "__main__":
    main()
