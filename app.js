const CONFIG = {
    updateInterval: 6000,
    calibrationPoints: 3,
    maxHistoryItems: 10,
    baudRate: 9600
};

const state = {
    port: null,
    reader: null,
    isConnected: false,
    currentDistance: 0,
    jarLevel: 0,
    lastUpdate: null,
    measurements: [],
    history: [],
    isAuthenticated: false,
    currentUser: null,
    isCalibrating: false,
    currentCalibrationStep: 0,
    calibrationData: {
        empty: null,
        half: null,
        full: null,
        height: 30
    },
    updateTimer: null,
    countdownTimer: null,
    timeUntilUpdate: CONFIG.updateInterval / 1000
};

const elements = {
    status: document.getElementById('status'),
    jarFill: document.getElementById('jarFill'),
    distanceValue: document.getElementById('distanceValue'),
    levelValue: document.getElementById('levelValue'),
    connectBtn: document.getElementById('connectBtn'),
    disconnectBtn: document.getElementById('disconnectBtn'),
    calibrateBtn: document.getElementById('calibrateBtn'),
    jarHeight: document.getElementById('jarHeight'),
    timestamp: document.getElementById('timestamp'),
    updateIndicator: document.getElementById('updateIndicator'),
    countdown: document.getElementById('countdown'),
    authButtons: document.getElementById('authButtons'),
    loginBtn: document.getElementById('loginBtn'),
    registerBtn: document.getElementById('registerBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    userInfo: document.getElementById('userInfo'),
    userName: document.getElementById('userName'),
    userEmail: document.getElementById('userEmail'),
    userAvatar: document.getElementById('userAvatar'),
    registerModal: document.getElementById('registerModal'),
    loginModal: document.getElementById('loginModal'),
    calibrateModal: document.getElementById('calibrateModal'),
    registerForm: document.getElementById('registerForm'),
    loginForm: document.getElementById('loginForm'),
    registerAlert: document.getElementById('registerAlert'),
    loginAlert: document.getElementById('loginAlert'),
    calibrateAlert: document.getElementById('calibrateAlert'),
    calibrationSection: document.getElementById('calibrationSection'),
    calEmpty: document.getElementById('calEmpty'),
    calHalf: document.getElementById('calHalf'),
    calFull: document.getElementById('calFull'),
    calHeight: document.getElementById('calHeight'),
    historySection: document.getElementById('historySection'),
    historyList: document.getElementById('historyList')
};

function updateTimestamp() {
    const now = new Date();
    elements.timestamp.textContent = now.toLocaleTimeString();
}

function setStatus(type, message) {
    elements.status.textContent = message;
    elements.status.className = 'status';
    if (type === 'connected') elements.status.classList.add('connected');
    else if (type === 'error') elements.status.classList.add('error');
    else if (type === 'warning') elements.status.classList.add('warning');
}

function updateUI() {
    if (state.isConnected) {
        elements.connectBtn.disabled = true;
        elements.disconnectBtn.disabled = false;
        elements.calibrateBtn.disabled = false;
    } else {
        elements.connectBtn.disabled = false;
        elements.disconnectBtn.disabled = true;
        elements.calibrateBtn.disabled = true;
        elements.distanceValue.textContent = '—';
        elements.levelValue.textContent = '—';
        elements.jarFill.style.height = '0%';
        elements.updateIndicator.classList.remove('active');
        stopPeriodicUpdate();
    }
}

function updateJarVisualization() {
    const fillHeight = state.jarLevel;
    elements.jarFill.style.height = `${fillHeight}%`;
    
    if (fillHeight < 20) {
        elements.jarFill.style.background = 'linear-gradient(to top, #e74c3c, #e67e22)';
    } else if (fillHeight < 50) {
        elements.jarFill.style.background = 'linear-gradient(to top, #f39c12, #f1c40f)';
    } else {
        elements.jarFill.style.background = 'linear-gradient(to top, #27ae60, #2ecc71)';
    }
}

function updateValues() {
    elements.distanceValue.textContent = state.currentDistance.toFixed(1);
    elements.levelValue.textContent = state.jarLevel.toFixed(1);
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showAlert(elementId, message, type) {
    const alert = document.getElementById(elementId);
    alert.textContent = message;
    alert.className = `alert ${type}`;
    setTimeout(() => { alert.className = 'alert'; alert.textContent = ''; }, 5000);
}

function showModal(modalId) {
    hideAllModals();
    document.getElementById(modalId).classList.add('active');
}

function hideAllModals() {
    [elements.registerModal, elements.loginModal, elements.calibrateModal].forEach(modal => {
        modal.classList.remove('active');
    });
}

function hideModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

async function handleConnect() {
    try {
        if (state.isConnected && state.port) {
            setStatus('warning', 'Уже подключено');
            return;
        }
        
        if (!navigator.serial) {
            setStatus('error', 'Используйте Chrome или Edge');
            alert('Ваш браузер не поддерживает Serial API');
            return;
        }
        
        setStatus('warning', 'Выбор порта...');
        
        const port = await navigator.serial.requestPort();
        if (!port) {
            setStatus('error', 'Порт не выбран');
            return;
        }
        
        setStatus('warning', 'Открытие порта...');
        
        try {
            if (port.readable || port.writable) {
                await closePortSafely(port);
            }
            
            await port.open({ 
                baudRate: CONFIG.baudRate,
                dataBits: 8,
                stopBits: 1,
                parity: 'none'
            });
            
            state.port = port;
            state.isConnected = true;
            state.measurements = [];
            
            setStatus('connected', 'Подключено к Arduino');
            updateUI();
            
            startPeriodicUpdate();
            
            readData();
            
        } catch (openError) {
            setStatus('error', 'Ошибка открытия порта');
            console.error('Ошибка открытия порта:', openError);
            
            try {
                if (port.readable || port.writable) {
                    await closePortSafely(port);
                }
            } catch (closeError) {
                console.error('Ошибка при закрытии порта:', closeError);
            }
            
            state.port = null;
            state.isConnected = false;
            updateUI();
        }
        
    } catch (error) {
        if (error.name === 'NotFoundError') {
            setStatus('error', 'Порт не выбран');
        } else {
            setStatus('error', 'Ошибка подключения');
            console.error('Ошибка подключения:', error);
        }
        updateUI();
    }
}

async function closePortSafely(port) {
    try {
        if (state.reader) {
            await state.reader.cancel();
            state.reader = null;
        }
        await port.close();
        await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
        console.warn('Ошибка при закрытии порта:', error);
    }
}

async function readData() {
    if (!state.isConnected || !state.port || !state.port.readable) return;
    
    try {
        const textDecoder = new TextDecoderStream();
        state.port.readable.pipeTo(textDecoder.writable);
        state.reader = textDecoder.readable.getReader();
        
        while (state.isConnected) {
            try {
                const { value, done } = await state.reader.read();
                if (done) break;
                if (value) processData(value);
            } catch (readError) {
                if (state.isConnected) break;
            }
        }
    } catch (error) {
        console.error('Ошибка чтения:', error);
        if (state.isConnected) {
            setTimeout(() => {
                if (state.isConnected) {
                    handleDisconnect();
                    setTimeout(handleConnect, 1000);
                }
            }, 2000);
        }
    } finally {
        if (state.reader) {
            try { await state.reader.cancel(); } catch (e) {}
            state.reader = null;
        }
    }
}

function processData(data) {
    const lines = data.split('\n');
    
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        
        const distance = parseFloat(trimmedLine);
        
        if (!isNaN(distance) && distance > 0 && distance < 400) {
            state.measurements.push(distance);
            if (state.measurements.length > 5) {
                state.measurements.shift();
            }
            
            if (state.measurements.length > 0) {
                const sum = state.measurements.reduce((a, b) => a + b, 0);
                const average = sum / state.measurements.length;
                
                state.currentDistance = average;
                state.lastUpdate = new Date();
                
                if (state.isCalibrating) {
                    saveCalibrationValue(state.currentCalibrationStep, state.currentDistance);
                }
                
                state.jarLevel = calculateJarLevel(state.currentDistance);
            }
        }
    }
}

async function handleDisconnect() {
    setStatus('warning', 'Отключение...');
    state.isConnected = false;
    
    stopPeriodicUpdate();
    
    try {
        if (state.reader) {
            await state.reader.cancel();
            state.reader = null;
        }
        if (state.port) {
            await closePortSafely(state.port);
            state.port = null;
        }
        setStatus('error', 'Отключено');
    } catch (error) {
        console.error('Ошибка при отключении:', error);
        setStatus('error', 'Ошибка отключения');
    }
    
    state.measurements = [];
    state.currentDistance = 0;
    state.jarLevel = 0;
    
    updateUI();
}

async function cleanup() {
    if (state.isConnected) {
        try { await handleDisconnect(); } catch (error) {}
    }
}

function startPeriodicUpdate() {
    stopPeriodicUpdate();
    
    forceUpdate();
    
    state.updateTimer = setInterval(forceUpdate, CONFIG.updateInterval);
    
    state.timeUntilUpdate = CONFIG.updateInterval / 1000;
    state.countdownTimer = setInterval(() => {
        state.timeUntilUpdate--;
        if (state.timeUntilUpdate <= 0) {
            state.timeUntilUpdate = CONFIG.updateInterval / 1000;
        }
        elements.countdown.textContent = state.timeUntilUpdate;
    }, 1000);
}

function stopPeriodicUpdate() {
    if (state.updateTimer) {
        clearInterval(state.updateTimer);
        state.updateTimer = null;
    }
    if (state.countdownTimer) {
        clearInterval(state.countdownTimer);
        state.countdownTimer = null;
    }
}

function forceUpdate() {
    if (!state.isConnected || state.currentDistance === 0) return;
    
    elements.updateIndicator.classList.add('active');
    
    updateJarVisualization();
    updateValues();
    updateTimestamp();
    
    saveToHistory(state.currentDistance, state.jarLevel);
    
    state.timeUntilUpdate = CONFIG.updateInterval / 1000;
    elements.countdown.textContent = state.timeUntilUpdate;
    
    setTimeout(() => {
        elements.updateIndicator.classList.remove('active');
    }, 1000);
}

function loadCalibration() {
    const savedCalibration = localStorage.getItem('jarCalibration');
    if (savedCalibration) {
        try {
            state.calibrationData = JSON.parse(savedCalibration);
            updateCalibrationUI();
            elements.calibrationSection.style.display = 'block';
        } catch (e) {
            localStorage.removeItem('jarCalibration');
        }
    }
}

function saveCalibration() {
    if (state.calibrationData.empty && state.calibrationData.full) {
        state.calibrationData.height = Math.abs(state.calibrationData.full - state.calibrationData.empty);
        state.calibrationData.height = Math.round(state.calibrationData.height * 10) / 10;
    }
    
    localStorage.setItem('jarCalibration', JSON.stringify(state.calibrationData));
    updateCalibrationUI();
    
    hideModal('calibrateModal');
    
    elements.calibrationSection.style.display = 'block';
    
    state.isCalibrating = false;
    state.currentCalibrationStep = 0;
    
    elements.jarHeight.textContent = state.calibrationData.height || 30;
}

function cancelCalibration() {
    state.isCalibrating = false;
    state.currentCalibrationStep = 0;
    resetCalibrationUI();
    hideModal('calibrateModal');
}

function startCalibration(step) {
    if (!state.isConnected) {
        showAlert('calibrateAlert', 'Сначала подключите Arduino', 'error');
        return;
    }
    
    state.isCalibrating = true;
    state.currentCalibrationStep = step;
    
    resetCalibrationUI();
    const stepElement = document.getElementById(`step${step}`);
    stepElement.classList.add('active');
    
    if (step < CONFIG.calibrationPoints) {
        const nextStep = document.getElementById(`step${step + 1}`);
        const button = nextStep.querySelector('button');
        button.disabled = false;
    }
    
    let instruction = '';
    switch(step) {
        case 1: instruction = 'Убедитесь, что банка ПУСТАЯ и нажмите "Сохранить значение"'; break;
        case 2: instruction = 'Заполните банку НАПОЛОВИНУ и нажмите "Сохранить значение"'; break;
        case 3: instruction = 'Заполните банку ПОЛНОСТЬЮ и нажмите "Сохранить значение"'; break;
    }
    
    showAlert('calibrateAlert', instruction, 'success');
    
    if (step === CONFIG.calibrationPoints) {
        document.getElementById('saveCalibration').disabled = false;
    }
}

function saveCalibrationValue(step, value) {
    switch(step) {
        case 1: state.calibrationData.empty = value; break;
        case 2: state.calibrationData.half = value; break;
        case 3: state.calibrationData.full = value; break;
    }
    
    const stepElement = document.getElementById(`step${step}`);
    stepElement.classList.remove('active');
    stepElement.classList.add('completed');
    
    updateCalibrationUI();
}

function resetCalibrationUI() {
    for (let i = 1; i <= CONFIG.calibrationPoints; i++) {
        const stepElement = document.getElementById(`step${i}`);
        stepElement.classList.remove('active', 'completed');
        const button = stepElement.querySelector('button');
        button.disabled = i !== 1;
    }
    document.getElementById('saveCalibration').disabled = true;
}

function updateCalibrationUI() {
    elements.calEmpty.textContent = state.calibrationData.empty ? 
        `${state.calibrationData.empty.toFixed(1)} см` : '— см';
    elements.calHalf.textContent = state.calibrationData.half ? 
        `${state.calibrationData.half.toFixed(1)} см` : '— см';
    elements.calFull.textContent = state.calibrationData.full ? 
        `${state.calibrationData.full.toFixed(1)} см` : '— см';
    elements.calHeight.textContent = state.calibrationData.height ? 
        `${state.calibrationData.height.toFixed(1)} см` : '— см';
}

function calculateJarLevel(distance) {
    if (!state.calibrationData.empty || !state.calibrationData.full) {
        const level = Math.max(0, 100 - (distance / 30) * 100);
        return Math.min(100, Math.round(level * 10) / 10);
    }
    
    const empty = state.calibrationData.empty;
    const full = state.calibrationData.full;
    
    let level = 100 - ((distance - full) / (empty - full)) * 100;
    
    level = Math.max(0, Math.min(100, level));
    
    return Math.round(level * 10) / 10;
}

function checkSavedSession() {
    const savedUser = localStorage.getItem('smartJarUser');
    if (savedUser) {
        try {
            state.currentUser = JSON.parse(savedUser);
            state.isAuthenticated = true;
            loadHistory();
        } catch (e) {
            localStorage.removeItem('smartJarUser');
        }
    }
}

function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    
    if (!name || !email || !password) {
        showAlert('registerAlert', 'Заполните все поля', 'error');
        return;
    }
    
    if (password.length < 6) {
        showAlert('registerAlert', 'Пароль должен содержать не менее 6 символов', 'error');
        return;
    }
    
    if (!validateEmail(email)) {
        showAlert('registerAlert', 'Введите корректный email', 'error');
        return;
    }
    
    const existingUser = localStorage.getItem(`user_${email}`);
    if (existingUser) {
        showAlert('registerAlert', 'Пользователь с таким email уже существует', 'error');
        return;
    }
    
    const user = {
        id: Date.now(),
        name: name,
        email: email,
        password: password,
        createdAt: new Date().toISOString()
    };
    
    localStorage.setItem(`user_${email}`, JSON.stringify(user));
    localStorage.setItem('smartJarUser', JSON.stringify(user));
    
    state.currentUser = user;
    state.isAuthenticated = true;
    updateAuthUI();
    hideModal('registerModal');
    createUserHistory();
    showAlert('loginAlert', 'Регистрация успешна!', 'success');
}

