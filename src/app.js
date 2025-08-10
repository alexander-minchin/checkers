// --- DOM Elements ---
const authView = document.getElementById('auth-view');
const lobbyView = document.getElementById('lobby-view');
const gameView = document.getElementById('game-view');
const allViews = [authView, lobbyView, gameView];

const emailInput = document.getElementById('email-input');
const usernameInput = document.getElementById('username-input');
const signinButton = document.getElementById('signin-button');
const authError = document.getElementById('auth-error');
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
let selectedPiece = null; // { row, col }

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
    if (!session) {
        throw new Error("Not authenticated!");
    }

    const response = await fetch(`/.netlify/functions/${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
    }
    return response.json();
}

// --- Auth Logic ---
signinButton.addEventListener('click', async () => {
    const email = emailInput.value;
    const username = usernameInput.value;
    authError.textContent = '';

    try {
        // Check if user exists
        const { data: { users }, error: countError } = await window.supabase.auth.admin.listUsers({ email });
        if(countError) throw countError;

        if (users.length > 0) {
            // User exists, sign them in
            const { error } = await window.supabase.auth.signInWithOtp({ email });
            if (error) throw error;
            alert('Check your email for a login link!');
        } else {
            // New user, sign them up
            if (!username) {
                authError.textContent = 'Username is required for new accounts.';
                return;
            }
            const { error } = await window.supabase.auth.signUp({ 
                email, 
                password: Math.random().toString(36).slice(-8), // Dummy password
                options: { data: { username } } 
            });
            if (error) throw error;
            alert('Check your email for a confirmation link!');
        }
    } catch (error) {
        authError.textContent = error.message;
    }
});

logoutButton.addEventListener('click', async () => {
    await window.supabase.auth.signOut();
});

function handleAuthStateChange(event, session) {
    if (event === 'SIGNED_IN' && session) {
        currentUser = session.user;
        showView(lobbyView);
        fetchUserProfile();
        subscribeToGamesList();
    } else if (event === 'SIGNED_OUT') {
        currentUser = null;
        currentGameId = null;
        if (gameSubscription) gameSubscription.unsubscribe();
        if (gamesSubscription) gamesSubscription.unsubscribe();
        showView(authView);
    }
}

async function fetchUserProfile() {
    const { data, error } = await window.supabase
        .from('profiles')
        .select('username')
        .eq('id', currentUser.id)
        .single();
    if(data) {
        userGreeting.textContent = `Hi, ${data.username}!`;
    }
}

// --- Lobby Logic ---
createGameButton.addEventListener('click', async () => {
    try {
        const { gameId } = await callApi('game-create');
        enterGame(gameId);
    } catch (error) {
        alert(`Error creating game: ${error.message}`);
    }
});

async function joinGame(gameId) {
    try {
        await callApi('game-join', { gameId });
        enterGame(gameId);
    } catch (error) {
        alert(`Error joining game: ${error.message}`);
    }
}

function renderGamesList(games) {
    gamesList.innerHTML = '';
    const waitingGames = games.filter(g => g.status === 'waiting' && g.game_players.length === 1);

    if (waitingGames.length === 0) {
        gamesList.innerHTML = '<p class="text-gray-500">No available games. Create one!</p>';
        return;
    }

    waitingGames.forEach(game => {
        const gameElement = document.createElement('div');
        gameElement.className = 'p-4 bg-gray-100 rounded-md flex justify-between items-center';
        
        const text = document.createElement('span');
        text.textContent = `Game by ${game.game_players[0].player_id.substring(0, 8)}...`;
        
        const button = document.createElement('button');
        button.textContent = 'Join';
        button.className = 'px-4 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600';
        button.onclick = () => joinGame(game.id);
        
        gameElement.appendChild(text);
        gameElement.appendChild(button);
        gamesList.appendChild(gameElement);
    });
}

function subscribeToGamesList() {
    if (gamesSubscription) gamesSubscription.unsubscribe();
    gamesSubscription = window.supabase
        .channel('public-games')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, async () => {
            const { data } = await window.supabase.from('games').select('*, game_players(*)');
            renderGamesList(data || []);
        })
        .subscribe(async (status) => {
             if (status === 'SUBSCRIBED') {
                 const { data } = await window.supabase.from('games').select('*, game_players(*)');
                 renderGamesList(data || []);
             }
        });
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
    selectedPiece = null;
    showView(lobbyView);
    subscribeToGamesList();
}

forfeitButton.addEventListener('click', async () => {
    if (confirm('Are you sure you want to forfeit?')) {
        try {
            await callApi('game-forfeit', { gameId: currentGameId });
        } catch (error) {
            alert(`Error: ${error.message}`);
        }
    }
});

leaveGameButton.addEventListener('click', leaveGame);
modalClose.addEventListener('click', () => {
    modal.classList.add('hidden');
    leaveGame();
});

function subscribeToCurrentGame() {
    if (gameSubscription) gameSubscription.unsubscribe();
    
    gameSubscription = window.supabase
        .channel(`game-${currentGameId}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'games',
            filter: `id=eq.${currentGameId}`
        }, (payload) => {
            handleGameUpdate(payload.new);
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                const { data: game, error } = await window.supabase
                    .from('games')
                    .select('*, game_players(*, profiles(username))')
                    .eq('id', currentGameId)
                    .single();
                if (game) {
                    handleGameUpdate(game);
                }
            }
        });
}

