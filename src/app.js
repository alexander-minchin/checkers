// --- DOM Elements ---
// We must re-select elements after they are injected into the DOM
const authView = document.getElementById('auth-view');
const lobbyView = document.getElementById('lobby-view');
const gameView = document.getElementById('game-view');
const allViews = [authView, lobbyView, gameView];

const emailInput = document.getElementById('email-input');
const usernameInput = document.getElementById('username-input');
const signinButton = document.getElementById('signin-button');
const authError = document.getElementById('auth-error');
const authSuccess = document.getElementById('auth-success');
const userGreeting = document.getElementById('user-greeting');
const logoutButton = document.getElementById('logout-button');

const createGameButton = document.getElementById('create-game-button');
const gamesList = document.getElementById('games-list');

const boardElement = document.getElementById('board');
const statusElement = document.getElementById('status');
const forfeitButton = document.getElementById('forfeit-button');
const leaveGameButton = document.getElementById('leave-game-button');

const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalClose = document.getElementById('modal-close');

// --- Game State ---
let currentUser = null;
let currentGameId = null;
let gameSubscription = null;
let gamesSubscription = null;
let selectedPiece = null;

// --- Constants ---
const PIECE_MAP = { 0: 'empty', 1: 'red-piece', 2: 'black-piece', 3: 'red-piece king', 4: 'black-piece king' };

// --- Utility Functions ---
function showView(viewToShow) {
    allViews.forEach(view => view.classList.add('hidden'));
    viewToShow.classList.remove('hidden');
}

function showModal(title, body) {
    modalTitle.textContent = title;
    modalBody.textContent = body;
    modal.classList.remove('hidden');
}

// --- API Call Helpers ---
async function callApi(endpoint, body) {
    const { data: { session } } = await window.supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated!");

    const response = await fetch(`/.netlify/functions/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Request failed`);
    }
    return response.json();
}

// --- Auth Logic ---
signinButton.addEventListener('click', async () => {
    const email = emailInput.value;
    const username = usernameInput.value;
    authError.textContent = '';
    authSuccess.textContent = '';

    if (!email) {
        authError.textContent = 'Email is required.';
        return;
    }

    const { error } = await window.supabase.auth.signInWithOtp({
        email,
        options: {
            shouldCreateUser: true,
            data: { username: username || email.split('@')[0] }
        }
    });

    if (error) {
        authError.textContent = error.message;
    } else {
        authSuccess.textContent = 'Success! Check your email for a login link.';
    }
});

logoutButton.addEventListener('click', () => window.supabase.auth.signOut());

async function handleAuthStateChange(event, session) {
    if (event === 'SIGNED_IN' && session) {
        currentUser = session.user;
        showView(lobbyView);
        const { data } = await window.supabase.from('profiles').select('username').eq('id', currentUser.id).single();
        userGreeting.textContent = `Hi, ${data?.username || 'friend'}!`;
        subscribeToGamesList();
    } else if (event === 'SIGNED_OUT') {
        currentUser = null;
        if (gameSubscription) gameSubscription.unsubscribe();
        if (gamesSubscription) gamesSubscription.unsubscribe();
        showView(authView);
    }
}

// --- Lobby Logic ---
createGameButton.addEventListener('click', async () => {
    try {
        const { gameId } = await callApi('game-create');
        enterGame(gameId);
    } catch (error) { alert(`Error: ${error.message}`); }
});

async function joinGame(gameId) {
    try {
        await callApi('game-join', { gameId });
        enterGame(gameId);
    } catch (error) { alert(`Error: ${error.message}`); }
}

function renderGamesList(games) {
    gamesList.innerHTML = '';
    const waitingGames = games.filter(g => g.status === 'waiting' && g.game_players.length === 1);

    if (waitingGames.length === 0) {
        gamesList.innerHTML = '<p class="text-gray-500">No available games. Create one!</p>';
        return;
    }
    waitingGames.forEach(game => {
        const el = document.createElement('div');
        el.className = 'p-4 bg-gray-100 rounded-md flex justify-between items-center';
        el.innerHTML = `<span>Game by ${game.game_players[0].player_id.substring(0, 8)}...</span>`;
        const btn = document.createElement('button');
        btn.textContent = 'Join';
        btn.className = 'px-4 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600';
        btn.onclick = () => joinGame(game.id);
        el.appendChild(btn);
        gamesList.appendChild(el);
    });
}

