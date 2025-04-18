// static/js/game.js

document.addEventListener('DOMContentLoaded', () => {
    // --- 基本設定 ---
    const BOARD_WIDTH = 8; const BOARD_HEIGHT = 8;
    const TILE_TYPES = ['poring', 'drops', 'poporing', 'marin', 'xporing', 'pouring'];
    const ANIMATION_DURATION_MS_SWAP = 250; const ANIMATION_DURATION_MS_DISAPPEAR = 400;
    const ANIMATION_DURATION_MS_RESHUFFLE = 300;
    const COMBO_POPUP_DURATION_MS = 800; const INITIAL_MOVES = 20; const SWIPE_THRESHOLD = 20;

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
    // 洗牌提示元素
    let shuffleIndicator = document.getElementById('shuffle-indicator');
    if (!shuffleIndicator) {
        shuffleIndicator = document.createElement('div');
        shuffleIndicator.id = 'shuffle-indicator';
        shuffleIndicator.textContent = '洗牌中...';
        // 建議在 CSS 中定義 #shuffle-indicator 樣式
        shuffleIndicator.style.cssText = 'display: none; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); padding: 10px 20px; background-color: rgba(0,0,0,0.7); color: white; border-radius: 5px; z-index: 150; pointer-events: none; transition: opacity 0.3s ease-out, visibility 0s linear 0.3s;';
        gameScreen.appendChild(shuffleIndicator);
    }

    // --- 遊戲狀態變數 ---
    let board = []; let tiles = []; let score = 0; let isAnimating = false; let moveCount = INITIAL_MOVES;
    let currentComboCount = 0; let comboTimeoutId = null;
    let dragStartX = 0; let dragStartY = 0; let draggingTileInfo = null; let isDragging = false;

    // --- 輔助函數：異步等待 ---
    function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    // --- 畫面管理函數 ---
    function showScreen(screenToShow) { startScreen.classList.remove('active'); gameScreen.classList.remove('active'); leaderboardScreen.classList.remove('active'); screenToShow.classList.add('active'); /* console.log(`顯示畫面: ${screenToShow.id}`); */ }

    // --- 初始化應用程式 ---
    function initializeApp() {
        console.log("應用程式初始化..."); isAnimating = false;
        if (loadGameProgress()) { continueButton.style.display = 'block'; }
        else { continueButton.style.display = 'none'; localStorage.removeItem('roMatch3Save'); }
        showScreen(startScreen); bindStartScreenEvents(); bindGameScreenEvents(); bindLeaderboardScreenEvents();
    }

    // --- 綁定開始畫面按鈕事件 ---
    function bindStartScreenEvents() {
        const addClickListener = (button, handler) => { if (button.dataset.listenerAttached !== 'true') { button.addEventListener('click', handler); button.dataset.listenerAttached = 'true'; } };
        addClickListener(newGameButton, () => { if (isAnimating) return; if (localStorage.getItem('roMatch3Save')) { if (confirm("你有未完成的遊戲，確定要開始新遊戲嗎？")) { localStorage.removeItem('roMatch3Save'); startGame(false); } } else { startGame(false); } });
        addClickListener(continueButton, () => { if (isAnimating) return; startGame(true); });
        addClickListener(leaderboardButton, () => { if (isAnimating) return; showLeaderboard(); });
    }
    // --- 綁定遊戲畫面事件 ---
    function bindGameScreenEvents() { resetButton.removeEventListener('click', handleResetButtonClick); resetButton.addEventListener('click', handleResetButtonClick); if (backToStartButton.dataset.listenerAttached !== 'true') { backToStartButton.onclick = () => { if (moveCount > 0 && !isAnimating) { if (confirm("確定要離開遊戲返回主選單嗎？進度會儲存。")) { saveGameProgress(); showScreen(startScreen); initializeApp(); } } else { showScreen(startScreen); initializeApp(); } }; backToStartButton.dataset.listenerAttached = 'true'; } }
    // --- 重置按鈕處理函數 ---
    function handleResetButtonClick() { if (isAnimating && moveCount > 0) { alert("遊戲處理中！"); return; } console.log("點擊重置按鈕"); if (confirm("確定要重新開始嗎？")) { localStorage.removeItem('roMatch3Save'); isAnimating = false; startGame(false); } }
    // --- 綁定排行榜畫面事件 ---
    function bindLeaderboardScreenEvents() { if (leaderboardBackButton.dataset.listenerAttached !== 'true') { leaderboardBackButton.onclick = () => { isAnimating = false; showScreen(startScreen); initializeApp(); }; leaderboardBackButton.dataset.listenerAttached = 'true'; } }

    // --- 顯示排行榜 ---
    async function showLeaderboard() {
        showScreen(leaderboardScreen); leaderboardTbody.innerHTML = ''; leaderboardTable.style.display = 'none';
        leaderboardLoading.style.display = 'block'; leaderboardLoading.textContent = '讀取中...';
        try {
            const response = await fetch('/leaderboard_data');
            if (!response.ok) { let errorMsg = `HTTP 錯誤！狀態: ${response.status}`; try { const errorData = await response.json(); if(errorData && errorData.error) errorMsg += ` - ${errorData.error}`; } catch (jsonError) {} throw new Error(errorMsg); }
            const data = await response.json();
            if (data.error) { leaderboardLoading.textContent = `讀取失敗: ${data.error}`; }
            else if (!Array.isArray(data)) { console.error("排行榜資料格式錯誤:", data); leaderboardLoading.textContent = '讀取錯誤 (格式錯誤)。'; }
            else if (data.length === 0) { leaderboardLoading.textContent = '目前還沒有排行榜紀錄喔！'; }
            else { data.forEach((entry, index) => { const row = leaderboardTbody.insertRow(); row.insertCell(0).textContent = index + 1; row.insertCell(1).textContent = entry.name; row.insertCell(2).textContent = entry.score; }); leaderboardTable.style.display = 'table'; leaderboardLoading.style.display = 'none'; }
        } catch (error) { console.error('無法獲取排行榜資料:', error); leaderboardLoading.textContent = `讀取排行榜時發生錯誤: ${error.message}`; }
    }

     // --- 開始遊戲 ---
     function startGame(loadSave) { console.log(`開始遊戲，載入存檔: ${loadSave}`); showScreen(gameScreen); isAnimating = false; try { initGame(loadSave); } catch (error) { console.error("無法開始遊戲:", error); gameBoardElement.innerHTML = `<p style="color: red;">無法載入遊戲: ${error.message}</p>`; } }

    // --- 核心函數：初始化遊戲 ---
    async function initGame(loadSave = false) {
        console.log("--- 初始化遊戲 ---"); isAnimating = true;
        let success = false;
        try {
            gameBoardElement.innerHTML = ''; tiles = []; board = []; score = 0; moveCount = INITIAL_MOVES; currentComboCount = 0; draggingTileInfo = null; isDragging = false; hideComboPopup(true); shuffleIndicator.style.display = 'none';
            let loadedSuccessfully = false;
            if (loadSave) { const savedGame = loadGameProgress(); if (savedGame) { console.log("載入有效存檔..."); board = savedGame.board; score = savedGame.score; moveCount = savedGame.moveCount; loadedSuccessfully = true; } else { console.log("找不到有效存檔，開始新遊戲..."); } }
            if (!loadedSuccessfully) { console.log("創建新遊戲版面..."); board = createInitialBoard(); if (!board) { throw new Error("無法生成有效的初始盤面！"); } score = 0; moveCount = INITIAL_MOVES; }
            if (!board || board.length === 0) { throw new Error("遊戲盤面數據為空，無法渲染！"); }
            updateScoreDisplay(); updateMovesDisplay(); renderBoard(true); console.log(`遊戲開始 - 分數: ${score}, 移動次數: ${moveCount}`);
            if (!hasPossibleMoves(board)) { console.warn("初始盤面無解，執行洗牌..."); await reshuffleBoard(); }
            else { isAnimating = false; } // 正常初始化完成後解鎖
            saveGameProgress(); console.log("--- 遊戲初始化完成 ---"); success = true;
        } catch (error) { console.error("初始化遊戲時發生錯誤:", error); gameBoardElement.innerHTML = `<p style="color: red;">初始化失敗: ${error.message}</p>`; isAnimating = false; } // 出錯也要解鎖
        // 不需要 finally 解鎖，因為成功和失敗路徑都已處理
    }

    // --- 創建初始數據版面 ---
    function createInitialBoard() { let newBoard; let attempts = 0; const maxAttempts = 50; let hasMoves = false; let immediateMatchesExist = true; do { newBoard = []; attempts++; for (let y = 0; y < BOARD_HEIGHT; y++) { const row = []; for (let x = 0; x < BOARD_WIDTH; x++) { let type; let generationAttempts = 0; const maxGenerationAttempts = 10; do { type = getRandomTileType(); generationAttempts++; if (generationAttempts > maxGenerationAttempts) break; } while ( (x >= 2 && row[x - 1] === type && row[x - 2] === type) || (y >= 2 && newBoard[y - 1]?.[x] === type && newBoard[y - 2]?.[x] === type) ); row.push(type); } newBoard.push(row); } immediateMatchesExist = checkMatchesOnBoard(newBoard).length > 0; if (!immediateMatchesExist) { hasMoves = hasPossibleMoves(newBoard); } else { hasMoves = false; } if (attempts > maxAttempts) { console.error(`嘗試 ${attempts} 次後，仍無法生成有效的初始版面！`); return null; } } while (immediateMatchesExist || !hasMoves); /* console.log(`創建了有效初始版面 (嘗試 ${attempts} 次)`); */ return newBoard; }
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
        let shouldCheckGameOver = false;
        try {
            await animateVisualSwap(tile1Info, tile2Info);
            const tempType = board[tile1Info.y][tile1Info.x]; board[tile1Info.y][tile1Info.x] = board[tile2Info.y][tile2Info.x]; board[tile2Info.y][tile2Info.x] = tempType;
            const matches = checkMatchesOnBoard(board);
            if (matches.length > 0) {
                moveCount--; updateMovesDisplay();
                const tile1Element = tile1Info.element; const tile2Element = tile2Info.element; tiles[tile1Info.y][tile1Info.x] = tile2Element; tiles[tile2Info.y][tile2Info.x] = tile1Element;
                tile1Element.dataset.x = tile1Info.x; tile1Element.dataset.y = tile1Info.y; tile2Element.dataset.x = tile2Info.x; tile2Element.dataset.y = tile2Info.y; renderBoard();
                await wait(50);
                await handleMatchesAndRefill(true); // This handles unlock and checkGameOver
                saveGameProgress();
            } else {
                board[tile2Info.y][tile2Info.x] = board[tile1Info.y][tile1Info.x]; board[tile1Info.y][tile1Info.x] = tempType;
                await animateVisualSwap(tile2Info, tile1Info);
                isAnimating = false; // Unlock after invalid swap animation
                shouldCheckGameOver = true;
            }
        } catch(error) { console.error("ProcessSwap 出錯:", error); isAnimating = false; shouldCheckGameOver = true; }
        finally { if (shouldCheckGameOver && !isAnimating) { checkGameOver(); } }
    }

    // --- 純視覺交換動畫 ---
    async function animateVisualSwap(tile1Info, tile2Info) { const tile1Element = tile1Info.element; const tile2Element = tile2Info.element; if (!tile1Element || !tile2Element || !tile1Element.isConnected || !tile2Element.isConnected) { console.warn("animateVisualSwap: 元素無效"); return; } const boardGap = parseFloat(getComputedStyle(gameBoardElement).gap || '0px'); const elementWidth = tile1Element.offsetWidth; const elementHeight = tile1Element.offsetHeight; const dx = (tile2Info.x - tile1Info.x) * (elementWidth + boardGap); const dy = (tile2Info.y - tile1Info.y) * (elementHeight + boardGap); tile1Element.style.transition = `transform ${ANIMATION_DURATION_MS_SWAP}ms ease-in-out`; tile2Element.style.transition = `transform ${ANIMATION_DURATION_MS_SWAP}ms ease-in-out`; tile1Element.style.transform = `translate(${dx}px, ${dy}px)`; tile2Element.style.transform = `translate(${-dx}px, ${-dy}px)`; tile1Element.style.zIndex = '10'; tile2Element.style.zIndex = '10'; await wait(ANIMATION_DURATION_MS_SWAP); tile1Element.style.transition = ''; tile2Element.style.transition = ''; tile1Element.style.transform = ''; tile2Element.style.transform = ''; tile1Element.style.zIndex = ''; tile2Element.style.zIndex = ''; }
    // --- 無法交換時的抖動動畫 ---
     async function animateWiggle(element) { if (!element || isAnimating) return; const tileStillAnimating = isAnimating; isAnimating = true; element.style.transition = 'transform 0.07s ease-in-out'; const originalTransform = element.style.transform; try { await wait(0); element.style.transform = originalTransform + ' translateX(5px)'; await wait(70); element.style.transform = originalTransform + ' translateX(-5px)'; await wait(70); element.style.transform = originalTransform + ' translateX(3px)'; await wait(70); element.style.transform = originalTransform + ' translateX(-3px)'; await wait(70); element.style.transform = originalTransform; await wait(70); } finally { element.style.transition = ''; if (!tileStillAnimating) { isAnimating = false; } } }

    // --- 核心流程：處理匹配、掉落、填充 ---
    async function handleMatchesAndRefill(isInitialMove = false) {
        let matches = checkMatchesOnBoard(board); let totalScoreGainedThisTurn = 0; let iteration = 0; const maxIterations = 20;
        let needsReshuffle = false;
        isAnimating = true;
        try {
            while (matches.length > 0 && iteration < maxIterations) {
                iteration++; const previousComboCount = currentComboCount; currentComboCount += matches.length;
                let scoreGained = 0; const allMatchedPositions = matches.flat(); const uniquePositions = Array.from(new Set(allMatchedPositions.map(p => `${p.x},${p.y}`))).map(s => { const [x, y] = s.split(','); return {x: parseInt(x), y: parseInt(y)}; });
                scoreGained = uniquePositions.length * 10; score += scoreGained; totalScoreGainedThisTurn += scoreGained; updateScoreDisplay();
                let movesGained = 0;
                if (isInitialMove && iteration === 1) { if (uniquePositions.length === 4) { movesGained = 1; } else if (uniquePositions.length >= 5) { movesGained = 2; } }
                if (previousComboCount < 3 && currentComboCount >= 3) { movesGained += 1; } if (previousComboCount < 5 && currentComboCount >= 5) { movesGained += 1; }
                if (movesGained > 0) { moveCount += movesGained; updateMovesDisplay(); }
                if (currentComboCount >= 2) { showComboPopup(currentComboCount); }
                await animateDisappear(uniquePositions);
                uniquePositions.forEach(tilePos => { if(board[tilePos.y]?.[tilePos.x]) board[tilePos.y][tilePos.x] = null; });
                await dropAndRefillBoard(); matches = checkMatchesOnBoard(board);
                if (matches.length > 0) { await wait(ANIMATION_DURATION_MS_SWAP / 2); }
            }
            if (iteration >= maxIterations) { console.error("達最大連鎖"); renderBoard(); }

            if (!hasPossibleMoves(board)) { console.log("盤面無可移動步數，執行洗牌..."); needsReshuffle = true; await reshuffleBoard(); }
        } catch (error) { console.error("handleMatchesAndRefill 出錯:", error); needsReshuffle = false; }
        finally { if (!needsReshuffle) { isAnimating = false; /* console.log("連鎖/檢查流程結束"); */ checkGameOver(); } }
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

    // --- 檢查是否有任何可能的移動 (接收 board 作為參數) ---
    function hasPossibleMoves(boardToCheck) {
        if (!boardToCheck || boardToCheck.length !== BOARD_HEIGHT) return false;
        for (let y = 0; y < BOARD_HEIGHT; y++) { for (let x = 0; x < BOARD_WIDTH; x++) {
            if (x < BOARD_WIDTH - 1) { if (canSwapCreateMatch(boardToCheck, x, y, x + 1, y)) return true; }
            if (y < BOARD_HEIGHT - 1) { if (canSwapCreateMatch(boardToCheck, x, y, x, y + 1)) return true; }
        } } return false;
    }
    // --- 檢查特定交換是否能產生匹配 (接收 board 作為參數) ---
    function canSwapCreateMatch(boardToCheck, x1, y1, x2, y2) {
        const tempBoard = boardToCheck.map(row => [...row]); const type1 = tempBoard[y1]?.[x1]; const type2 = tempBoard[y2]?.[x2]; if (!type1 || !type2) return false;
        tempBoard[y1][x1] = type2; tempBoard[y2][x2] = type1;
        let createsMatch = checkMatchesAfterSimulatedSwap(tempBoard, x1, y1) || checkMatchesAfterSimulatedSwap(tempBoard, x2, y2);
        return createsMatch;
    }
    // --- 僅檢查指定座標周圍是否形成三消 (接收 board 作為參數) ---
    function checkMatchesAfterSimulatedSwap(boardToCheck, x, y) { const type = boardToCheck[y]?.[x]; if (!type) return false; if ((boardToCheck[y]?.[x - 1] === type && boardToCheck[y]?.[x - 2] === type) || (boardToCheck[y]?.[x - 1] === type && boardToCheck[y]?.[x + 1] === type) || (boardToCheck[y]?.[x + 1] === type && boardToCheck[y]?.[x + 2] === type)) return true; if ((boardToCheck[y - 1]?.[x] === type && boardToCheck[y - 2]?.[x] === type) || (boardToCheck[y - 1]?.[x] === type && boardToCheck[y + 1]?.[x] === type) || (boardToCheck[y + 1]?.[x] === type && boardToCheck[y + 2]?.[x] === type)) return true; return false; }
    // --- 檢查整個版面的匹配 (用於實際消除, 接收 board 參數) ---
    function checkMatchesOnBoard(targetBoard) { const allMatches = []; if (!targetBoard || targetBoard.length !== BOARD_HEIGHT || !targetBoard[0] || targetBoard[0].length !== BOARD_WIDTH) { console.error("checkMatches 無效 board"); return allMatches; } for (let y = 0; y < BOARD_HEIGHT; y++) { for (let x = 0; x < BOARD_WIDTH - 2; ) { const type = targetBoard[y]?.[x]; if (!type || !TILE_TYPES.includes(type)) { x++; continue; } let match = [{x, y}]; for (let i = x + 1; i < BOARD_WIDTH; i++) { if (targetBoard[y]?.[i] === type) { match.push({x: i, y: y}); } else { break; } } if (match.length >= 3) { allMatches.push(match); x += match.length; } else { x++; } } } for (let x = 0; x < BOARD_WIDTH; x++) { for (let y = 0; y < BOARD_HEIGHT - 2; ) { const type = targetBoard[y]?.[x]; if (!type || !TILE_TYPES.includes(type)) { y++; continue; } let match = [{x, y}]; for (let i = y + 1; i < BOARD_HEIGHT; i++) { if (targetBoard[i]?.[x] === type) { match.push({x: x, y: i}); } else { break; } } if (match.length >= 3) { allMatches.push(match); y += match.length; } else { y++; } } } return allMatches; }

    // --- 洗牌邏輯與動畫 ---
    async function reshuffleBoard() {
        isAnimating = true; shuffleIndicator.style.opacity = '1'; shuffleIndicator.style.visibility = 'visible'; /* shuffleIndicator.classList.add('show'); */ console.log("開始洗牌...");
        try {
            const fadeOutPromises = []; gameBoardElement.childNodes.forEach(node => { if (node.classList?.contains('tile')) { fadeOutPromises.push(new Promise(resolve => { node.style.transition = `opacity ${ANIMATION_DURATION_MS_RESHUFFLE * 0.4}ms ease-out`; node.style.opacity = '0'; setTimeout(resolve, ANIMATION_DURATION_MS_RESHUFFLE * 0.4); })); } }); await Promise.all(fadeOutPromises); gameBoardElement.innerHTML = '';
            let attempts = 0; const maxReshuffleAttempts = 10; let newBoard;
            do { newBoard = createInitialBoard(); attempts++; if (attempts > maxReshuffleAttempts) { throw new Error("洗牌多次後仍無法生成有解的版面！"); } } while (!newBoard); // createInitialBoard 已保證有解
            board = newBoard; console.log(`洗牌完成 (嘗試 ${attempts} 次)`);
            renderBoard();
            const allNewTilesInfo = []; for (let y = 0; y < BOARD_HEIGHT; y++) { for (let x = 0; x < BOARD_WIDTH; x++) { if (board[y][x]) { allNewTilesInfo.push({ x, y, type: board[y][x] }); } } }
            await animateNewTiles(allNewTilesInfo, ANIMATION_DURATION_MS_RESHUFFLE);
        } catch (error) {
            console.error("洗牌過程中發生錯誤:", error); alert("哎呀，洗牌時好像出錯了，需要重新開始遊戲 T_T");
            localStorage.removeItem('roMatch3Save'); isAnimating = false; startGame(false); return;
        } finally {
             shuffleIndicator.style.transition = `opacity ${ANIMATION_DURATION_MS_RESHUFFLE * 0.3}ms ease-out, visibility 0s linear ${ANIMATION_DURATION_MS_RESHUFFLE * 0.3}ms`; shuffleIndicator.style.opacity = '0'; shuffleIndicator.style.visibility = 'hidden';
             isAnimating = false; // ✨ 洗牌結束後解鎖 ✨
             console.log("洗牌結束，解除動畫鎖定。");
             // 洗牌後不需要檢查遊戲結束
        }
    }

    // --- 更新分數和移動次數顯示 ---
    function updateScoreDisplay() { scoreElement.textContent = score; }
    function updateMovesDisplay() { movesElement.textContent = moveCount; }
    // --- Combo 彈出文字相關函數 ---
    function showComboPopup(combo) { if (comboTimeoutId) { clearTimeout(comboTimeoutId); } comboPopupElement.textContent = `${combo} Combo!`; comboPopupElement.classList.add('show'); comboTimeoutId = setTimeout(() => { hideComboPopup(); }, COMBO_POPUP_DURATION_MS); }
    function hideComboPopup(immediately = false) { if (comboTimeoutId) { clearTimeout(comboTimeoutId); comboTimeoutId = null; } if (immediately) { comboPopupElement.classList.remove('show'); comboPopupElement.style.transition = 'none'; comboPopupElement.style.opacity = '0'; comboPopupElement.style.visibility = 'hidden'; setTimeout(() => { comboPopupElement.style.transition = ''; comboPopupElement.style.opacity = ''; comboPopupElement.style.visibility = ''; }, 50); } else { comboPopupElement.classList.remove('show'); } }

    // --- 檢查遊戲是否結束 ---
    function checkGameOver() {
        // ✨ 只有在不在動畫中且移動次數耗盡時觸發 ✨
        if (moveCount <= 0 && !isAnimating) {
            console.log("遊戲結束！"); isAnimating = true; // 鎖定防止其他操作
            setTimeout(async () => {
                 hideComboPopup(true);
                 const playerName = prompt(`遊戲結束！\n你的最終分數是：${score}\n\n請輸入你的名字以記錄到排行榜 (最多50字)：`, "匿名玩家");
                 let shouldShowLeaderboard = false;
                 if (playerName !== null && playerName.trim() !== "") { await submitScoreToLeaderboard(playerName.trim().substring(0, 50), score); shouldShowLeaderboard = true; }
                 else if (playerName !== null && playerName.trim() === ""){ alert("名字不能是空白喔！將不會記錄分數。"); }
                 else { alert("未記錄分數，返回主選單。"); }
                 localStorage.removeItem('roMatch3Save'); // 清除本局存檔
                 if(shouldShowLeaderboard) {
                     await showLeaderboard(); // isAnimating 保持 true 直到返回
                 } else {
                     showScreen(startScreen); initializeApp(); isAnimating = false; // 解鎖
                 }
            }, 500); // 延遲顯示提示
            return true;
        }
        return false;
    }

     // --- 提交分數到後端 ---
     async function submitScoreToLeaderboard(name, finalScore) { console.log(`提交分數: Name='${name}', Score=${finalScore}`); try { const response = await fetch('/submit_score', { method: 'POST', headers: { 'Content-Type': 'application/json', }, body: JSON.stringify({ name: name, score: finalScore }), }); const result = await response.json(); if (!response.ok || result.error) { throw new Error(result.error || `HTTP 狀態 ${response.status}`); } console.log("分數提交成功！"); } catch (error) { console.error('提交分數時發生錯誤:', error); alert(`哎呀，分數提交失敗了 T_T\n錯誤: ${error.message}`); } }
     // --- 遊戲盤閃爍提示 ---
     function flashGameBoard(color = '#ffcccc') { const originalBg = gameBoardElement.style.backgroundColor; gameBoardElement.style.transition = 'background-color 0.1s ease-in-out'; gameBoardElement.style.backgroundColor = color; setTimeout(() => { gameBoardElement.style.backgroundColor = originalBg; setTimeout(() => { gameBoardElement.style.transition = ''; }, 150); }, 150); }
    // --- 儲存/載入遊戲進度 ---
    function saveGameProgress() { if (isAnimating) return; if (!board || board.length !== BOARD_HEIGHT || !board[0] || board[0].length !== BOARD_WIDTH) { console.warn("嘗試儲存無效 board"); return; } const gameState = { board: board, score: score, moveCount: moveCount }; try { localStorage.setItem('roMatch3Save', JSON.stringify(gameState)); } catch (e) { console.error("儲存失敗:", e); } }
    function loadGameProgress() { const savedState = localStorage.getItem('roMatch3Save'); if (savedState) { try { const parsedState = JSON.parse(savedState); if (parsedState && Array.isArray(parsedState.board) && parsedState.board.length === BOARD_HEIGHT && parsedState.board.every(row => Array.isArray(row) && row.length === BOARD_WIDTH) && typeof parsedState.score === 'number' && (parsedState.moveCount === undefined || typeof parsedState.moveCount === 'number') ) { if (parsedState.moveCount === undefined || parsedState.moveCount > 0) { /* console.log("讀取有效且可繼續的進度"); */ if (parsedState.moveCount === undefined) parsedState.moveCount = INITIAL_MOVES; return parsedState; } else { console.log("存檔移動次數已耗盡"); localStorage.removeItem('roMatch3Save'); return null; } } else { console.warn("存檔格式錯誤"); localStorage.removeItem('roMatch3Save'); } } catch (e) { console.error("讀取失敗:", e); localStorage.removeItem('roMatch3Save'); } } return null; }
    // --- 處理初始匹配 (已移到 createInitialBoard 內保證) ---
    async function handleInitialMatches() { /* console.log("跳過初始匹配檢查"); */ return Promise.resolve(); }

    // --- 應用程式啟動點 ---
    initializeApp();

}); // DOMContentLoaded 結束