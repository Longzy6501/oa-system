# -*- coding: utf-8 -*-
"""SQLite 数据库层：建表、密码哈希、预置数据。零第三方依赖。"""
import os
import sqlite3
import hashlib
import secrets
import json
from datetime import datetime, timedelta

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "data.db")

# ---------- 密码哈希（PBKDF2） ----------
def hash_password(password, salt=None):
    if salt is None:
        salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120000)
    return salt, dk.hex()

def verify_password(password, salt, expected_hash):
    _, got = hash_password(password, salt)
    return secrets.compare_digest(got, expected_hash)

def now_iso():
    return datetime.now().replace(microsecond=0).isoformat()

def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

# ---------- 初始化 ----------
def init_db():
    fresh = not os.path.exists(DB_PATH)
    conn = get_conn()
    c = conn.cursor()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT DEFAULT '',
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      site_id TEXT NOT NULL DEFAULT 'main',
      priority INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      note TEXT DEFAULT '',
      usage_cost_visible INTEGER NOT NULL DEFAULT 0,
      realtime_metrics_visible INTEGER NOT NULL DEFAULT 0,
      settlement_price REAL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions(
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      csrf TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounts(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local_account_id INTEGER,
      name TEXT NOT NULL,
      site_id TEXT NOT NULL DEFAULT 'main',
      category TEXT NOT NULL DEFAULT 'healthy',
      issue TEXT DEFAULT '',
      billing_price REAL,
      billing_tag TEXT DEFAULT '',
      owner_user_id INTEGER,
      note TEXT DEFAULT '',
      requests INTEGER NOT NULL DEFAULT 0,
      standard_cost REAL NOT NULL DEFAULT 0,
      schedulable INTEGER NOT NULL DEFAULT 1,
      can_delete INTEGER NOT NULL DEFAULT 1,
      reauth_allowed INTEGER NOT NULL DEFAULT 1,
      uploaded_at TEXT,
      last_used_at TEXT,
      detected_at TEXT,
      deleted_at TEXT,
      refund_state TEXT,
      survival_seconds INTEGER DEFAULT 0,
      temp_unschedulable_until TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS servers(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      label TEXT DEFAULT '',
      host TEXT DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      cpu_cores INTEGER DEFAULT 4,
      memory_bytes INTEGER DEFAULT 0,
      disk_bytes INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings(
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      request TEXT,
      progress TEXT,
      result TEXT,
      error TEXT DEFAULT '',
      account_id INTEGER,
      account_name TEXT,
      batch_id INTEGER,
      requested_count INTEGER DEFAULT 0,
      owner_user_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS proxies(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    """)
    conn.commit()

    if fresh:
        seed(conn)
    conn.close()
    return fresh

# ---------- 预置数据 ----------
def setting_set(conn, key, value):
    conn.execute("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)",
                 (key, json.dumps(value)))

def seed(conn):
    c = conn.cursor()
    t = now_iso()

    # 账号
    admin_salt, admin_hash = hash_password("admin123")
    c.execute("""INSERT INTO users(username,display_name,password_salt,password_hash,role,site_id,
                 priority,enabled,usage_cost_visible,realtime_metrics_visible,created_at)
                 VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
              ("admin", "系统管理员", admin_salt, admin_hash, "admin", "main",
               100, 1, 1, 1, t))
    u_salt, u_hash = hash_password("user123")
    c.execute("""INSERT INTO users(username,display_name,password_salt,password_hash,role,site_id,
                 priority,enabled,created_at)
                 VALUES(?,?,?,?,?,?,?,?,?)""",
              ("user01", "普通用户", u_salt, u_hash, "user", "main",
               10, 1, t))

    # 服务器
    c.execute("""INSERT INTO servers(name,label,host,enabled,cpu_cores,memory_bytes,disk_bytes,created_at)
                 VALUES(?,?,?,?,?,?,?,?)""",
              ("server-main", "主服务器", "10.0.0.1", 1, 8, 16*1024**3, 100*1024**3, t))

    # 设置
    setting_set(conn, "sites", [
        {"id": "main", "label": "主站", "groupName": "Max", "enabled": True}
    ])
    setting_set(conn, "add_defaults", {
        "sub2apiConcurrency": 8, "isthmusMaxProcs": 10, "sub2apiSchedulable": True
    })
    setting_set(conn, "target_server", {"id": "", "label": "自动分配", "options": []})
    setting_set(conn, "capacity_automation", {"enabled": True, "threshold": 0.35, "scaleDownThreshold": 0.15})
    setting_set(conn, "quota", {"main": {"deficit": 50, "reserved": 0, "available": 50}})
    setting_set(conn, "proxy_pool", {"capacity": 100, "used": 0})

    # 示例账号（首页有内容）
    now = datetime.now()
    sample = []
    for i in range(1, 9):
        up = now - timedelta(hours=i*3)
        sample.append((
            f"acc_demo_{i:03d}", "main", "healthy", "",
            5.0, "Pro", 1, "", 100*i, round(0.5*i, 2),
            up.replace(microsecond=0).isoformat(),
            (now - timedelta(minutes=i*20)).replace(microsecond=0).isoformat(),
            i*3600, t
        ))
    # 两个异常账号
    sample.append((
        "acc_dead_001", "main", "error", "OAuth authentication failed: 401 unauthorized",
        5.0, "Pro", 1, "", 320, 1.6,
        (now - timedelta(days=2)).replace(microsecond=0).isoformat(),
        (now - timedelta(days=1)).replace(microsecond=0).isoformat(),
        86400, t
    ))
    c.executemany("""INSERT INTO accounts(name,site_id,category,issue,billing_price,billing_tag,
        owner_user_id,note,requests,standard_cost,uploaded_at,last_used_at,survival_seconds,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", sample)

    # 代理池预置一些可用代理
    for i in range(20):
        c.execute("INSERT INTO proxies(url,used,created_at) VALUES(?,?,?)",
                  (f"http://proxy-demo-{i:02d}:8080", 0, t))

    conn.commit()

if __name__ == "__main__":
    fresh = init_db()
    print("数据库初始化完成:", DB_PATH, "(全新)" if fresh else "(已存在)")
