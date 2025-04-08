# app.py
import os
import psycopg2 # 用於連接 PostgreSQL
from psycopg2 import pool # 導入連線池
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

# --- 資料庫連線池設定 ---
DATABASE_URL = os.environ.get(
    'DATABASE_URL', # Render.com 等平台會自動設置這個
    'postgresql://ropuzzlegame:rZwVjq2YKai3fvX01VTSpwV5cO3TwiS6@dpg-cvpreus9c44c73dvdtb0-a/ropuzzlegamesql_kiz8' # 在本地測試時使用的預設值
)

# 建立連線池
try:
    # 增加 minconn 和 maxconn 參數
    db_pool = psycopg2.pool.SimpleConnectionPool(minconn=1, maxconn=5, dsn=DATABASE_URL)
    print("資料庫連線池建立成功。")
except Exception as e:
    print(f"建立資料庫連線池失敗: {e}")
    db_pool = None # 設置為 None 表示連線池不可用

def get_db_connection_from_pool():
    """從連線池獲取一個資料庫連線"""
    if db_pool:
        try:
            return db_pool.getconn()
        except Exception as e:
            print(f"從連線池獲取連線失敗: {e}")
            return None
    else:
        print("連線池不可用，嘗試建立單一連線...")
        try:
            conn = psycopg2.connect(DATABASE_URL)
            return conn
        except psycopg2.OperationalError as e:
            print(f"建立單一資料庫連線失敗: {e}")
            return None

def release_db_connection(conn):
    """將連線放回連線池 (或直接關閉單一連線)"""
    if db_pool and conn:
        try:
            db_pool.putconn(conn)
        except Exception as e:
            print(f"歸還連線到連線池失敗: {e}")
            try: conn.close()
            except Exception as close_e: print(f"關閉連線時發生錯誤: {close_e}")
    elif conn:
        try: conn.close()
        except Exception as e: print(f"關閉單一連線時發生錯誤: {e}")


def init_db():
    """初始化資料庫，建立 leaderboard 表格 (如果不存在)"""
    conn = get_db_connection_from_pool()
    if conn:
        try:
            with conn.cursor() as cur:
                # 建立表格，如果不存在的話
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS leaderboard (
                        id SERIAL PRIMARY KEY,
                        name VARCHAR(50) NOT NULL,
                        score INTEGER NOT NULL CHECK (score >= 0), -- 確保分數非負
                        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                """)
                # 為 score 欄位建立索引，加速排序
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard (score DESC);
                """)
                conn.commit()
                print("資料庫表格 'leaderboard' 初始化完成。")
        except Exception as e:
            print(f"初始化資料庫表格時發生錯誤: {e}")
            conn.rollback()
        finally:
            release_db_connection(conn)
    else:
        print("無法獲取資料庫連線，跳過初始化。")

# --- Flask 路由 ---

@app.route('/')
def index():
    """渲染主要的 HTML 頁面"""
    return render_template('index.html')

@app.route('/leaderboard_data')
def get_leaderboard_data():
    """獲取排行榜前 100 名的資料"""
    conn = get_db_connection_from_pool()
    if not conn:
        return jsonify({"error": "無法連接到資料庫"}), 500

    leaderboard = []
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT name, score FROM leaderboard ORDER BY score DESC LIMIT 100")
            rows = cur.fetchall()
            leaderboard = [{"name": row[0], "score": row[1]} for row in rows]
    except Exception as e:
        print(f"讀取排行榜時發生錯誤: {e}")
        return jsonify({"error": "讀取排行榜資料失敗"}), 500
    finally:
        release_db_connection(conn)

    return jsonify(leaderboard)

@app.route('/submit_score', methods=['POST'])
def submit_score():
    """接收前端提交的分數"""
    if not request.is_json:
        return jsonify({"error": "請求必須是 JSON 格式"}), 400

    data = request.get_json()
    if not data or 'name' not in data or 'score' not in data:
        return jsonify({"error": "缺少 name 或 score 資料"}), 400

    name = data['name']
    score = data['score']

    # 驗證資料
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 50:
        return jsonify({"error": "名字格式錯誤或過長 (最多50字)"}), 400
    if not isinstance(score, int) or score < 0:
        return jsonify({"error": "分數格式錯誤 (必須是非負整數)"}), 400

    clean_name = name.strip()

    conn = get_db_connection_from_pool()
    if not conn:
        return jsonify({"error": "無法連接到資料庫"}), 500

    try:
        with conn.cursor() as cur:
            cur.execute("INSERT INTO leaderboard (name, score) VALUES (%s, %s)", (clean_name, score))
            conn.commit()
            print(f"分數已提交: Name='{clean_name}', Score={score}")
            return jsonify({"success": True, "message": "分數已成功記錄！"}), 201
    except Exception as e:
        print(f"提交分數時發生錯誤: {e}")
        conn.rollback()
        return jsonify({"error": "提交分數到資料庫時發生錯誤"}), 500
    finally:
        release_db_connection(conn)

# --- 主程式入口 ---
if __name__ == '__main__':
    # 確保在應用程式啟動時初始化資料庫
    init_db()
    # 啟動 Flask 伺服器
    app.run(debug=True, host='0.0.0.0', port=5000)