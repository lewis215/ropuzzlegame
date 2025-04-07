# app.py
import os
import psycopg2 # <--- 新增：匯入 psycopg2
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

# --- 資料庫設定 ---
# 從環境變數讀取資料庫連線 URL (更安全)
# 請確保你的運行環境(例如 Render.com) 設定了這個環境變數
DATABASE_URL = os.environ.get('DATABASE_URL', 'postgresql://ropuzzlegame:rZwVjq2YKai3fvX01VTSpwV5cO3TwiS6@dpg-cvpreus9c44c73dvdtb0-a/ropuzzlegamesql_kiz8') # <--- 提供預設值以便本地測試

def get_db_connection():
    """建立資料庫連線"""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    except psycopg2.OperationalError as e:
        print(f"無法連接到資料庫: {e}")
        return None # 返回 None 表示連線失敗

def init_db():
    """初始化資料庫，建立 leaderboard 表格 (如果不存在)"""
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS leaderboard (
                        id SERIAL PRIMARY KEY,
                        name VARCHAR(50) NOT NULL,
                        score INTEGER NOT NULL,
                        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                """)
                conn.commit()
                print("資料庫表格 'leaderboard' 初始化完成 (或已存在)。")
        except Exception as e:
            print(f"初始化資料庫表格時發生錯誤: {e}")
        finally:
            conn.close()
    else:
        print("無法連接到資料庫，跳過初始化。")


# --- Flask 路由 ---

@app.route('/')
def index():
    """渲染主要的 HTML 頁面"""
    return render_template('index.html')

@app.route('/leaderboard_data')
def get_leaderboard_data():
    """從資料庫獲取排行榜前 100 名的資料"""
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "無法連接到資料庫"}), 500 # 返回錯誤狀態

    leaderboard = []
    try:
        with conn.cursor() as cur:
            # 依照分數從高到低排序，取前 100 名
            cur.execute("SELECT name, score FROM leaderboard ORDER BY score DESC LIMIT 100")
            # fetchall() 會返回一個包含 tuple 的 list, e.g., [('Alice', 1000), ('Bob', 900)]
            rows = cur.fetchall()
            # 將 tuple 轉換為字典列表，方便前端處理
            leaderboard = [{"name": row[0], "score": row[1]} for row in rows]
    except Exception as e:
        print(f"讀取排行榜時發生錯誤: {e}")
        return jsonify({"error": "讀取排行榜資料失敗"}), 500
    finally:
        conn.close()

    return jsonify(leaderboard) # 將結果以 JSON 格式返回

@app.route('/submit_score', methods=['POST'])
def submit_score():
    """接收前端提交的分數並存入資料庫"""
    data = request.get_json()
    if not data or 'name' not in data or 'score' not in data:
        return jsonify({"error": "缺少 name 或 score 資料"}), 400 # Bad Request

    name = data['name'][:50] # 限制名字長度
    score = data['score']

    # 基本驗證
    if not isinstance(name, str) or not name.strip():
        return jsonify({"error": "名字格式錯誤"}), 400
    if not isinstance(score, int) or score < 0:
        return jsonify({"error": "分數格式錯誤"}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "無法連接到資料庫"}), 500

    try:
        with conn.cursor() as cur:
            # 使用參數化查詢防止 SQL 注入
            cur.execute("INSERT INTO leaderboard (name, score) VALUES (%s, %s)", (name.strip(), score))
            conn.commit()
            print(f"分數已提交: Name={name.strip()}, Score={score}")
            return jsonify({"success": True}), 201 # Created
    except Exception as e:
        print(f"提交分數時發生錯誤: {e}")
        conn.rollback() # 如果出錯，回滾事務
        return jsonify({"error": "提交分數失敗"}), 500
    finally:
        conn.close()

# --- 主程式入口 ---
if __name__ == '__main__':
    # 在啟動 App 前先初始化資料庫表格
    init_db()
    # 監聽所有網路介面，方便手機測試 (注意安全風險，正式部署時可能需要調整)
    app.run(debug=True, host='0.0.0.0', port=5000)