function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        showAlert('loginAlert', 'Заполните все поля', 'error');
        return;
    }
    
    const userData = localStorage.getItem(`user_${email}`);
    if (!userData) {
        showAlert('loginAlert', 'Пользователь не найден', 'error');
        return;
    }
    
    const user = JSON.parse(userData);
    if (user.password !== password) {
        showAlert('loginAlert', 'Неверный пароль', 'error');
        return;
    }
    
    localStorage.setItem('smartJarUser', JSON.stringify(user));
    state.currentUser = user;
    state.isAuthenticated = true;
    updateAuthUI();
    hideModal('loginModal');
    loadHistory();
}

function logout() {
    if (confirm('Вы уверены, что хотите выйти?')) {
        state.isAuthenticated = false;
        state.currentUser = null;
        localStorage.removeItem('smartJarUser');
        updateAuthUI();
    }
}

function updateAuthUI() {
    if (state.isAuthenticated && state.currentUser) {
        elements.userName.textContent = state.currentUser.name;
        elements.userEmail.textContent = state.currentUser.email;
        elements.userAvatar.textContent = state.currentUser.name.charAt(0).toUpperCase();
        elements.userInfo.style.display = 'flex';
        elements.authButtons.style.display = 'none';
        elements.historySection.style.display = 'block';
    } else {
        elements.userInfo.style.display = 'none';
        elements.authButtons.style.display = 'flex';
        elements.historySection.style.display = 'none';
    }
}

