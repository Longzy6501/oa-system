# -*- coding: utf-8 -*-
"""
主 OAuth 账号管理 —— 独立后端服务器
零第三方依赖：Python 标准库（http.server + sqlite3）。
启动后访问 http://localhost:8080
默认账号：admin / admin123
"""
import os
import json
import time
import threading
import secrets
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from datetime import datetime, timedelta

import db

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, "web")
PORT = int(os.environ.get("PORT") or os.environ.get("OA_PORT") or "8080")
HOST = os.environ.get("OA_HOST", "0.0.0.0")
SESSION_COOKIE = "oa_session"

MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".ico": "image/x-icon",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".json": "application/json; charset=utf-8",
}

# ---------------- 序列化 ----------------
def setting_get(conn, key, default=None):
    row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return json.loads(row["value"]) if row else default

def setting_save(conn, key, value):
    conn.execute("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)",
                 (key, json.dumps(value)))
    conn.commit()

def user_public(conn, row):
    """用户对象（列表/详情用）。"""
    today = datetime.now().strftime("%Y-%m-%d")
    acc_n = conn.execute("SELECT COUNT(*) c FROM accounts WHERE owner_user_id=? AND deleted_at IS NULL",
                         (row["id"],)).fetchone()["c"]
    added_n = conn.execute("SELECT COUNT(*) c FROM accounts WHERE owner_user_id=? AND uploaded_at LIKE ?",
                           (row["id"], today + "%")).fetchone()["c"]
    cost = conn.execute("SELECT COALESCE(SUM(standard_cost),0) s FROM accounts WHERE owner_user_id=? AND deleted_at IS NULL",
                        (row["id"],)).fetchone()["s"]
    return {
        "id": row["id"],
        "username": row["username"],
        "displayName": row["display_name"],
        "role": row["role"],
        "siteId": row["site_id"],
        "active": bool(row["enabled"]),
        "accounts": acc_n,
        "addedToday": added_n,
        "accountCost": round(cost, 2),
        "sub2apiPriority": max(1, row["priority"] // 10 or 2),
        "sub2apiModelPriority": 1,
        "usageCostFactor": 1,
        "usageCostVisible": bool(row["usage_cost_visible"]),
        "realtimeMetricsVisible": bool(row["realtime_metrics_visible"]),
        "settlementPrice": row["settlement_price"],
        "note": row["note"],
        "runtimeConfig": {},
        "effectiveRuntimeConfig": {},
        "createdAt": row["created_at"],
    }

def user_self(row):
    """当前登录用户（me）。"""
    return {
        "id": row["id"],
        "username": row["username"],
        "displayName": row["display_name"],
        "role": row["role"],
        "siteId": row["site_id"],
        "enabled": bool(row["enabled"]),
        "usageCostVisible": bool(row["usage_cost_visible"]),
        "realtimeMetricsVisible": bool(row["realtime_metrics_visible"]),
        "settlementPrice": row["settlement_price"],
        "note": row["note"],
    }

CATEGORY_LABEL = {"healthy": "正常", "unschedulable": "暂不可调度", "error": "错误"}
REFUND_LABEL = {"pending": "待处理", "requested": "已申请退款", "refunded": "已成功退款", "archived": "已归档"}

def account_public(row):
    owner = None
    if row["owner_user_id"]:
        conn = db.get_conn()
        u = conn.execute("SELECT username FROM users WHERE id=?", (row["owner_user_id"],)).fetchone()
        conn.close()
        if u:
            owner = {"id": row["owner_user_id"], "username": u["username"]}
    return {
        "id": row["id"],
        "localAccountId": row["local_account_id"] or row["id"],
        "name": row["name"],
        "siteId": row["site_id"],
        "category": row["category"],
        "categoryLabel": CATEGORY_LABEL.get(row["category"], row["category"]),
        "issue": row["issue"] or "",
        "billingPrice": row["billing_price"],
        "billingTag": row["billing_tag"] or "",
        "owner": owner,
        "note": row["note"] or "",
        "usage": {"requests": row["requests"], "standardCost": row["standard_cost"]},
        "limits": {},
        "canDelete": bool(row["can_delete"]),
        "reauthAllowed": bool(row["reauth_allowed"]),
        "schedulable": bool(row["schedulable"]),
        "uploadedAt": row["uploaded_at"],
        "lastUsedAt": row["last_used_at"],
        "detectedAt": row["detected_at"],
        "deletedAt": row["deleted_at"],
        "refundState": row["refund_state"],
        "refundStateLabel": REFUND_LABEL.get(row["refund_state"], "") if row["refund_state"] else "",
        "survivalSeconds": row["survival_seconds"] or 0,
        "tempUnschedulableUntil": row["temp_unschedulable_until"],
    }

# ---------------- 后台任务（上号处理） ----------------
def parse_account_line(line):
    """解析 '邮箱----[类型----]sk-ant-...' 格式，返回 (name, billing_tag, session_key)。"""
    line = line.strip()
    if "----" not in line:
        return line, "Pro", None
    parts = [p.strip() for p in line.split("----")]
    name = parts[0] or line
    sk = next((p for p in parts if p.startswith("sk-ant-")), None)
    billing = parts[1] if len(parts) >= 3 and parts[1] else "Pro"
    return name, billing, sk

def process_add_job(job_id, lines, owner_user_id):
    conn = db.get_conn()
    def update(progress, result=None, status="running"):
        conn.execute("UPDATE jobs SET status=?, progress=?, result=?, updated_at=? WHERE id=?",
                     (status, json.dumps(progress),
                      json.dumps(result) if result else None, db.now_iso(), job_id))
        conn.commit()
    total = len(lines)
    update({"progress": {"percent": 0, "current": 0, "total": total, "message": "开始处理"}})
    time.sleep(0.5)
    success = 0
    failed = 0
    t = db.now_iso()
    for i, line in enumerate(lines):
        if not line.strip():
            failed += 1
            continue
        name, billing, sk = parse_account_line(line)
        try:
            conn.execute("""INSERT INTO accounts(name,site_id,category,billing_price,billing_tag,
                owner_user_id,note,requests,standard_cost,uploaded_at,last_used_at,survival_seconds,created_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (name, "main", "healthy", 5.0, billing, owner_user_id,
                 (f"session: {sk}" if sk else ""), 0, 0, t, t, 0, t))
            success += 1
        except Exception:
            failed += 1
        pct = round((i+1)/total*100)
        update({"progress": {"percent": pct, "current": i+1, "total": total,
                             "success": success, "failed": failed, "message": f"处理中 {i+1}/{total}"}})
        time.sleep(0.15)
    status = "done" if failed == 0 else "done_with_errors"
    update({"progress": {"percent": 100, "current": total, "total": total,
                         "success": success, "failed": failed, "message": "完成"}},
           {"kind": "add", "summary": {"success": success, "failed": failed}}, status)
    conn.close()

# ---------------- 请求处理器 ----------------
class Handler(BaseHTTPRequestHandler):
    server_version = "OAStandalone/1.0"
    current_user = None
    session_row = None

    def log_message(self, *a):
        pass

    # ---- 工具 ----
    def send_json(self, obj, status=200, extra_headers=None):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra_headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def read_body(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    def query(self):
        pr = urllib.parse.urlparse(self.path)
        return urllib.parse.parse_qs(pr.query), pr

    def authenticate(self):
        """解析 session cookie。成功返回 True。"""
        cookie = self.headers.get("Cookie", "")
        token = None
        for part in cookie.split(";"):
            if "=" in part:
                k, v = part.split("=", 1)
                if k.strip() == SESSION_COOKIE:
                    token = v.strip()
        if not token:
            return False
        conn = db.get_conn()
        row = conn.execute("SELECT * FROM sessions WHERE token=?", (token,)).fetchone()
        if not row:
            conn.close()
            return False
        user = conn.execute("SELECT * FROM users WHERE id=? AND enabled=1", (row["user_id"],)).fetchone()
        conn.close()
        if not user:
            return False
        self.session_row = row
        self.current_user = user
        return True

    def check_csrf(self):
        sent = self.headers.get("X-CSRF-Token", "")
        return bool(sent) and secrets.compare_digest(sent, self.session_row["csrf"])

    def require_auth(self):
        if not self.authenticate():
            self.send_json({"ok": False, "error": "请先登录"}, 401)
            return False
        return True

    # ---- 静态文件 ----
    def serve_static(self, path):
        if path == "/" or path == "":
            path = "/index.html"
        rel = path.lstrip("/")
        # 防目录穿越
        full = os.path.normpath(os.path.join(WEB_DIR, rel))
        if not full.startswith(WEB_DIR) or not os.path.isfile(full):
            self.send_error(404)
            return
        ext = os.path.splitext(full)[1].lower()
        ctype = MIME.get(ext, "application/octet-stream")
        with open(full, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    # ---- 路由入口 ----
    def do_GET(self):
        q, pr = self.query()
        path = pr.path
        if path.startswith("/api/"):
            self.handle_api("GET", path, q)
        else:
            self.serve_static(path)

    def do_POST(self):
        _, pr = self.query()
        self.handle_api("POST", pr.path, None)

    def do_PATCH(self):
        _, pr = self.query()
        self.handle_api("PATCH", pr.path, None)

    def do_DELETE(self):
        _, pr = self.query()
        self.handle_api("DELETE", pr.path, None)

    # ================= API =================
    def handle_api(self, method, path, q):
        try:
            self.route(method, path, q)
        except Exception as e:
            self.send_json({"ok": False, "error": f"服务器错误: {e}"}, 500)

    def quota_payload(self, conn):
        sites = setting_get(conn, "sites", [{"id": "main", "label": "主站"}])
        q = setting_get(conn, "quota", {"main": {"deficit": 0, "reserved": 0, "available": 0}})
        site_quotas = []
        for s in sites:
            sq = q.get(s["id"], {"deficit": 0, "reserved": 0, "available": 0})
            site_quotas.append({"siteId": s["id"], **sq})
        main = q.get("main", {"deficit": 0, "reserved": 0, "available": 0})
        return sites, main, site_quotas

    def me_payload(self, conn):
        sites, main, site_quotas = self.quota_payload(conn)
        return {
            "user": user_self(self.current_user),
            "csrfToken": self.session_row["csrf"],
            "siteQuota": main,
            "siteQuotas": site_quotas,
            "sites": sites,
            "onboardingProgress": [],
            "targetServer": setting_get(conn, "target_server", {"id": "", "label": "自动分配", "options": []}),
            "addDefaults": setting_get(conn, "add_defaults", {}),
            "dailyDisplaySnapshotsEnabled": False,
        }

    def route(self, method, path, q):
        conn = db.get_conn()

        # ---------- 认证 ----------
        if path == "/api/login" and method == "POST":
            body = self.read_body()
            username = (body.get("username") or "").strip()
            password = body.get("password") or ""
            row = conn.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
            if not row or not row["enabled"] or not db.verify_password(password, row["password_salt"], row["password_hash"]):
                conn.close()
                self.send_json({"ok": False, "error": "用户名或密码错误"}, 401)
                return
            token = secrets.token_hex(32)
            csrf = secrets.token_hex(16)
            conn.execute("INSERT INTO sessions(token,user_id,csrf,created_at) VALUES(?,?,?,?)",
                         (token, row["id"], csrf, db.now_iso()))
            conn.commit()
            self.session_row = {"csrf": csrf}
            self.current_user = row
            payload = self.me_payload(conn)
            conn.close()
            self.send_json(payload, extra_headers={"Set-Cookie":
                f"{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax"})
            return

        if path == "/api/logout" and method == "POST":
            if self.authenticate():
                conn.execute("DELETE FROM sessions WHERE token=?", (self.session_row["token"],))
                conn.commit()
            conn.close()
            self.send_json({"ok": True}, extra_headers={
                "Set-Cookie": f"{SESSION_COOKIE}=; Path=/; Max-Age=0"})
            return

        if path == "/api/me" and method == "GET":
            if not self.require_auth():
                return
            self.send_json(self.me_payload(conn))
            conn.close()
            return

        # ---------- 以下全部需要登录 ----------
        if not self.require_auth():
            conn.close()
            return
        if method in ("POST", "PATCH", "DELETE") and not self.check_csrf():
            conn.close()
            self.send_json({"ok": False, "error": "安全校验失败（CSRF）"}, 403)
            return

        body = self.read_body() if method in ("POST", "PATCH") else {}

        # ---------- 用户 ----------
        if path == "/api/users" and method == "GET":
            rows = conn.execute("SELECT * FROM users ORDER BY id").fetchall()
            sites, main, site_quotas = self.quota_payload(conn)
            self.send_json({"items": [user_public(conn, r) for r in rows],
                            "sites": sites, "siteQuota": main, "siteQuotas": site_quotas})
        elif path == "/api/users/options" and method == "GET":
            rows = conn.execute("SELECT id,username,role,site_id,enabled FROM users ORDER BY id").fetchall()
            sites = setting_get(conn, "sites", [])
            self.send_json({"items": [{"id": r["id"], "username": r["username"], "role": r["role"],
                                       "siteId": r["site_id"], "active": bool(r["enabled"])} for r in rows],
                            "sites": sites})
        elif path == "/api/users" and method == "POST":
            uname = (body.get("username") or "").strip()
            pwd = body.get("password") or secrets.token_hex(6)
            if not uname:
                self.send_json({"ok": False, "error": "用户名不能为空"}, 400)
                return
            salt, ph = db.hash_password(pwd)
            cur = conn.execute("""INSERT INTO users(username,display_name,password_salt,password_hash,
                role,site_id,created_at) VALUES(?,?,?,?,?,?,?)""",
                (uname, body.get("displayName",""), salt, ph,
                 body.get("role","user"), body.get("siteId","main"), db.now_iso()))
            conn.commit()
            row = conn.execute("SELECT * FROM users WHERE id=?", (cur.lastrowid,)).fetchone()
            self.send_json({"ok": True, "item": user_public(conn, row), "password": pwd})
        elif path.startswith("/api/users/") and method in ("PATCH", "DELETE"):
            uid = path.split("/")[3]
            row = conn.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
            if not row:
                self.send_json({"ok": False, "error": "用户不存在"}, 404)
                return
            if method == "DELETE":
                conn.execute("DELETE FROM users WHERE id=?", (uid,))
                conn.commit()
                self.send_json({"ok": True})
            else:
                conn.execute("""UPDATE users SET role=COALESCE(?,role), site_id=COALESCE(?,site_id),
                    enabled=COALESCE(?,enabled), priority=COALESCE(?,priority),
                    realtime_metrics_visible=COALESCE(?,realtime_metrics_visible), note=COALESCE(?,note)
                    WHERE id=?""",
                    (body.get("role"), body.get("siteId"),
                     (1 if body.get("active") else 0) if "active" in body else None,
                     body.get("priority"),
                     (1 if body.get("realtimeMetricsVisible") else 0) if "realtimeMetricsVisible" in body else None,
                     body.get("note"), uid))
                if body.get("password"):
                    salt, ph = db.hash_password(body["password"])
                    conn.execute("UPDATE users SET password_salt=?,password_hash=? WHERE id=?", (salt, ph, uid))
                conn.commit()
                row = conn.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
                self.send_json({"ok": True, "item": user_public(conn, row)})

        # ---------- 设置 ----------
        elif path == "/api/settings" and method == "GET":
            sites, main, site_quotas = self.quota_payload(conn)
            controls = [{"siteId": s["id"], "label": s.get("label"),
                         "siteEnabled": True, "dataSourceAvailable": True,
                         "automationEnabled": True, "newAccountSchedulable": True,
                         "quotaAutoTopup": {"enabled": False, "targetDeficit": 0}}
                        for s in sites]
            self.send_json({
                "sites": sites, "siteQuota": main, "siteQuotas": site_quotas,
                "onboardingProgress": [],
                "targetServer": setting_get(conn, "target_server", {"id":"","label":"自动分配","options":[]}),
                "addDefaults": setting_get(conn, "add_defaults", {}),
                "sub2apiCapacityAutomation": setting_get(conn, "capacity_automation", {}),
                "sub2apiSiteControls": controls,
            })
        elif path == "/api/settings/add-defaults" and method == "PATCH":
            d = setting_get(conn, "add_defaults", {})
            d.update({k: body[k] for k in ("sub2apiConcurrency","isthmusMaxProcs") if k in body})
            setting_save(conn, "add_defaults", d)
            self.send_json({"ok": True, "addDefaults": d})
        elif path == "/api/settings/target-server" and method == "PATCH":
            d = setting_get(conn, "target_server", {"id":"","label":"自动分配","options":[]})
            sid = body.get("serverId","")
            srow = conn.execute("SELECT name FROM servers WHERE id=?", (sid,)).fetchone()
            d = {"id": sid, "label": srow["name"] if srow else "自动分配", "options": []}
            setting_save(conn, "target_server", d)
            self.send_json({"ok": True, "targetServer": d})
        elif path == "/api/settings/sub2api-capacity-automation" and method == "PATCH":
            d = setting_get(conn, "capacity_automation", {})
            d.update({k: body[k] for k in ("enabled","threshold","scaleDownThreshold") if k in body})
            setting_save(conn, "capacity_automation", d)
            self.send_json({"ok": True, "capacityAutomation": d})
        elif path.startswith("/api/settings/sub2api-") and method == "PATCH":
            self.send_json({"ok": True, **body})

        # ---------- 配额 ----------
        elif path == "/api/quota" and method == "PATCH":
            site_id = body.get("siteId","main")
            q = setting_get(conn, "quota", {})
            sq = q.get(site_id, {"deficit":0,"reserved":0,"available":0})
            sq["deficit"] = body.get("deficit", sq["deficit"])
            sq["available"] = sq["deficit"] - sq["reserved"]
            q[site_id] = sq
            setting_save(conn, "quota", q)
            _, _, site_quotas = self.quota_payload(conn)
            self.send_json({"ok": True, "siteQuotas": site_quotas})

        # ---------- 账号列表 ----------
        elif path == "/api/accounts" and method == "GET":
            self.list_accounts(conn, q)

        # ---------- 上号 ----------
        elif path == "/api/add" and method == "POST":
            raw = body.get("raw","")
            lines = [l for l in raw.replace("\r","\n").split("\n") if l.strip()]
            owner = body.get("ownerUserId") or self.current_user["id"]
            cur = conn.execute("""INSERT INTO jobs(kind,status,request,progress,requested_count,
                owner_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)""",
                ("add","queued",json.dumps({"lines":len(lines)}),
                 json.dumps({"progress":{"percent":0,"current":0,"total":len(lines)}}),
                 len(lines), owner, db.now_iso(), db.now_iso()))
            conn.commit()
            job_id = cur.lastrowid
            threading.Thread(target=process_add_job, args=(job_id, lines, owner), daemon=True).start()
            self.send_json({"ok": True, "jobId": job_id, "queuedCount": len(lines),
                            "requestedCount": len(lines)})
        elif path in ("/api/sk-auth-batches",) and method == "POST":
            # SK 授权批处理：本地无外部服务，按普通上号处理
            raw = body.get("raw","")
            lines = [l for l in raw.replace("\r","\n").split("\n") if l.strip()]
            owner = self.current_user["id"]
            cur = conn.execute("""INSERT INTO jobs(kind,status,request,progress,requested_count,
                owner_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)""",
                ("add","queued",None,json.dumps({"progress":{"percent":0,"total":len(lines)}}),
                 len(lines), owner, db.now_iso(), db.now_iso()))
            conn.commit()
            job_id = cur.lastrowid
            threading.Thread(target=process_add_job, args=(job_id, lines, owner), daemon=True).start()
            self.send_json({"ok": True, "jobId": job_id, "queuedCount": len(lines),
                            "requestedCount": len(lines), "reused": False})

        # ---------- 账号导入 ----------
        elif path == "/api/accounts/import-lines" and method == "POST":
            lines = [l for l in (body.get("raw","") or "").split("\n") if l.strip()]
            self.send_json({"ok": True, "items": [{"name": l.strip()} for l in lines]})

        # ---------- 账号详情/操作 ----------
        elif path.startswith("/api/accounts/") and method in ("GET","PATCH","POST","DELETE"):
            self.account_sub(conn, method, path, body)

        # ---------- 代理池 ----------
        elif path == "/api/proxy-pool" and method == "GET":
            cap = setting_get(conn, "proxy_pool", {"capacity":0,"used":0})
            free = conn.execute("SELECT COUNT(*) c FROM proxies WHERE used=0").fetchone()["c"]
            self.send_json({"summary": {"capacity": cap.get("capacity",0),
                                        "used": cap.get("used",0), "available": free}})

        # ---------- 任务 ----------
        elif path == "/api/jobs" and method == "GET":
            rows = conn.execute("SELECT * FROM jobs WHERE kind='add' ORDER BY id DESC LIMIT 50").fetchall()
            self.send_json({"items": [job_public(r) for r in rows]})
        elif path.startswith("/api/jobs/") and method == "GET":
            jid = path.split("/")[3]
            row = conn.execute("SELECT * FROM jobs WHERE id=?", (jid,)).fetchone()
            self.send_json({"items": [job_public(row)] if row else []})
        elif path == "/api/delete-jobs" and method == "GET":
            rows = conn.execute("SELECT * FROM jobs WHERE kind='delete' ORDER BY id DESC LIMIT 50").fetchall()
            self.send_json({"items": [job_public(r) for r in rows]})
        elif path.startswith("/api/delete-jobs/") and method == "GET":
            jid = path.split("/")[3]
            row = conn.execute("SELECT * FROM jobs WHERE id=?", (jid,)).fetchone()
            self.send_json({"items": [job_public(row)] if row else []})
        elif path.startswith("/api/account-liveness-jobs") and method == "GET":
            self.send_json({"items": []})
        elif path.startswith("/api/account-liveness-preview") and method == "GET":
            self.send_json({"ok": True, "items": []})

        # ---------- 服务器 ----------
        elif path == "/api/server-load" and method == "GET":
            self.send_json({"items": self.server_loads(conn)})

        # ---------- 实时指标 ----------
        elif path == "/api/realtime-metrics" and method == "GET":
            qs = (q or {})
            site = qs.get("site", [""])[0]
            owner = qs.get("owner", [""])[0]
            self.send_json(self.realtime_metrics(conn, site, owner))

        # ---------- 统计（空结构） ----------
        elif path in ("/api/auth-statistics",) and method == "GET":
            self.send_json({"items": [], "summary": {}, "rows": []})
        elif path.startswith("/api/daily-additions") and method == "GET":
            self.send_json({"items": [], "summary": {}})
        elif path.startswith("/api/daily-display-snapshot") and method in ("GET","POST"):
            self.send_json({"items": [], "summary": {}})
        elif path.startswith("/api/weekly-resets") and method == "GET":
            self.send_json({"items": [], "summary": {}})

        # ---------- 授权会话/批处理（空） ----------
        elif path.startswith(("/api/reauth-sessions","/api/reauth-batches",
                             "/api/auth-sessions","/api/auth-batches")):
            self.send_json({"items": []})
        elif path.startswith("/api/client-auth-intents"):
            self.send_json({"items": []})

        # ---------- 请求质量 / IP ----------
        elif path.startswith("/api/request-quality"):
            self.send_json({"items": [], "sites": [], "summary": {}})
        elif path.startswith("/api/request-ips"):
            if path.startswith("/api/request-ips/status"):
                self.send_json({"sites": []})
            else:
                self.send_json({"items": [], "summary": {}})

        # ---------- 账号错误 ----------
        elif path.startswith("/api/account-errors"):
            self.send_json({"items": [], "summary": {}})

        # ---------- Claude SK（空） ----------
        elif path.startswith("/api/admin/claude-sk") or path.startswith("/api/claude-sk"):
            self.send_json({"items": []})

        # ---------- 结算费率 / 价格 / 退款（空或基础） ----------
        elif path.startswith("/api/admin/settlement-rates"):
            self.send_json({"items": [], "current": None, "scheduled": [], "history": []})
        elif path.startswith("/api/admin/account-prices"):
            self.send_json({"ok": True, "items": []})
        elif path.startswith("/api/admin/refunds"):
            self.send_json({"ok": True, "items": []})
        elif path.startswith("/api/admin/refunded-accounts"):
            self.send_json({"ok": True})
        elif path.startswith("/api/proxy-swaps"):
            self.send_json({"items": []})

        else:
            self.send_json({"ok": False, "error": f"接口未实现: {path}"}, 404)
        conn.close()

    # ---------------- 账号列表查询 ----------------
    def list_accounts(self, conn, q):
        q = {k: v[0] for k, v in (q or {}).items()}
        view = q.get("view", "all")
        category = q.get("category", "all")
        search = q.get("q", "").strip()
        sort = q.get("sort", "added_desc")
        page = max(1, int(q.get("page", 1)))
        page_size = int(q.get("page_size", 20))
        owner = q.get("owner", "")
        site = q.get("site", "")

        where, args = [], []
        if view == "dead":
            where.append("deleted_at IS NOT NULL")
            rs = q.get("refund_state","")
            if rs:
                where.append("refund_state=?"); args.append(rs)
        else:
            where.append("deleted_at IS NULL")
            if category in ("healthy","unschedulable","error"):
                where.append("category=?"); args.append(category)
        if search:
            where.append("name LIKE ?"); args.append(f"%{search}%")
        if owner:
            where.append("owner_user_id=?"); args.append(owner)
        if site:
            where.append("site_id=?"); args.append(site)

        wsql = " WHERE " + " AND ".join(where)
        total = conn.execute("SELECT COUNT(*) c FROM accounts"+wsql, args).fetchone()["c"]
        summ = conn.execute("""SELECT COALESCE(SUM(requests),0) requests,
            COALESCE(SUM(standard_cost),0) cost, COUNT(*) total FROM accounts"""+wsql,
            args).fetchone()
        today = datetime.now().strftime("%Y-%m-%d")
        today_add = conn.execute("SELECT COUNT(*) c FROM accounts WHERE uploaded_at LIKE ?",
                                 (today+"%",)).fetchone()["c"]

        order = {"added_desc":"id DESC","cost_desc":"standard_cost DESC","requests_desc":"requests DESC",
                 "deleted_desc":"deleted_at DESC"}.get(sort, "id DESC")
        pages = max(1, (total + page_size - 1)//page_size)
        rows = conn.execute("SELECT * FROM accounts"+wsql+f" ORDER BY {order} LIMIT ? OFFSET ?",
                            args + [page_size, (page-1)*page_size]).fetchall()
        self.send_json({
            "items": [account_public(r) for r in rows],
            "pagination": {"page": page, "pages": pages, "total": total, "page_size": page_size},
            "summary": {"requests": summ["requests"], "standardCost": summ["cost"],
                        "todayAdditions": today_add, "unlimitedAccounts": 0},
            "deletableCount": conn.execute("SELECT COUNT(*) c FROM accounts WHERE category='error' AND deleted_at IS NULL").fetchone()["c"],
            "adminRefundCounts": {"requested":0,"refunded":0},
            "refundedPurgeCount": 0,
        })

    # ---------------- 账号子操作 ----------------
    def account_sub(self, conn, method, path, body):
        parts = path.strip("/").split("/")
        # /api/accounts/{id}/...
        aid = parts[2]
        row = conn.execute("SELECT * FROM accounts WHERE id=?", (aid,)).fetchone()
        sub = parts[3] if len(parts) > 3 else ""

        if not sub and method == "GET":
            self.send_json({"item": account_public(row) if row else None})
            return
        if not row:
            self.send_json({"ok": False, "error": "账号不存在"}, 404)
            return

        if sub == "note" and method == "PATCH":
            note = body.get("note","")
            conn.execute("UPDATE accounts SET note=? WHERE id=?", (note, aid))
            conn.commit()
            self.send_json({"ok": True, "note": note})
        elif sub == "owner" and method == "PATCH":
            uid = body.get("ownerUserId")
            conn.execute("UPDATE accounts SET owner_user_id=? WHERE id=?", (uid, aid))
            conn.commit()
            row = conn.execute("SELECT * FROM accounts WHERE id=?", (aid,)).fetchone()
            self.send_json({"ok": True, "item": account_public(row)})
        elif sub == "usage" and method == "GET":
            self.send_json({"item": {"requests": row["requests"], "standardCost": row["standard_cost"]}})
        elif sub == "refund" and method == "POST":
            conn.execute("UPDATE accounts SET refund_state='requested' WHERE id=?", (aid,))
            conn.commit()
            self.send_json({"ok": True, "refundState": "requested"})
        elif sub in ("proxy-swap",) and method in ("GET","POST"):
            self.send_json({"items": [], "job": None})
        elif sub == "request-events" and method == "GET":
            self.send_json({"items": []})
        elif sub == "bulk-delete" and method == "POST":
            self.send_json({"ok": True, "jobId": None})
        elif sub == "usage-windows" and method == "GET":
            self.send_json({"items": {}})
        else:
            self.send_json({"ok": False, "error": f"账号操作未实现: {sub}"}, 404)

    # ---------------- 服务器负载 ----------------
    def server_loads(self, conn):
        out = []
        for s in conn.execute("SELECT * FROM servers WHERE enabled=1").fetchall():
            mem = s["memory_bytes"] or 16*1024**3
            disk = s["disk_bytes"] or 100*1024**3
            out.append({
                "id": s["id"], "label": s["label"] or s["name"], "host": s["host"],
                "ok": True, "level": "online", "complete": True,
                "instanceCount": 5, "totalVMCount": 5, "reportedVMCount": 5,
                "cpu": {"cores": s["cpu_cores"], "load1": 0.8},
                "memory": {"usedBytes": int(mem*0.4), "totalBytes": mem},
                "swap": {"usedBytes": 0, "totalBytes": mem},
                "disk": {"usedBytes": int(disk*0.5), "totalBytes": disk},
                "collectedAt": db.now_iso(), "elapsed": 0.1,
            })
        return out

    # ---------------- 实时指标 ----------------
    def realtime_metrics(self, conn, site, owner):
        w = ["deleted_at IS NULL"]
        args = []
        if site:
            w.append("site_id=?"); args.append(site)
        if owner:
            w.append("owner_user_id=?"); args.append(owner)
        wsql = " WHERE " + " AND ".join(w)
        total = conn.execute("SELECT COUNT(*) c FROM accounts"+wsql, args).fetchone()["c"]
        healthy = conn.execute("SELECT COUNT(*) c FROM accounts"+wsql+" AND category='healthy'",
                               args).fetchone()["c"]
        t = db.now_iso()
        return {
            "scope": {"kind": "admin", "site": site, "owner": owner,
                      "label": "全部站点" if not site else site},
            "rpm": 0, "tpm": 0, "stale": False,
            "sampledAt": t, "usageSampledAt": t,
            "coverage": {
                "includedSites": [{"siteId": "main", "label": "主站"}],
                "capacitySites": [{"siteId": "main"}],
                "usageSites": [{"siteId": "main"}],
                "excludedSites": [],
            },
            "quality": {"capacity": "complete", "usage": "complete"},
            "sites": [],
            "accounts": {"totalOwned": total, "running": healthy, "accepting": healthy,
                         "modelLimited": 0, "f5Limited": 0, "f5Eligible": healthy,
                         "strictEligible": healthy, "accountLimited": 0,
                         "temporaryLimited": 0, "telemetryMissing": 0},
            "concurrency": {"current": 0, "capacity": 0, "remaining": 0, "waiting": 0},
        }

def job_public(row):
    if not row:
        return None
    return {
        "id": row["id"], "kind": row["kind"], "status": row["status"],
        "progress": json.loads(row["progress"]) if row["progress"] else {},
        "result": json.loads(row["result"]) if row["result"] else None,
        "error": row["error"], "requestedCount": row["requested_count"],
        "accountId": row["account_id"], "accountName": row["account_name"],
        "batchId": row["batch_id"], "createdAt": row["created_at"],
    }

def main():
    db.init_db()
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print("=" * 56)
    print("  主 OAuth 账号管理（独立版）已启动")
    print(f"  监听：{HOST}:{PORT}")
    print(f"  本机访问：http://localhost:{PORT}")
    print("  默认账号：admin / admin123")
    print("=" * 56)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()
