# app.py
import os
import psycopg2 # 用於連接 PostgreSQL
from psycopg2 import pool # 導入連線池 (可選，但推薦用於高流量)
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

# --- 資料庫連線池設定 (可選但推薦) ---
# 從環境變數讀取資料庫連線 URL
DATABASE_URL = os.environ.get(
    'DATABASE_URL', # Render.com 等平台會自動設置這個
    'postgresql://ropuzzlegame:rZwVjq2YKai3fvX01VTSpwV5cO3TwiS6@dpg-cvpreus9c44c73dvdtb0-a/ropuzzlegamesql_kiz8' # 在本地測試時使用的預設值
)

# 建立一個簡單的連線池 (最小1個連線，最大5個)
try:
    db_pool = psycopg2.pool.SimpleConnectionPool(1, 5, dsn=DATABASE_URL)
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
        # 如果連線池不可用，嘗試建立單一連線 (作為後備)
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
            # 如果放回失敗，嘗試直接關閉以釋放資源
            try:
                conn.close()
            except Exception as close_e:
                 print(f"關閉連線時發生錯誤: {close_e}")

    elif conn: # 如果是單一連線，直接關閉
        try:
            conn.close()
        except Exception as e:
            print(f"關閉單一連線時發生錯誤: {e}")


def init_db():
    """初始化資料庫，建立 leaderboard 表格 (如果不存在)"""
    conn = get_db_connection_from_pool()
    if conn:
        try:
            # 使用 'with' 陳述式確保 cursor 被正確關閉
            with conn.cursor() as cur:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS leaderboard (
                        id SERIAL PRIMARY KEY,
                        name VARCHAR(50) NOT NULL,
                        score INTEGER NOT NULL,
                        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                """)
                # 可以考慮為 score 欄位建立索引以加速排序查詢
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard (score DESC);
                """)
                conn.commit() # 提交事務
                print("資料庫表格 'leaderboard' 初始化完成。")
        except Exception as e:
            print(f"初始化資料庫表格時發生錯誤: {e}")
            conn.rollback() # 出錯時回滾
        finally:
            release_db_connection(conn) # 確保連線被釋放
    else:
        print("無法獲取資料庫連線，跳過初始化。")


# --- Flask 路由 ---

@app.route('/')
def index():
    """渲染主要的 HTML 頁面 (包含所有畫面結構)"""
    return render_template('index.html')

@app.route('/leaderboard_data')
def get_leaderboard_data():
    """從資料庫獲取排行榜前 100 名的資料，返回 JSON"""
    conn = get_db_connection_from_pool()
    if not conn:
        # 返回一個 JSON 錯誤訊息和 500 狀態碼
        return jsonify({"error": "無法連接到資料庫"}), 500

    leaderboard = []
    try:
        with conn.cursor() as cur:
            # 查詢名字和分數，依照分數降冪排序，最多取 100 筆
            cur.execute("SELECT name, score FROM leaderboard ORDER BY score DESC LIMIT 100")
            rows = cur.fetchall() # 獲取所有查詢結果
            # 將結果轉換為字典列表，方便前端 JavaScript 處理
            leaderboard = [{"name": row[0], "score": row[1]} for row in rows]
    except Exception as e:
        print(f"讀取排行榜時發生錯誤: {e}")
        return jsonify({"error": "讀取排行榜資料失敗"}), 500
    finally:
        release_db_connection(conn) # 釋放連線

    # 返回 JSON 格式的排行榜數據
    return jsonify(leaderboard)

@app.route('/submit_score', methods=['POST'])
def submit_score():
    """接收前端提交的分數 (JSON 格式)，並存入資料庫"""
    # 檢查請求是否包含 JSON 資料
    if not request.is_json:
        return jsonify({"error": "請求必須是 JSON 格式"}), 400 # Bad Request

    data = request.get_json()
    # 檢查 JSON 資料是否包含必要的欄位
    if not data or 'name' not in data or 'score' not in data:
        return jsonify({"error": "缺少 name 或 score 資料"}), 400

    name = data['name']
    score = data['score']

    # 進行基本的資料驗證
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 50:
        return jsonify({"error": "名字格式錯誤或過長 (最多50字)"}), 400
    if not isinstance(score, int) or score < 0:
        return jsonify({"error": "分數格式錯誤 (必須是非負整數)"}), 400

    # 清理名字前後的空白
    clean_name = name.strip()

    conn = get_db_connection_from_pool()
    if not conn:
        return jsonify({"error": "無法連接到資料庫"}), 500

    try:
        with conn.cursor() as cur:
            # 使用參數化查詢 (%s) 來防止 SQL 注入攻擊
            cur.execute("INSERT INTO leaderboard (name, score) VALUES (%s, %s)", (clean_name, score))
            conn.commit() # 提交事務以保存變更
            print(f"分數已提交: Name='{clean_name}', Score={score}")
            # 返回成功訊息和 201 Created 狀態碼
            return jsonify({"success": True, "message": "分數已成功記錄！"}), 201
    except Exception as e:
        print(f"提交分數時發生錯誤: {e}")
        conn.rollback() # 如果插入失敗，回滾事務
        return jsonify({"error": "提交分數到資料庫時發生錯誤"}), 500
    finally:
        release_db_connection(conn) # 釋放連線

# --- 主程式入口 ---
if __name__ == '__main__':
    # 在啟動 Flask 應用程式之前，先確保資料庫表格存在
    init_db()
    # 啟動 Flask 開發伺服器
    # debug=True: 開發模式，程式碼變更時會自動重載，顯示詳細錯誤訊息
    # host='0.0.0.0': 監聽所有公開的 IP 地址，允許區域網路內其他裝置訪問
    # port=5000: 指定伺服器運行的端口號
    app.run(debug=True, host='0.0.0.0', port=5000)