function createUserHistory() {
    const history = { userId: state.currentUser.id, measurements: [] };
    localStorage.setItem(`history_${state.currentUser.id}`, JSON.stringify(history));
    state.history = history.measurements;
    updateHistoryUI();
}

function loadHistory() {
    const savedHistory = localStorage.getItem(`history_${state.currentUser.id}`);
    if (savedHistory) {
        const history = JSON.parse(savedHistory);
        state.history = history.measurements || [];
        updateHistoryUI();
    } else {
        createUserHistory();
    }
}

function saveToHistory(distance, level) {
    if (!state.isAuthenticated) return;
    const measurement = { timestamp: new Date().toISOString(), distance: distance, level: level };
    state.history.unshift(measurement);
    if (state.history.length > CONFIG.maxHistoryItems) {
        state.history = state.history.slice(0, CONFIG.maxHistoryItems);
    }
    const historyData = { userId: state.currentUser.id, measurements: state.history };
    localStorage.setItem(`history_${state.currentUser.id}`, JSON.stringify(historyData));
    updateHistoryUI();
}

function updateHistoryUI() {
    elements.historyList.innerHTML = '';
    if (state.history.length === 0) {
        elements.historyList.innerHTML = '<div style="text-align: center; color: #95a5a6; padding: 20px;">История измерений пока пуста</div>';
        return;
    }
    state.history.forEach(measurement => {
        const item = document.createElement('div');
        item.className = 'history-item';
        const time = new Date(measurement.timestamp).toLocaleTimeString();
        const date = new Date(measurement.timestamp).toLocaleDateString();
        item.innerHTML = `
            <div><div>${date}</div><div class="time">${time}</div></div>
            <div><div class="value">${measurement.distance.toFixed(1)} см</div><div style="font-size:0.9rem;color:#2ecc71;">${measurement.level.toFixed(1)}%</div></div>
        `;
        elements.historyList.appendChild(item);
    });
}