function subscribeToGamesList() {
    if (gamesSubscription) gamesSubscription.unsubscribe();
    gamesSubscription = window.supabase.channel('public-games')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, () => fetchAndRenderGames())
        .subscribe(status => { if (status === 'SUBSCRIBED') fetchAndRenderGames(); });
}

async function fetchAndRenderGames() {
    const { data } = await window.supabase.from('games').select('*, game_players(*)');
    if (data) renderGamesList(data);
}

// --- Game Logic ---
function enterGame(gameId) {
    currentGameId = gameId;
    if (gamesSubscription) gamesSubscription.unsubscribe();
    showView(gameView);
    subscribeToCurrentGame();
}

function leaveGame() {
    if (gameSubscription) gameSubscription.unsubscribe();
    currentGameId = null;
    showView(lobbyView);
    subscribeToGamesList();
}

forfeitButton.addEventListener('click', async () => {
    if (confirm('Are you sure?')) {
        try { await callApi('game-forfeit', { gameId: currentGameId }); }
        catch (error) { alert(`Error: ${error.message}`); }
    }
});
leaveGameButton.addEventListener('click', leaveGame);
modalClose.addEventListener('click', () => {
    modal.classList.add('hidden');
    leaveGame();
});

function subscribeToCurrentGame() {
    if (gameSubscription) gameSubscription.unsubscribe();
    gameSubscription = window.supabase.channel(`game-${currentGameId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${currentGameId}` }, p => handleGameUpdate(p.new))
        .subscribe(async status => {
            if (status === 'SUBSCRIBED') {
                const { data } = await window.supabase.from('games').select('*, game_players(*, profiles(username))').eq('id', currentGameId).single();
                if (data) handleGameUpdate(data);
            }
        });
}

function handleGameUpdate(game) {
    if (game.game_state) renderBoard(game.game_state.board);
    updateStatus(game);
    checkGameEnd(game);
}

function updateStatus(game) {
    if (game.status === 'waiting') {
        statusElement.textContent = 'Waiting for opponent...';
        return;
    }
    if (game.status === 'finished' || game.status === 'abandoned') {
        const winner = game.game_players.find(p => p.player_id === game.winner_player_id);
        statusElement.textContent = `Game Over: ${winner?.profiles?.username || 'Opponent'} wins!`;
        return;
    }
    statusElement.textContent = game.current_turn_player_id === currentUser.id ? "It's your turn!" : "Waiting for opponent...";
}

function checkGameEnd(game) {
    if (game.status === 'finished' || game.status === 'abandoned') {
        let body = "It's a draw!";
        if (game.winner_player_id) {
            body = game.winner_player_id === currentUser.id ? 'You won!' : 'You lost.';
        }
        showModal('Game Over', body);
    }
}

function renderBoard(board) {
    boardElement.innerHTML = '';
    board.forEach((row, r) => row.forEach((pieceType, c) => {
        const square = document.createElement('div');
        square.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
        square.dataset.row = r;
        square.dataset.col = c;
        if (pieceType !== 0) {
            const piece = document.createElement('div');
            piece.className = `piece ${PIECE_MAP[pieceType]}`;
            square.appendChild(piece);
        }
        boardElement.appendChild(square);
    }));
}

boardElement.addEventListener('click', async (e) => {
    const square = e.target.closest('.square');
    if (!square) return;

    const row = parseInt(square.dataset.row);
    const col = parseInt(square.dataset.col);

    if (selectedPiece) {
        const move = { from: selectedPiece, to: { row, col } };
        try {
            statusElement.textContent = 'Submitting move...';
            await callApi('game-takeTurn', { gameId: currentGameId, move });
        } catch (error) {
            alert(`Invalid move: ${error.message}`);
            const { data } = await window.supabase.from('games').select('*, game_players(*, profiles(username))').eq('id', currentGameId).single();
            if(data) handleGameUpdate(data);
        } finally {
            const selectedEl = document.querySelector('.piece.selected');
            if(selectedEl) selectedEl.classList.remove('selected');
            selectedPiece = null;
        }
    } else if (square.querySelector('.piece')) {
        selectedPiece = { row, col };
        square.querySelector('.piece').classList.add('selected');
    }
});

// --- Initial Setup ---
window.supabase.auth.getSession().then(({ data: { session } }) => {
    handleAuthStateChange(session ? 'SIGNED_IN' : 'SIGNED_OUT', session);
});
window.supabase.auth.onAuthStateChange(handleAuthStateChange);
