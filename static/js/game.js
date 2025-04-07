// static/js/game.js

document.addEventListener('DOMContentLoaded', () => {
    // --- 基本設定 ---
    const BOARD_WIDTH = 8;
    const BOARD_HEIGHT = 8;
    const TILE_TYPES = ['poring', 'drops', 'poporing', 'marin', 'xporing', 'pouring']; // 確保圖片存在
    const ANIMATION_DURATION_MS_SWAP = 250; // 交換/回彈動畫時間
    const ANIMATION_DURATION_MS_DISAPPEAR = 400; // 消除動畫時間 (需要與 CSS 中的 transition 時間匹配)
    const COMBO_POPUP_DURATION_MS = 800; // Combo文字顯示時間
    const INITIAL_MOVES = 20; // 初始移動次數
    const SWIPE_THRESHOLD = 20; // 最小滑動距離閾值 (像素)

    // --- 獲取 HTML 元素 ---
    const startScreen = document.getElementById('start-screen');
    const gameScreen = document.getElementById('game-screen');
    const leaderboardScreen = document.getElementById('leaderboard-screen');
    const newGameButton = document.getElementById('new-game-button');
    const continueButton = document.getElementById('continue-button');
    const leaderboardButton = document.getElementById('leaderboard-button');
    const gameBoardElement = document.getElementById('game-board');
    const scoreElement = document.getElementById('score');
    const movesElement = document.getElementById('moves');
    const comboPopupElement = document.getElementById('combo-popup');
    const resetButton = document.getElementById('reset-button');
    const backToStartButton = document.getElementById('back-to-start-button');
    const leaderboardLoading = document.getElementById('leaderboard-loading');
    const leaderboardTable = document.getElementById('leaderboard-table');
    const leaderboardTbody = leaderboardTable.querySelector('tbody');
    const leaderboardBackButton = document.getElementById('leaderboard-back-button');

    // --- 遊戲狀態變數 ---
    let board = []; let tiles = []; let score = 0; let isAnimating = false; let moveCount = INITIAL_MOVES;
    let currentComboCount = 0; let comboTimeoutId = null;
    let dragStartX = 0; let dragStartY = 0; let draggingTileInfo = null; let isDragging = false;

    // --- 輔助函數：異步等待 ---
    function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    // --- 畫面管理函數 ---
    function showScreen(screenToShow) {
        startScreen.classList.remove('active'); gameScreen.classList.remove('active'); leaderboardScreen.classList.remove('active');
        screenToShow.classList.add('active'); /* console.log(`顯示畫面: ${screenToShow.id}`); */
    }

    // --- 初始化應用程式 ---
    function initializeApp() {
        console.log("應用程式初始化...");
        // 使用 loadGameProgress 的返回值來判斷是否有有效的可繼續遊戲
        if (loadGameProgress()) {
            continueButton.style.display = 'block';
        } else {
            continueButton.style.display = 'none';
            localStorage.removeItem('roMatch3Save'); // 確保無效存檔被清除
        }
        showScreen(startScreen);
        bindStartScreenEvents(); bindGameScreenEvents(); bindLeaderboardScreenEvents();
    }

    // --- 綁定開始畫面按鈕事件 ---
    function bindStartScreenEvents() {
        // 使用 dataset 避免重複綁定
        if (newGameButton.dataset.listenerAttached !== 'true') {
            newGameButton.onclick = () => {
                if (localStorage.getItem('roMatch3Save')) { // 檢查是否有任何存檔記錄
                    if (confirm("你有尚未完成的遊戲紀錄，確定要開始新遊戲嗎？（舊紀錄將會消失）")) {
                        localStorage.removeItem('roMatch3Save'); startGame(false);
                    }
                } else { startGame(false); }
            }; newGameButton.dataset.listenerAttached = 'true';
        }
        if (continueButton.dataset.listenerAttached !== 'true') {
            continueButton.onclick = () => { startGame(true); }; continueButton.dataset.listenerAttached = 'true';
        }
        if (leaderboardButton.dataset.listenerAttached !== 'true') {
             leaderboardButton.onclick = () => { showLeaderboard(); }; leaderboardButton.dataset.listenerAttached = 'true';
        }
    }

    // --- 綁定遊戲畫面事件 ---
    function bindGameScreenEvents() {
         resetButton.removeEventListener('click', handleResetButtonClick); resetButton.addEventListener('click', handleResetButtonClick);
        if (backToStartButton.dataset.listenerAttached !== 'true') {
            backToStartButton.onclick = () => {
                if (moveCount > 0 && !isAnimating) { // 遊戲進行中且不在動畫
                     if (confirm("確定要離開遊戲返回主選單嗎？目前的遊戲進度會儲存。")) {
                         saveGameProgress(); showScreen(startScreen); initializeApp();
                     }
                } else { // 遊戲已結束或正在初始化/動畫中
                    showScreen(startScreen); initializeApp();
                }
            }; backToStartButton.dataset.listenerAttached = 'true';
        }
    }

    // --- 重置按鈕處理函數 ---
    function handleResetButtonClick() {
        if (isAnimating && moveCount > 0) { alert("遊戲正在處理中，請稍候！"); return; }
        console.log("點擊重置按鈕");
        if (confirm("確定要重新開始嗎？（目前這一局的進度會消失）")) {
            localStorage.removeItem('roMatch3Save');
            isAnimating = false; // 強制解鎖
            startGame(false); // 開始新遊戲
        }
    }

    // --- 綁定排行榜畫面事件 ---
    function bindLeaderboardScreenEvents() {
        if (leaderboardBackButton.dataset.listenerAttached !== 'true') {
            leaderboardBackButton.onclick = () => {
                 isAnimating = false; // 從排行榜返回時解鎖
                 showScreen(startScreen);
                 initializeApp(); // 重新檢查繼續按鈕
            }; leaderboardBackButton.dataset.listenerAttached = 'true';
        }
    }

    // --- 顯示排行榜 (讀取資料) ---
    async function showLeaderboard() {
        showScreen(leaderboardScreen); leaderboardTbody.innerHTML = ''; leaderboardTable.style.display = 'none';
        leaderboardLoading.style.display = 'block'; leaderboardLoading.textContent = '讀取中...';
        try {
            const response = await fetch('/leaderboard_data');
            if (!response.ok) { let errorMsg = `HTTP 錯誤！狀態: ${response.status}`; try { const errorData = await response.json(); if(errorData && errorData.error) errorMsg += ` - ${errorData.error}`; } catch (jsonError) {} throw new Error(errorMsg); }
            const data = await response.json();
            if (data.error) { leaderboardLoading.textContent = `讀取失敗: ${data.error}`; }
            else if (!Array.isArray(data)) { console.error("排行榜資料格式錯誤:", data); leaderboardLoading.textContent = '讀取錯誤 (資料格式錯誤)。'; }
            else if (data.length === 0) { leaderboardLoading.textContent = '目前還沒有排行榜紀錄喔！'; }
            else { data.forEach((entry, index) => { const row = leaderboardTbody.insertRow(); row.insertCell(0).textContent = index + 1; row.insertCell(1).textContent = entry.name; row.insertCell(2).textContent = entry.score; }); leaderboardTable.style.display = 'table'; leaderboardLoading.style.display = 'none'; }
        } catch (error) { console.error('無法獲取排行榜資料:', error); leaderboardLoading.textContent = `讀取排行榜時發生錯誤: ${error.message}`; }
    }

     // --- 開始遊戲 ---
     function startGame(loadSave) { console.log(`開始遊戲，是否載入存檔: ${loadSave}`); showScreen(gameScreen); isAnimating = false; initGame(loadSave); }

    // --- 核心函數：初始化遊戲 ---
    async function initGame(loadSave = false) {
        console.log("--- 初始化遊戲 ---"); isAnimating = true;
        gameBoardElement.innerHTML = ''; tiles = []; board = []; score = 0; moveCount = INITIAL_MOVES; currentComboCount = 0; draggingTileInfo = null; isDragging = false; hideComboPopup(true);
        let loadedSuccessfully = false;
        if (loadSave) {
            const savedGame = loadGameProgress(); // loadGameProgress 內部檢查 moveCount > 0
            if (savedGame) { console.log("成功載入有效存檔..."); board = savedGame.board; score = savedGame.score; moveCount = savedGame.moveCount; loadedSuccessfully = true; }
            else { console.log("找不到有效存檔，開始新遊戲..."); }
        }
        if (!loadedSuccessfully) {
             console.log("創建新遊戲版面..."); board = createInitialBoard();
             if (!board || board.length === 0) { console.error("錯誤：createInitialBoard"); isAnimating = false; gameBoardElement.innerHTML = '<p>初始化失敗！</p>'; return; }
             score = 0; moveCount = INITIAL_MOVES;
        }
        updateScoreDisplay(); updateMovesDisplay(); renderBoard(true); console.log(`遊戲開始 - 分數: ${score}, 移動次數: ${moveCount}`);
        await handleInitialMatches(); saveGameProgress(); isAnimating = false; console.log("--- 遊戲初始化完成 ---");
    }

    // --- 創建初始數據版面 ---
    function createInitialBoard() { let newBoard; let attempts = 0; const maxAttempts = 100; do { newBoard = []; for (let y = 0; y < BOARD_HEIGHT; y++) { const row = []; for (let x = 0; x < BOARD_WIDTH; x++) { let type; let generationAttempts = 0; const maxGenerationAttempts = 10; do { type = getRandomTileType(); generationAttempts++; if (generationAttempts > maxGenerationAttempts) break; } while ( (x >= 2 && row[x - 1] === type && row[x - 2] === type) || (y >= 2 && newBoard[y - 1]?.[x] === type && newBoard[y - 2]?.[x] === type) ); row.push(type); } newBoard.push(row); } attempts++; if (attempts > maxAttempts) { console.error("超過最大嘗試次數"); break; } } while (typeof checkMatchesOnBoard === 'function' && checkMatchesOnBoard(newBoard).length > 0); /* console.log(`創建了初始版面 (嘗試 ${attempts} 次)`); */ return newBoard; }
    // --- 隨機取得方塊類型 ---
    function getRandomTileType() { return TILE_TYPES[Math.floor(Math.random() * TILE_TYPES.length)]; }
    // --- 渲染遊戲版面到 HTML ---
    function renderBoard(isInitial = false) { gameBoardElement.innerHTML = ''; tiles = []; if (!board || board.length !== BOARD_HEIGHT || !board[0] || board[0].length !== BOARD_WIDTH) { console.error("renderBoard 錯誤：board 無效！"); gameBoardElement.innerHTML = '<p>錯誤！</p>'; return; } for (let y = 0; y < BOARD_HEIGHT; y++) { const rowElements = []; for (let x = 0; x < BOARD_WIDTH; x++) { const tileType = board[y][x]; let tileElement; if (tileType && TILE_TYPES.includes(tileType)) { tileElement = createTileElement(x, y, tileType); } else { if (tileType !== null) /* console.warn(`無效 tileType "${tileType}"`) */; tileElement = createPlaceholderElement(x, y); } gameBoardElement.appendChild(tileElement); rowElements.push(tileElement); } tiles.push(rowElements); } }
    // --- 創建單個方塊的 DOM 元素 ---
    function createTileElement(x, y, tileType) { const tileElement = document.createElement('div'); tileElement.classList.add('tile', `tile-${tileType}`); tileElement.dataset.x = x; tileElement.dataset.y = y; tileElement.addEventListener('mousedown', handleDragStart); tileElement.addEventListener('touchstart', handleDragStart, { passive: false }); tileElement.addEventListener('touchmove', (e) => { if (isDragging) e.preventDefault(); }, { passive: false }); return tileElement; }
    // --- 創建一個空的佔位符元素 ---
    function createPlaceholderElement(x, y) { const placeholder = document.createElement('div'); placeholder.classList.add('placeholder'); placeholder.dataset.x = x; placeholder.dataset.y = y; return placeholder; }
    // --- 處理拖動開始 ---
    function handleDragStart(event) { if (isAnimating || moveCount <= 0 || isDragging) return; if (event.button === 2) return; const targetElement = event.currentTarget; const x = parseInt(targetElement.dataset.x); const y = parseInt(targetElement.dataset.y); draggingTileInfo = { x, y, element: targetElement }; isDragging = true; dragStartX = event.clientX || event.touches[0].clientX; dragStartY = event.clientY || event.touches[0].clientY; event.preventDefault(); document.addEventListener('mousemove', handleDragMove); document.addEventListener('touchmove', handleDragMove, { passive: false }); document.addEventListener('mouseup', handleDragEnd); document.addEventListener('touchend', handleDragEnd); targetElement.classList.add('dragging'); }
    // --- 處理拖動過程 ---
    function handleDragMove(event) { if (!isDragging) return; event.preventDefault(); }
    // --- 處理拖動結束 ---
    function handleDragEnd(event) { if (!isDragging || !draggingTileInfo) return; document.removeEventListener('mousemove', handleDragMove); document.removeEventListener('touchmove', handleDragMove); document.removeEventListener('mouseup', handleDragEnd); document.removeEventListener('touchend', handleDragEnd); draggingTileInfo.element.classList.remove('dragging'); const startX = draggingTileInfo.x; const startY = draggingTileInfo.y; const endClientX = event.clientX ?? event.changedTouches?.[0]?.clientX ?? dragStartX; const endClientY = event.clientY ?? event.changedTouches?.[0]?.clientY ?? dragStartY; const deltaX = endClientX - dragStartX; const deltaY = endClientY - dragStartY; let targetX = startX; let targetY = startY; let direction = null; if (Math.abs(deltaX) > Math.abs(deltaY)) { if (Math.abs(deltaX) > SWIPE_THRESHOLD) { direction = deltaX > 0 ? 'right' : 'left'; targetX = startX + (deltaX > 0 ? 1 : -1); } } else { if (Math.abs(deltaY) > SWIPE_THRESHOLD) { direction = deltaY > 0 ? 'down' : 'up'; targetY = startY + (deltaY > 0 ? 1 : -1); } } const originalDraggingTileInfo = draggingTileInfo; isDragging = false; draggingTileInfo = null; if (direction) { if (targetX >= 0 && targetX < BOARD_WIDTH && targetY >= 0 && targetY < BOARD_HEIGHT) { const targetTileElement = tiles[targetY]?.[targetX]; if (targetTileElement && targetTileElement.classList.contains('tile')) { processSwap(originalDraggingTileInfo, { x: targetX, y: targetY, element: targetTileElement }); } else { /* console.log("目標無效"); */ animateWiggle(originalDraggingTileInfo.element); } } else { /* console.log("目標超出邊界"); */ animateWiggle(originalDraggingTileInfo.element); } } else { /* console.log("滑動距離不足"); */ } }

    // --- 處理交換邏輯與動畫 ---
    async function processSwap(tile1Info, tile2Info) {
        if (isAnimating) return; isAnimating = true; currentComboCount = 0; hideComboPopup();
        // console.log(`處理交換: (${tile1Info.x}, ${tile1Info.y}) <=> (${tile2Info.x}, ${tile2Info.y})`);
        await animateVisualSwap(tile1Info, tile2Info);
        const tempType = board[tile1Info.y][tile1Info.x]; board[tile1Info.y][tile1Info.x] = board[tile2Info.y][tile2Info.x]; board[tile2Info.y][tile2Info.x] = tempType;
        const matches = checkMatchesOnBoard(board);
        if (matches.length > 0) {
            // console.log("交換有效！");
            moveCount--; updateMovesDisplay();
            const tile1Element = tile1Info.element; const tile2Element = tile2Info.element; tiles[tile1Info.y][tile1Info.x] = tile2Element; tiles[tile2Info.y][tile2Info.x] = tile1Element;
            tile1Element.dataset.x = tile1Info.x; tile1Element.dataset.y = tile1Info.y; tile2Element.dataset.x = tile2Info.x; tile2Element.dataset.y = tile2Info.y; renderBoard();
            await wait(50); await handleMatchesAndRefill(true); saveGameProgress();
            // isAnimating 和 checkGameOver 由 handleMatchesAndRefill 結束時處理
        } else {
            // console.log("交換無效，回彈...");
            board[tile2Info.y][tile2Info.x] = board[tile1Info.y][tile1Info.x]; board[tile1Info.y][tile1Info.x] = tempType;
            await animateVisualSwap(tile2Info, tile1Info); isAnimating = false;
            // 無效交換不檢查遊戲結束
        }
    }

    // --- 純視覺交換動畫 ---
    async function animateVisualSwap(tile1Info, tile2Info) { const tile1Element = tile1Info.element; const tile2Element = tile2Info.element; if (!tile1Element || !tile2Element || !tile1Element.isConnected || !tile2Element.isConnected) { console.warn("animateVisualSwap: 元素無效"); return; } const boardGap = parseFloat(getComputedStyle(gameBoardElement).gap || '0px'); const elementWidth = tile1Element.offsetWidth; const elementHeight = tile1Element.offsetHeight; const dx = (tile2Info.x - tile1Info.x) * (elementWidth + boardGap); const dy = (tile2Info.y - tile1Info.y) * (elementHeight + boardGap); tile1Element.style.transition = `transform ${ANIMATION_DURATION_MS_SWAP}ms ease-in-out`; tile2Element.style.transition = `transform ${ANIMATION_DURATION_MS_SWAP}ms ease-in-out`; tile1Element.style.transform = `translate(${dx}px, ${dy}px)`; tile2Element.style.transform = `translate(${-dx}px, ${-dy}px)`; tile1Element.style.zIndex = '10'; tile2Element.style.zIndex = '10'; await wait(ANIMATION_DURATION_MS_SWAP); tile1Element.style.transition = ''; tile2Element.style.transition = ''; tile1Element.style.transform = ''; tile2Element.style.transform = ''; tile1Element.style.zIndex = ''; tile2Element.style.zIndex = ''; }
    // --- 無法交換時的抖動動畫 ---
     async function animateWiggle(element) { if (!element || isAnimating) return; const tileStillAnimating = isAnimating; isAnimating = true; element.style.transition = 'transform 0.07s ease-in-out'; const originalTransform = element.style.transform; try { await wait(0); element.style.transform = originalTransform + ' translateX(5px)'; await wait(70); element.style.transform = originalTransform + ' translateX(-5px)'; await wait(70); element.style.transform = originalTransform + ' translateX(3px)'; await wait(70); element.style.transform = originalTransform + ' translateX(-3px)'; await wait(70); element.style.transform = originalTransform; await wait(70); } finally { element.style.transition = ''; if (!tileStillAnimating) { isAnimating = false; } } }

    // --- 核心流程：處理匹配、掉落、填充 ---
    async function handleMatchesAndRefill(isInitialMove = false) {
        let matches = checkMatchesOnBoard(board); let totalScoreGainedThisTurn = 0; let iteration = 0; const maxIterations = 20;

        while (matches.length > 0 && iteration < maxIterations) {
            iteration++; isAnimating = true; const previousComboCount = currentComboCount; currentComboCount += matches.length; /* console.log(`連鎖 ${iteration} (${matches.length}組), 總 Combo: ${currentComboCount}`); */
            let scoreGained = 0; const allMatchedPositions = matches.flat(); const uniquePositions = Array.from(new Set(allMatchedPositions.map(p => `${p.x},${p.y}`))).map(s => { const [x, y] = s.split(','); return {x: parseInt(x), y: parseInt(y)}; });
            scoreGained = uniquePositions.length * 10; score += scoreGained; totalScoreGainedThisTurn += scoreGained; updateScoreDisplay();
            let movesGained = 0;
            if (isInitialMove && iteration === 1) { if (uniquePositions.length === 4) { movesGained = 1; } else if (uniquePositions.length >= 5) { movesGained = 2; } }
            if (previousComboCount < 3 && currentComboCount >= 3) { movesGained += 1; } if (previousComboCount < 5 && currentComboCount >= 5) { movesGained += 1; }
            if (movesGained > 0) { moveCount += movesGained; updateMovesDisplay(); /* console.log(`獲得 ${movesGained} 次移動`); */ }
            if (currentComboCount >= 2) { showComboPopup(currentComboCount); }
            await animateDisappear(uniquePositions);
            uniquePositions.forEach(tilePos => { if(board[tilePos.y]?.[tilePos.x]) board[tilePos.y][tilePos.x] = null; });
            await dropAndRefillBoard(); matches = checkMatchesOnBoard(board);
            if (matches.length > 0) { await wait(ANIMATION_DURATION_MS_SWAP / 2); }
        }
        if (iteration >= maxIterations) { console.error("達最大連鎖"); renderBoard(); }

        isAnimating = false; // 在循環結束後解鎖
        // console.log("連鎖反應結束");
        checkGameOver(); // 在此處檢查遊戲是否結束
    }

    // --- 動畫函數：方塊消除動畫 ---
    async function animateDisappear(matchedTilesPositions) { const disappearPromises = matchedTilesPositions.map(tilePos => { return new Promise(resolve => { if (tiles[tilePos.y]?.[tilePos.x]?.classList.contains('tile')) { const element = tiles[tilePos.y][tilePos.x]; element.classList.add('tile-disappearing'); setTimeout(resolve, ANIMATION_DURATION_MS_DISAPPEAR); } else { /* console.warn(`消除未找到元素(${tilePos.x}, ${tilePos.y})`); */ resolve(); } }); }); await Promise.all(disappearPromises); }
    // --- 核心流程：處理掉落和填充 ---
    async function dropAndRefillBoard() { const dropInfos = calculateDrops(); const boardAfterDrop = applyDropsToBoardData(); await animateDrops(dropInfos, ANIMATION_DURATION_MS_SWAP); const { newBoardData, newTilesInfo } = fillEmptyTiles(boardAfterDrop); board = newBoardData; renderBoard(); await animateNewTiles(newTilesInfo, ANIMATION_DURATION_MS_SWAP); }
    // --- 計算掉落信息 ---
    function calculateDrops() { const drops = []; for (let x = 0; x < BOARD_WIDTH; x++) { let emptySlots = 0; for (let y = BOARD_HEIGHT - 1; y >= 0; y--) { if (board[y][x] === null) { emptySlots++; } else if (emptySlots > 0) { if (tiles[y]?.[x]?.classList.contains('tile')) { drops.push({ fromY: y, toY: y + emptySlots, x: x, element: tiles[y][x], distance: emptySlots }); } else { /* console.warn(`算掉落未找到元素(${x}, ${y})`); */ } } } } return drops; }
    // --- 應用掉落到 *新的* board 數據陣列 ---
    function applyDropsToBoardData() { const nextBoard = Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(null)); for (let x = 0; x < BOARD_WIDTH; x++) { let currentNewY = BOARD_HEIGHT - 1; for (let y = BOARD_HEIGHT - 1; y >= 0; y--) { if (board[y][x] !== null) { nextBoard[currentNewY--][x] = board[y][x]; } } } return nextBoard; }
    // --- 動畫函數：執行視覺掉落動畫 ---
    async function animateDrops(dropInfos, duration) { if (dropInfos.length === 0) return; const boardGap = parseFloat(getComputedStyle(gameBoardElement).gap || '0px'); const dropPromises = dropInfos.map(info => { return new Promise(resolve => { const element = info.element; const translateY = info.distance * (element.offsetHeight + boardGap); element.style.transition = `transform ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`; element.style.transform = `translateY(${translateY}px)`; element.style.zIndex = '5'; setTimeout(() => { element.style.transition = ''; element.style.transform = ''; element.style.zIndex = ''; resolve(); }, duration + 50); }); }); await Promise.all(dropPromises); }
    // --- 在數據層面填充空位 ---
    function fillEmptyTiles(currentBoardData) { const newBoardData = currentBoardData.map(row => [...row]); const newTilesInfo = []; for (let y = 0; y < BOARD_HEIGHT; y++) { for (let x = 0; x < BOARD_WIDTH; x++) { if (newBoardData[y][x] === null) { const newType = getRandomTileType(); newBoardData[y][x] = newType; newTilesInfo.push({ x, y, type: newType }); } } } return { newBoardData, newTilesInfo }; }
    // --- 動畫函數：新方塊進入動畫 ---
    async function animateNewTiles(newTilesInfo, duration) { if (newTilesInfo.length === 0) return; const appearPromises = newTilesInfo.map(info => { return new Promise(resolve => { if (tiles[info.y]?.[info.x]?.classList.contains('tile')) { const tileElement = tiles[info.y][info.x]; tileElement.classList.add('tile-entering'); requestAnimationFrame(() => { requestAnimationFrame(() => { tileElement.style.transition = `transform ${duration}ms ease-out, opacity ${duration}ms ease-out`; tileElement.classList.remove('tile-entering'); setTimeout(() => { tileElement.style.transition = ''; resolve(); }, duration); }); }); } else { /* console.warn(`新方塊動畫未找到元素(${info.x}, ${info.y})`); */ resolve(); } }); }); await Promise.all(appearPromises); }
    // --- 檢查整個版面的匹配 ---
    function checkMatchesOnBoard(targetBoard) { const allMatches = []; if (!targetBoard || targetBoard.length !== BOARD_HEIGHT || !targetBoard[0] || targetBoard[0].length !== BOARD_WIDTH) { console.error("checkMatches 無效 board"); return allMatches; } for (let y = 0; y < BOARD_HEIGHT; y++) { for (let x = 0; x < BOARD_WIDTH - 2; ) { const type = targetBoard[y]?.[x]; if (!type || !TILE_TYPES.includes(type)) { x++; continue; } let match = [{x, y}]; for (let i = x + 1; i < BOARD_WIDTH; i++) { if (targetBoard[y]?.[i] === type) { match.push({x: i, y: y}); } else { break; } } if (match.length >= 3) { allMatches.push(match); x += match.length; } else { x++; } } } for (let x = 0; x < BOARD_WIDTH; x++) { for (let y = 0; y < BOARD_HEIGHT - 2; ) { const type = targetBoard[y]?.[x]; if (!type || !TILE_TYPES.includes(type)) { y++; continue; } let match = [{x, y}]; for (let i = y + 1; i < BOARD_HEIGHT; i++) { if (targetBoard[i]?.[x] === type) { match.push({x: x, y: i}); } else { break; } } if (match.length >= 3) { allMatches.push(match); y += match.length; } else { y++; } } } return allMatches; }
    // --- 更新分數和移動次數顯示 ---
    function updateScoreDisplay() { scoreElement.textContent = score; }
    function updateMovesDisplay() { movesElement.textContent = moveCount; }
    // --- Combo 彈出文字相關函數 ---
    function showComboPopup(combo) { if (comboTimeoutId) { clearTimeout(comboTimeoutId); } comboPopupElement.textContent = `${combo} Combo!`; comboPopupElement.classList.add('show'); comboTimeoutId = setTimeout(() => { hideComboPopup(); }, COMBO_POPUP_DURATION_MS); }
    function hideComboPopup(immediately = false) { if (comboTimeoutId) { clearTimeout(comboTimeoutId); comboTimeoutId = null; } if (immediately) { comboPopupElement.classList.remove('show'); comboPopupElement.style.transition = 'none'; comboPopupElement.style.opacity = '0'; comboPopupElement.style.visibility = 'hidden'; setTimeout(() => { comboPopupElement.style.transition = ''; comboPopupElement.style.opacity = ''; comboPopupElement.style.visibility = ''; }, 50); } else { comboPopupElement.classList.remove('show'); } }

    // --- 檢查遊戲是否結束，並觸發分數提交 ---
    function checkGameOver() {
        if (moveCount <= 0 && !isAnimating) {
            console.log("遊戲結束！"); isAnimating = true;
            setTimeout(async () => {
                 hideComboPopup(true);
                 const playerName = prompt(`遊戲結束！\n你的最終分數是：${score}\n\n請輸入你的名字以記錄到排行榜 (最多50字)：`, "匿名玩家");
                 let shouldShowLeaderboard = false;
                 if (playerName !== null && playerName.trim() !== "") { await submitScoreToLeaderboard(playerName.trim().substring(0, 50), score); shouldShowLeaderboard = true; }
                 else if (playerName !== null && playerName.trim() === ""){ alert("名字不能是空白喔！將不會記錄分數。"); }
                 else { alert("未記錄分數，返回主選單。"); }
                 localStorage.removeItem('roMatch3Save');
                 if(shouldShowLeaderboard) {
                     await showLeaderboard(); // 顯示排行榜後停留在排行榜畫面
                     // isAnimating 保持 true，由返回按鈕解鎖
                 } else {
                     showScreen(startScreen); initializeApp(); isAnimating = false; // 不顯示排行榜則返回主畫面並解鎖
                 }
            }, 500); return true;
        } return false;
    }

     // --- 提交分數到後端 ---
     async function submitScoreToLeaderboard(name, finalScore) { console.log(`提交分數: Name='${name}', Score=${finalScore}`); try { const response = await fetch('/submit_score', { method: 'POST', headers: { 'Content-Type': 'application/json', }, body: JSON.stringify({ name: name, score: finalScore }), }); const result = await response.json(); if (!response.ok || result.error) { throw new Error(result.error || `HTTP 狀態 ${response.status}`); } console.log("分數提交成功！"); } catch (error) { console.error('提交分數時發生錯誤:', error); alert(`哎呀，分數提交失敗了 T_T\n錯誤: ${error.message}`); } }
     // --- 遊戲盤閃爍提示 ---
     function flashGameBoard(color = '#ffcccc') { const originalBg = gameBoardElement.style.backgroundColor; gameBoardElement.style.transition = 'background-color 0.1s ease-in-out'; gameBoardElement.style.backgroundColor = color; setTimeout(() => { gameBoardElement.style.backgroundColor = originalBg; setTimeout(() => { gameBoardElement.style.transition = ''; }, 150); }, 150); }
    // --- 儲存/載入遊戲進度 ---
    function saveGameProgress() { if (isAnimating) return; if (!board || board.length !== BOARD_HEIGHT || !board[0] || board[0].length !== BOARD_WIDTH) { console.warn("嘗試儲存無效 board"); return; } const gameState = { board: board, score: score, moveCount: moveCount }; try { localStorage.setItem('roMatch3Save', JSON.stringify(gameState)); } catch (e) { console.error("儲存失敗:", e); } }
    function loadGameProgress() { const savedState = localStorage.getItem('roMatch3Save'); if (savedState) { try { const parsedState = JSON.parse(savedState); if (parsedState && Array.isArray(parsedState.board) && parsedState.board.length === BOARD_HEIGHT && parsedState.board.every(row => Array.isArray(row) && row.length === BOARD_WIDTH) && typeof parsedState.score === 'number' && (parsedState.moveCount === undefined || typeof parsedState.moveCount === 'number') ) { if (parsedState.moveCount === undefined || parsedState.moveCount > 0) { /* console.log("讀取有效且可繼續的進度"); */ if (parsedState.moveCount === undefined) parsedState.moveCount = INITIAL_MOVES; return parsedState; } else { console.log("存檔移動次數已耗盡"); localStorage.removeItem('roMatch3Save'); return null; } } else { console.warn("存檔格式錯誤"); localStorage.removeItem('roMatch3Save'); } } catch (e) { console.error("讀取失敗:", e); localStorage.removeItem('roMatch3Save'); } } return null; }
    // --- 重置按鈕處理函數 ---
    // handleResetButtonClick 已在 bindGameScreenEvents 中定義和綁定
    // --- 處理初始匹配 ---
    async function handleInitialMatches() { /* console.log("檢查初始匹配..."); */ isAnimating = true; let initialMatches = checkMatchesOnBoard(board); if (initialMatches.length > 0) { console.warn(`初始匹配 ${initialMatches.length} 組`); await handleMatchesAndRefill(false); console.log("初始匹配處理完成。"); } else { /* console.log("初始版面無匹配。"); */ } isAnimating = false; }

    // --- 應用程式啟動點 ---
    initializeApp();

}); // DOMContentLoaded 結束