function init() {
    updateTimestamp();
    
    loadCalibration();
    
    checkSavedSession();
    
    elements.connectBtn.addEventListener('click', handleConnect);
    elements.disconnectBtn.addEventListener('click', handleDisconnect);
    elements.calibrateBtn.addEventListener('click', () => showModal('calibrateModal'));
    
    elements.loginBtn.addEventListener('click', () => showModal('loginModal'));
    elements.registerBtn.addEventListener('click', () => showModal('registerModal'));
    elements.logoutBtn.addEventListener('click', logout);
    
    elements.registerForm.addEventListener('submit', handleRegister);
    elements.loginForm.addEventListener('submit', handleLogin);
    
    document.getElementById('cancelRegister').addEventListener('click', () => hideModal('registerModal'));
    document.getElementById('cancelLogin').addEventListener('click', () => hideModal('loginModal'));
    document.getElementById('cancelCalibrate').addEventListener('click', cancelCalibration);
    document.getElementById('saveCalibration').addEventListener('click', saveCalibration);
    
    window.addEventListener('beforeunload', cleanup);
    
    [elements.registerModal, elements.loginModal, elements.calibrateModal].forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) hideModal(modal.id);
        });
    });
    
    updateUI();
    updateAuthUI();
    updateCalibrationUI();
}

const app = {
    init,
    handleConnect,
    handleDisconnect,
    startCalibration,
    saveCalibration,
    cancelCalibration,
    showModal,
    hideModal
};

document.addEventListener('DOMContentLoaded', init);

window.app = app;