function handleGameUpdate(game) {
    renderBoard(game.game_state.board);
    updateStatus(game);
    checkGameEnd(game);
}

function updateStatus(game) {
    if (game.status === 'waiting') {
        statusElement.textContent = 'Waiting for opponent to join...';
        return;
    }
    if (game.status === 'finished' || game.status === 'abandoned') {
        const winner = game.game_players.find(p => p.player_id === game.winner_player_id);
        const winnerName = winner?.profiles?.username || 'Opponent';
        statusElement.textContent = `Game Over: ${winnerName} wins!`;
        return;
    }

    const myTurn = game.current_turn_player_id === currentUser.id;
    statusElement.textContent = myTurn ? "It's your turn!" : "Waiting for opponent's move...";
}

function checkGameEnd(game) {
    if (game.status === 'finished' || game.status === 'abandoned') {
        let title = 'Game Over';
        let body;
        if (game.winner_player_id) {
            body = game.winner_player_id === currentUser.id ? 'You won!' : 'You lost.';
        } else {
            body = "It's a draw!";
        }
        showModal(title, body);
    }
}

function renderBoard(board) {
    boardElement.innerHTML = '';
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement('div');
            square.className = `square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
            square.dataset.row = row;
            square.dataset.col = col;

            const pieceType = board[row][col];
            if (pieceType !== 0) {
                const piece = document.createElement('div');
                piece.className = `piece ${PIECE_MAP[pieceType]}`;
                square.appendChild(piece);
            }
            boardElement.appendChild(square);
        }
    }
}

boardElement.addEventListener('click', async (e) => {
    const square = e.target.closest('.square');
    if (!square) return;

    const row = parseInt(square.dataset.row);
    const col = parseInt(square.dataset.col);

    if (selectedPiece) {
        // A piece is selected, try to move it
        const move = { from: selectedPiece, to: { row, col } };
        try {
            statusElement.textContent = 'Submitting move...';
            await callApi('game-takeTurn', { gameId: currentGameId, move });
        } catch (error) {
            alert(`Invalid move: ${error.message}`);
            // Re-fetch state to be safe
            const { data: game } = await window.supabase.from('games').select('*, game_players(*, profiles(username))').eq('id', currentGameId).single();
            handleGameUpdate(game);
        } finally {
            clearSelection();
        }
    } else if (square.querySelector('.piece')) {
        // No piece selected, try to select one
        selectedPiece = { row, col };
        square.querySelector('.piece').classList.add('selected');
    }
});

function clearSelection() {
    const selectedElement = document.querySelector('.piece.selected');
    if (selectedElement) {
        selectedElement.classList.remove('selected');
    }
    selectedPiece = null;
}

// --- Initial Setup ---
window.addEventListener('DOMContentLoaded', () => {
    // Check initial auth state
    window.supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
            handleAuthStateChange('SIGNED_IN', session);
        } else {
            showView(authView);
        }
    });

    // Listen for auth state changes
    window.supabase.auth.onAuthStateChange(handleAuthStateChange);
});
