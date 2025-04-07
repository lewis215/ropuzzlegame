# app.py
from flask import Flask, render_template

app = Flask(__name__)

# 主路由，用來顯示遊戲頁面
@app.route('/')
def index():
  """渲染主要的遊戲 HTML 頁面"""
  # 我們把主要的遊戲邏輯放在前端 JavaScript 中
  # 所以後端只需要提供這個 HTML 殼就好
  return render_template('index.html')

if __name__ == '__main__':
  # 啟動 Flask 開發伺服器
  # debug=True 在開發時很有用，但正式上線要關掉
  # host='0.0.0.0' 讓區域網路內的其他裝置 (像手機) 可以連線測試
  app.run(debug=True, host='0.0.0.0')