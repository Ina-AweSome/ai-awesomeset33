"""
scheduler.py のリマインダー登録タイムアウト修正パッチ
─────────────────────────────────────────────────────────────
使い方:
  scheduler.py の末尾、
      def push_spacing_reminders_to_reminders(study_date=None) -> dict:
  から
  ファイル最後の _ensure_reminders_list(...) の終わりまでを、
  この下の「ここから」〜「ここまで」で丸ごと置き換える。

修正点:
  ① 1件ごとの `whose name is` 重複チェック（iCloud同期＋多件数で10秒超→
     TimeoutExpired で登録0件になっていた原因）を撤去。
     既存リマインダー名を1回だけ一括取得し、Python側で高速に重複判定する。
  ② 作成用 AppleScript を `with timeout` で包み、subprocess timeout も延長。
  ③ 1件が詰まっても TimeoutExpired を握って次へ進み、全体を止めない。
  ④ Reminders.app を launch してから操作する。
"""

# ═══════════════ ここから（scheduler.py へ貼り付け） ═══════════════

def push_spacing_reminders_to_reminders(study_date: str = None) -> dict:
    """
    study_date（デフォルト=今日）の学習記録から、
    キーワード1件につき1リマインダーを作成（翌日・3日後・7日後・21日後）。
    ゴミワード（知識不足・読解エラー等）は除外し、キーワード・条文のみ登録。
    リスト名: 📚 司法試験復習
    """
    import re
    from agent import load_logs, _read_claude_sonnet_keywords

    if study_date is None:
        study_date = date.today().isoformat()

    base_date = date.fromisoformat(study_date)
    intervals = [(1, "翌日"), (3, "3日後"), (7, "7日後"), (21, "21日後")]

    all_logs = load_logs()
    today_logs = [lg for lg in all_logs if lg.get("date") == study_date and lg.get("subject")]

    if not today_logs:
        return {"success": False, "error": f"{study_date} の学習ログが見つかりません"}

    # 科目ごとに集計
    JUNK = {"知識不足", "得点喪失", "読解エラー", "理解不十分", "未整理", "条文レベル", "エラー", "問題"}
    subject_map: dict = {}
    for lg in today_logs:
        subj = lg.get("subject", "")
        if not subj:
            continue
        if subj not in subject_map:
            subject_map[subj] = {"qc": 0, "memos": [], "q_range": "", "keywords": []}
        qc = lg.get("questions_count", 0) or 0
        if qc > subject_map[subj]["qc"]:
            subject_map[subj]["qc"] = qc
        memo = lg.get("memo", "") or ""
        if memo:
            subject_map[subj]["memos"].append(memo)

    for subj, info in subject_map.items():
        # Q範囲抽出
        for memo in info["memos"]:
            m = re.search(r'Q\s*(\d+)[〜~\-]+Q?\s*(\d+)', memo)
            if m:
                info["q_range"] = f"Q{m.group(1)}〜Q{m.group(2)}"
                break
        # キーワード取得（ゴミ除外）
        raw_kws = _read_claude_sonnet_keywords(study_date, subject=subj)
        info["keywords"] = [k for k in raw_kws
                            if not any(j in k for j in JUNK) and len(k) >= 2]

    LIST_NAME = "📚 司法試験復習"
    _ensure_reminders_list(LIST_NAME)

    # ── 重複チェックの高速化 ──
    # 旧実装は1件ごとに `whose name is` を osascript で照合していたため、
    # iCloud同期＋多件数で10秒を超え TimeoutExpired → 登録0件になっていた。
    # 既存名を「1回だけ」まとめて取得し、以降は Python の set で判定する。
    existing_names = _get_existing_reminder_names(LIST_NAME)

    created = 0
    errors  = []

    for days, label in intervals:
        remind_date = base_date + timedelta(days=days)
        date_jp     = _date_as(remind_date.isoformat())

        for subj, info in subject_map.items():
            q_ref = info["q_range"]
            body_base = f"{subj} {q_ref}".strip()
            # 復習対象の実ファイル場所（学習日・フォルダ・Obsidianリンク）を追記
            locator = _daily_note_locator(study_date, subj)
            if locator:
                body_base = f"{body_base}\n\n{locator}"

            # キーワードが取れなければQ範囲で1件、それもなければ科目名で1件
            items = info["keywords"] if info["keywords"] else ([q_ref] if q_ref else [subj])

            for item in items:
                remind_title = f"📖 {item}（{label}）"

                # 重複チェック（Python側・高速）。
                # 既存 or 同一実行内で作成済みならスキップ。
                if remind_title in existing_names:
                    continue

                t_esc = remind_title.replace('"', '\\"')
                # 生の改行はAppleScript文字列リテラルを壊すため linefeed 連結に置換
                b_esc = (body_base.replace('"', '\\"')
                                  .replace("\r\n", "\n")
                                  .replace("\n", '" & linefeed & "'))

                script = f"""with timeout of 60 seconds
    tell application "Reminders"
        launch
        set rl to list "{LIST_NAME}"
        set dueDate to date "{date_jp} 8:00:00"
        make new reminder at end of rl with properties {{¬
            name:"{t_esc}", ¬
            due date:dueDate, ¬
            remind me date:dueDate, ¬
            body:"{b_esc}"}}
    end tell
end timeout"""
                try:
                    result = subprocess.run(["osascript", "-e", script],
                                            capture_output=True, text=True, timeout=60)
                except subprocess.TimeoutExpired:
                    # 1件詰まっても全体は止めず次へ
                    errors.append(f"{remind_title}: タイムアウト（この1件のみスキップ）")
                    continue

                if result.returncode == 0:
                    created += 1
                    existing_names.add(remind_title)  # 同一実行内の重複作成を防ぐ
                else:
                    errors.append(f"{remind_title}: {(result.stderr or '').strip()[:60]}")

    if created == 0 and errors:
        return {"success": False, "created": 0, "error": errors[0]}
    return {"success": True, "created": created, "study_date": study_date,
            "subjects": list(subject_map.keys()), "errors": errors[:3]}


def _get_existing_reminder_names(list_name: str) -> set:
    """リスト内の既存リマインダー名を「1回の」osascriptでまとめて取得する。

    旧実装のように1件ずつ `whose name is` で照合すると、iCloud同期＋多件数で
    非常に遅くタイムアウトする。ここで一括取得して Python 側の set で判定する。
    取得に失敗しても空集合を返し、登録処理自体は止めない。
    """
    script = f"""
with timeout of 120 seconds
    tell application "Reminders"
        launch
        set rl to list "{list_name}"
        set AppleScript's text item delimiters to linefeed
        set out to (name of reminders of rl) as text
    end tell
end timeout
return out
"""
    try:
        r = subprocess.run(["osascript", "-e", script],
                           capture_output=True, text=True, timeout=130)
        if r.returncode != 0:
            return set()
        return set(n for n in r.stdout.split("\n") if n.strip())
    except Exception:
        return set()


def _ensure_reminders_list(list_name: str):
    """Remindersアプリに指定名のリストがなければ作成する"""
    script = f"""
with timeout of 30 seconds
    tell application "Reminders"
        launch
        set existing to (every list whose name is "{list_name}")
        if (count of existing) = 0 then
            make new list with properties {{name:"{list_name}"}}
        end if
    end tell
end timeout
"""
    try:
        subprocess.run(["osascript", "-e", script],
                       capture_output=True, text=True, timeout=35)
    except Exception:
        pass

# ═══════════════ ここまで ═══════════════
