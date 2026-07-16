#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
リマインダー登録の「タイムアウトで登録0件」を直す差し替えモジュール。

原因:
  元のコードは登録前に、リマインダー1件ごとに
  `every reminder of rl whose name is "..."` で重複チェックしていた。
  この whose 照合は iCloud 同期 + 件数が多いと非常に遅く、
  subprocess の timeout=10 を超えて処理全体が中断していた（= 登録0件）。

対策:
  1) 既存の名前を「1回のosascript」でまとめて取得し、Python側の set で重複判定（高速）。
  2) AppleScript を `with timeout` で包み、subprocess 側の timeout も延長。
  3) 値は AppleScript リテラルに埋め込まず argv で渡す（引用符/emoji/バックスラッシュでも壊れない）。

使い方:
  from reminder_register import register_reminders
  items = [
      {
        "name": "📖 第三者保管の要件（3日後）",
        "body": "obsidian://search?vault=...&query=第三者保管の要件",
        "year": 2026, "month": 7, "day": 19, "hour": 8, "minute": 0,
      },
      ...
  ]
  result = register_reminders(items)   # -> {"added": n, "skipped": n, "errors": [...]}
"""

import subprocess

LIST_NAME = "📚 司法試験復習"   # 登録先リスト名（emojiを含めて実際の名前と一致させる）
OSA_TIMEOUT = 120              # subprocess 側の待ち時間（秒）。10 -> 120 に延長


def _run_osascript(script: str, args=None):
    """osascript を実行。値は argv で渡すのでエスケープ不要。"""
    cmd = ["osascript", "-e", script]
    if args:
        cmd.append("--")
        cmd.extend(str(a) for a in args)
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=OSA_TIMEOUT)
    if p.returncode != 0:
        raise RuntimeError(p.stderr.strip() or "osascript failed")
    return p.stdout.strip()


# 既存リマインダー名を「1回」で全部取得（whose を使わないので速い）
_SCRIPT_LIST_NAMES = f'''
with timeout of 110 seconds
    tell application "Reminders"
        launch
        set rl to list "{LIST_NAME}"
        set AppleScript's text item delimiters to linefeed
        set out to (name of reminders of rl) as text
    end tell
end timeout
return out
'''

# 1件追加。argv: name, body, year, month, day, hour, minute
_SCRIPT_ADD = f'''
on run argv
    set theName to item 1 of argv
    set theBody to item 2 of argv
    set y to (item 3 of argv) as integer
    set mo to (item 4 of argv) as integer
    set da to (item 5 of argv) as integer
    set hh to (item 6 of argv) as integer
    set mm to (item 7 of argv) as integer
    with timeout of 110 seconds
        tell application "Reminders"
            launch
            set d to current date
            set day of d to 1          -- 月末→短い月への繰り上がり事故を防ぐ
            set year of d to y
            set month of d to mo
            set day of d to da
            set hours of d to hh
            set minutes of d to mm
            set seconds of d to 0
            tell list "{LIST_NAME}"
                make new reminder with properties {{name:theName, body:theBody, remind me date:d}}
            end tell
        end tell
    end timeout
    return "ok"
end run
'''


def get_existing_names() -> set:
    """登録済みリマインダー名の集合を1回のosascriptで取得。"""
    out = _run_osascript(_SCRIPT_LIST_NAMES)
    return set(n for n in out.split("\n") if n)


def add_reminder(item: dict):
    _run_osascript(_SCRIPT_ADD, [
        item["name"], item.get("body", ""),
        item["year"], item["month"], item["day"],
        item.get("hour", 8), item.get("minute", 0),
    ])


def register_reminders(items):
    """重複を除いて一括登録。既存名は最初に1回だけ取得して高速に判定する。"""
    existing = get_existing_names()
    added, skipped, errors = 0, 0, []
    for it in items:
        if it["name"] in existing:
            skipped += 1
            continue
        try:
            add_reminder(it)
            existing.add(it["name"])   # 同一実行内の重複も防ぐ
            added += 1
        except Exception as e:
            errors.append(f'{it.get("name","?")}: {e}')
    return {"added": added, "skipped": skipped, "errors": errors}


if __name__ == "__main__":
    # 動作確認: 既存名の取得だけ試す（登録はしない）
    try:
        names = get_existing_names()
        print(f'既存リマインダー: {len(names)} 件（取得OK）')
    except Exception as e:
        print(f'取得失敗: {e}')
