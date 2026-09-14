/**
 * Master Game Controller & State Manager
 * Coordinates game rules, turns, AI, UI rendering updates, and user interactions.
 */

class GameEngine {
  constructor(options = {}) {
    this.playerCount = options.playerCount || 4; // 2, 3, or 4 players
    this.aiDifficulty = options.aiDifficulty || 'medium';
    this.sound = options.sound || new SoundSynthesizer();
    this.rules = new Rules(options.ruleSettings || {});
    this.ai = new AI(this.aiDifficulty, this.rules);

    // State variables
    this.deck = new Deck();
    this.playPile = [];
    this.burnPile = [];
    this.players = []; // Array of Player objects
    this.activePlayerIndex = 0;
    this.playDirection = 1; // 1 = clockwise, -1 = counter-clockwise
    this.gamePhase = 'INIT'; // 'INIT' | 'SWAP' | 'PLAYING' | 'ENDED'
    this.winners = []; // Array of finished player objects in winning order
    this.shithead = null; // The final loser
    this.isFastSimulating = false; // Fast sim AI turns once human finishes
    this.selectedCardIds = new Set();
    this.statusMessage = '';

    // Action High-Score & Elo tracking
    this.matchScore = 0;
    this.humanPickupCount = 0;
    this.scoreSummary = null;
    this.onScoreEvent = options.onScoreEvent || (() => {});

    this.onStateChange = options.onStateChange || (() => {});
  }

  awardScore(points, label, icon = '🎯') {
    if (this.gamePhase === 'ENDED' && points < 0) return;
    this.matchScore = Math.max(0, this.matchScore + points);
    if (typeof this.onScoreEvent === 'function') {
      this.onScoreEvent({
        points,
        label,
        icon,
        totalScore: this.matchScore
      });
    }
  }

  setDifficulty(diff) {
    this.aiDifficulty = diff || 'medium';
    this.ai = new AI(this.aiDifficulty, this.rules);
  }

  initNewGame(options = {}) {
    if (options.aiDifficulty) {
      this.setDifficulty(options.aiDifficulty);
    }
    this.deck.reset();
    this.deck.shuffle();
    this.playPile = [];
    this.burnPile = [];
    this.winners = [];
    this.shithead = null;
    this.isFastSimulating = false;
    this.selectedCardIds.clear();
    this.playDirection = 1;
    this.gamePhase = 'SWAP';
    this.statsRecorded = false;
    this.matchScore = 0;
    this.humanPickupCount = 0;
    this.scoreSummary = null;

    // Initialize Players
    const humanName = (typeof window !== 'undefined' && window.profileManager)
      ? window.profileManager.getDisplayName()
      : (options.playerName || 'You');

    this.players = [];
    // Player 0 is Human
    this.players.push({
      id: 'p0',
      name: humanName,
      isHuman: true,
      hand: [],
      faceUp: [],
      faceDown: [],
      ready: false,
      finished: false
    });

    // AI Players
    const botNames = ['Alex (AI)', 'Sam (AI)', 'Jordan (AI)'];
    for (let i = 1; i < this.playerCount; i++) {
      this.players.push({
        id: `p${i}`,
        name: botNames[i - 1],
        isHuman: false,
        hand: [],
        faceUp: [],
        faceDown: [],
        ready: true,
        finished: false
      });
    }

    // Deal cards: 3 Face-Down, 3 Face-Up, 3 Hand to each player
    for (let round = 0; round < 3; round++) {
      for (const p of this.players) p.faceDown.push(this.deck.draw());
    }
    for (let round = 0; round < 3; round++) {
      for (const p of this.players) p.faceUp.push(this.deck.draw());
    }
    for (let round = 0; round < 3; round++) {
      for (const p of this.players) p.hand.push(this.deck.draw());
    }

    // Sort human player's hand by card value
    this.sortHand(this.players[0]);

    // AI auto-performs optimal swap phase
    for (let i = 1; i < this.players.length; i++) {
      const p = this.players[i];
      const result = this.ai.decideSwaps(p.hand, p.faceUp);
      for (const swap of result.swaps) {
        const hIdx = p.hand.findIndex(c => c.id === swap.handCard.id);
        const fIdx = p.faceUp.findIndex(c => c.id === swap.faceUpCard.id);
        if (hIdx !== -1 && fIdx !== -1) {
          [p.hand[hIdx], p.faceUp[fIdx]] = [p.faceUp[fIdx], p.hand[hIdx]];
        }
      }
    }

    this.sound.playCardDeal();
    this.statusMessage = 'Swap Phase: Tap a card in hand and a face-up card to swap them before starting!';
    this.notifyStateChange();
  }

  sortHand(player) {
    player.hand.sort((a, b) => a.value - b.value);
  }

  // Swap phase human action
  swapCards(handCardId, faceUpCardId) {
    if (this.gamePhase !== 'SWAP') return false;
    const human = this.players[0];

    const hIdx = human.hand.findIndex(c => c.id === handCardId);
    const fIdx = human.faceUp.findIndex(c => c.id === faceUpCardId);

    if (hIdx !== -1 && fIdx !== -1) {
      [human.hand[hIdx], human.faceUp[fIdx]] = [human.faceUp[fIdx], human.hand[hIdx]];
      this.sortHand(human);
      this.sound.playClick();
      this.notifyStateChange();
      return true;
    }
    return false;
  }

  finishSwapPhase() {
    if (this.gamePhase !== 'SWAP') return;
    this.players[0].ready = true;
    this.gamePhase = 'PLAYING';

    // Determine starting player: player with lowest starting card in hand
    let lowestVal = 999;
    let startingIdx = 0;

    for (let i = 0; i < this.players.length; i++) {
      const minCard = this.players[i].hand.reduce((min, c) => (c.value < min.value ? c : min), this.players[i].hand[0]);
      if (minCard && minCard.value < lowestVal) {
        lowestVal = minCard.value;
        startingIdx = i;
      }
    }

    this.activePlayerIndex = startingIdx;
    const starterName = this.players[startingIdx].name;
    this.statusMessage = `${starterName} has the lowest card (${lowestVal}) and starts first!`;
    this.sound.playClick();
    this.notifyStateChange();

    // If starting player is AI, trigger bot turn
    if (!this.players[this.activePlayerIndex].isHuman) {
      this.scheduleAITurn();
    }
  }

  getCurrentPlayer() {
    return this.players[this.activePlayerIndex];
  }

  /**
   * Determine which set of cards a player is currently playing from:
   * 'HAND' | 'FACE_UP' | 'FACE_DOWN'
   */
  getPlayerActivePhase(player) {
    if (player.hand.length > 0) return 'HAND';
    if (player.faceUp.length > 0) return 'FACE_UP';
    if (player.faceDown.length > 0) return 'FACE_DOWN';
    return 'DONE';
  }

  getAvailableCardsForPlayer(player) {
    const phase = this.getPlayerActivePhase(player);
    if (phase === 'HAND') return player.hand;
    if (phase === 'FACE_UP') return player.faceUp;
    if (phase === 'FACE_DOWN') return player.faceDown;
    return [];
  }

  /**
   * User Card Selection Logic:
   * Multi-select cards of the SAME rank.
   */
  toggleCardSelection(cardId) {
    if (this.gamePhase !== 'PLAYING') return;
    const human = this.players[0];
    if (this.activePlayerIndex !== 0) return; // Not human's turn

    const phase = this.getPlayerActivePhase(human);
    const available = this.getAvailableCardsForPlayer(human);
    const card = available.find(c => c.id === cardId);

    if (!card) return;

    if (phase === 'FACE_DOWN') {
      // Blind flip phase! Selecting a face-down card immediately attempts to play it
      this.playBlindCard(human, card);
      return;
    }

    if (this.selectedCardIds.has(cardId)) {
      this.selectedCardIds.delete(cardId);
    } else {
      // Check if selection rank matches existing selected cards
      if (this.selectedCardIds.size > 0) {
        const firstSelectedId = Array.from(this.selectedCardIds)[0];
        const firstSelectedCard = available.find(c => c.id === firstSelectedId);
        if (firstSelectedCard && firstSelectedCard.rank !== card.rank) {
          // Different rank selected: reset selection to new rank
          this.selectedCardIds.clear();
        }
      }
      this.selectedCardIds.add(cardId);
    }

    this.sound.playClick();
    this.notifyStateChange();
  }

  playSelectedCards() {
    if (this.gamePhase !== 'PLAYING' || this.activePlayerIndex !== 0) return false;
    const human = this.players[0];
    const available = this.getAvailableCardsForPlayer(human);

    const cardsToPlay = available.filter(c => this.selectedCardIds.has(c.id));
    if (cardsToPlay.length === 0) return false;

    if (!this.rules.isValidPlay(cardsToPlay, this.playPile)) {
      const eff = this.rules.getEffectiveTopCard(this.playPile);
      const effDesc = eff ? `${eff.rank}${eff.suit.symbol}` : 'empty pile';
      this.statusMessage = `Invalid play! Must be ≥ ${effDesc}, or a wildcard 2, 10, 8, or 4 (reverse).`;
      this.sound.playDefeat();
      this.notifyStateChange();
      return false;
    }

    this.executePlay(human, cardsToPlay);
    this.selectedCardIds.clear();
    return true;
  }

  playDirectCards(cardsToPlay) {
    if (this.gamePhase !== 'PLAYING' || this.activePlayerIndex !== 0) return false;
    const human = this.players[0];
    if (!cardsToPlay || cardsToPlay.length === 0) return false;

    if (!this.rules.isValidPlay(cardsToPlay, this.playPile)) {
      const topCard = this.rules.getEffectiveTopCard(this.playPile);
      const topDesc = topCard ? `${topCard.rank}${topCard.suit.symbol}` : 'empty pile';
      this.statusMessage = `Invalid play! Card must be ≥ ${topDesc}, or a wildcard 2, 10, 8, or 4 (reverse).`;
      this.sound.playDefeat();
      this.notifyStateChange();
      return false;
    }

    this.executePlay(human, cardsToPlay);
    this.selectedCardIds.clear();
    return true;
  }

  playBlindCard(player, card) {
    // Remove card from faceDown array
    const idx = player.faceDown.findIndex(c => c.id === card.id);
    if (idx !== -1) player.faceDown.splice(idx, 1);

    card.faceUp = true;
    const cardsToPlay = [card];

    if (this.rules.isValidPlay(cardsToPlay, this.playPile)) {
      this.statusMessage = `${player.name} blindly flipped a valid ${card.toString()}!`;
      if (player.isHuman) {
        this.awardScore(40, 'LUCKY BLIND FLIP!', '👁️');
      }
      this.executePlay(player, cardsToPlay);
    } else {
      // Invalid flip! Pick up the entire pile AND the flipped card goes into hand!
      this.statusMessage = `${player.name} flipped an invalid ${card.toString()}! Must pick up pile.`;
      player.hand.push(card);
      this.executePickup(player);
    }
  }

  executePlay(player, cardsToPlay) {
    const phase = this.getPlayerActivePhase(player);

    // Remove played cards from source container
    if (phase === 'HAND') {
      player.hand = player.hand.filter(c => !cardsToPlay.some(p => p.id === c.id));
    } else if (phase === 'FACE_UP') {
      player.faceUp = player.faceUp.filter(c => !cardsToPlay.some(p => p.id === c.id));
    }

    // Add cards to play pile
    this.playPile.push(...cardsToPlay);
    this.sound.playCardSnap();

    // Check for Burn
    const burnResult = this.rules.checkBurn(cardsToPlay, this.playPile);

    if (burnResult.burn) {
      // Burn pile!
      this.burnPile.push(...this.playPile);
      this.playPile = [];
      this.sound.playBurn();

      // Award action score to human
      if (player.isHuman) {
        if (burnResult.reason === '10') {
          this.awardScore(25, '10 BURN!', '🔥');
        } else {
          this.awardScore(60, '4-OF-A-KIND BURN!', '💥');
        }
      }

      // If cards played were 4s with special4Reverse enabled, reverse direction for each 4
      if (cardsToPlay[0].rank === '4' && this.rules.options.special4Reverse) {
        for (let i = 0; i < cardsToPlay.length; i++) {
          this.playDirection *= -1;
        }
      }

      const reasonMsg = burnResult.reason === '10' ? '10 Burn!' : '4 of a Kind Burn!';
      this.statusMessage = `🔥 ${player.name} played ${reasonMsg} Pile cleared! ${player.name} plays again.`;

      // Replenish hand if needed
      this.replenishHand(player);
      this.checkPlayerFinished(player);

      this.notifyStateChange();

      if (this.gamePhase === 'ENDED') return;

      if (player.finished) {
        this.advanceTurn();
      } else if (!player.isHuman) {
        this.scheduleAITurn();
      }
      return;
    }

    // Normal play (no burn)
    let extraStatus = '';
    // Rule: 4 Reverses Order of Play
    if (cardsToPlay[0].rank === '4' && this.rules.options.special4Reverse) {
      for (let i = 0; i < cardsToPlay.length; i++) {
        this.playDirection *= -1;
      }
      extraStatus += ` 🔄 Play reversed to ${this.playDirection === 1 ? 'clockwise' : 'counter-clockwise'}!`;
    }

    // Rule: 2 Play Again
    const is2PlayAgain = cardsToPlay[0].rank === '2' && this.rules.options.special2PlayAgain;

    // Rule: 8 Invisible Card
    if (cardsToPlay[0].rank === '8' && this.rules.options.special8Transparent) {
      const eff = this.rules.getEffectiveTopCard(this.playPile);
      extraStatus += ` 👻 Invisible 8! (Underneath: ${eff ? eff.toString() : 'Empty Pile'})`;
    }

    // Award action points to human on standard play
    if (player.isHuman) {
      if (cardsToPlay.length > 1) {
        this.awardScore((cardsToPlay.length - 1) * 10, `${cardsToPlay.length}x COMBO!`, '🃏');
      }
      if (cardsToPlay[0].rank === '4' && this.rules.options.special4Reverse) {
        this.awardScore(15, 'REVERSE!', '🔄');
      } else if (cardsToPlay[0].rank === '8' && this.rules.options.special8Transparent) {
        this.awardScore(15, 'INVISIBLE 8!', '👻');
      } else if (cardsToPlay[0].rank === '2' && this.rules.options.special2PlayAgain) {
        this.awardScore(15, 'RESET 2 & PLAY AGAIN!', '⚡');
      } else if (cardsToPlay[0].rank === '2') {
        this.awardScore(10, 'RESET 2!', '⚡');
      }
    }

    this.statusMessage = `${player.name} played ${cardsToPlay.map(c => c.toString()).join(', ')}.${extraStatus}`;
    this.replenishHand(player);
    this.checkPlayerFinished(player);

    if (this.gamePhase === 'ENDED') {
      this.notifyStateChange();
      return;
    }

    if (is2PlayAgain && !player.finished) {
      this.statusMessage += ` ⚡ ${player.name} plays again!`;
      this.notifyStateChange();
      if (!player.isHuman) {
        this.scheduleAITurn();
      }
      return;
    }

    this.advanceTurn();
  }

  executePickup(player) {
    if (player.isHuman) {
      this.humanPickupCount++;
      const penalty = Math.min(this.matchScore, Math.max(5, (this.playPile.length || 1) * 5));
      if (penalty > 0) {
        this.awardScore(-penalty, `PICKED UP PILE (-${penalty})`, '📥');
      }
    }

    // Player picks up play pile
    player.hand.push(...this.playPile);
    this.playPile = [];
    this.sortHand(player);
    this.sound.playPilePickup();

    this.statusMessage = `📥 ${player.name} picked up the play pile!`;
    this.notifyStateChange();

    this.advanceTurn();
  }

  pickupPileHuman() {
    if (this.gamePhase !== 'PLAYING' || this.activePlayerIndex !== 0) return;
    const human = this.players[0];
    if (this.playPile.length === 0) return;

    this.selectedCardIds.clear();
    this.executePickup(human);
  }

  replenishHand(player) {
    while (player.hand.length < 3 && !this.deck.isEmpty()) {
      const card = this.deck.draw();
      if (card) {
        player.hand.push(card);
      }
    }
    this.sortHand(player);
  }

  checkPlayerFinished(player) {
    if (player.finished) return;

    if (player.hand.length === 0 && player.faceUp.length === 0 && player.faceDown.length === 0) {
      player.finished = true;
      this.winners.push(player);
      this.sound.playVictory();

      const rankStr = this.winners.length === 1 ? '1st (WINNER!)' : `${this.winners.length}th place`;
      this.statusMessage = `🎉 ${player.name} cleared all cards and placed ${rankStr}!`;

      // Persist human result IMMEDIATELY so closing the app never loses the victory/placement!
      if (player.isHuman && !this.statsRecorded) {
        this.saveHumanResult(this.winners.length, false);
      }

      // Check if game is over (only 1 player remaining with cards)
      const activePlayers = this.players.filter(p => !p.finished);
      if (activePlayers.length === 1) {
        this.shithead = activePlayers[0];
        this.gamePhase = 'ENDED';
        this.isFastSimulating = false;
        this.statusMessage = `💀 Game Over! ${this.shithead.name} is the SHITHEAD!`;
        if (!this.statsRecorded) {
          // Human was the last player left with cards (The Shithead)
          this.saveHumanResult(this.players.length, this.shithead.isHuman);
        }
        this.notifyStateChange();
      } else if (player.isHuman) {
        // Human player cleared all cards! Fast-sim the remaining bot players automatically
        this.isFastSimulating = true;
        this.statusMessage = `🎉 You placed ${rankStr}! Fast-simulating remaining players...`;
        this.notifyStateChange();
      }
    }
  }

  advanceTurn() {
    if (this.gamePhase === 'ENDED') return;

    // Find next non-finished player in current direction (1 = clockwise, -1 = counter-clockwise)
    const step = this.playDirection || 1;
    let nextIdx = (this.activePlayerIndex + step + this.players.length) % this.players.length;
    while (this.players[nextIdx].finished) {
      nextIdx = (nextIdx + step + this.players.length) % this.players.length;
    }

    this.activePlayerIndex = nextIdx;
    this.notifyStateChange();

    if (!this.players[this.activePlayerIndex].isHuman) {
      this.scheduleAITurn();
    }
  }

  scheduleAITurn() {
    if (this.gamePhase !== 'PLAYING') return;
    const bot = this.players[this.activePlayerIndex];
    if (!bot || bot.isHuman || bot.finished) return;

    // Fast simulation delay (110ms) when human is already finished vs normal thinking time (900ms)
    const delay = this.isFastSimulating ? 110 : 900;

    setTimeout(() => {
      if (this.gamePhase !== 'PLAYING' || this.activePlayerIndex !== this.players.indexOf(bot)) return;

      const phase = this.getPlayerActivePhase(bot);
      const available = this.getAvailableCardsForPlayer(bot);

      if (phase === 'FACE_DOWN') {
        // AI flips random face-down card
        const randomCard = available[Math.floor(Math.random() * available.length)];
        this.playBlindCard(bot, randomCard);
        return;
      }

      const move = this.ai.decideMove(available, this.playPile, phase);
      if (move) {
        this.executePlay(bot, move);
      } else {
        this.executePickup(bot);
      }
    }, delay);
  }

  saveHumanResult(humanRank, shitheadIsHuman = false) {
    if (this.statsRecorded) return;
    this.statsRecorded = true;

    // End-of-match placement bonus
    if (humanRank === 1) {
      this.awardScore(250, '1ST PLACE VICTORY!', '🏆');
    } else if (humanRank === 2) {
      this.awardScore(100, '2ND PLACE PODIUM!', '🥈');
    } else if (humanRank === 3) {
      this.awardScore(50, '3RD PLACE PODIUM!', '🥉');
    }

    // Clean sheet bonus (never picked up the pile)
    const isCleanSheet = this.humanPickupCount === 0;
    if (isCleanSheet) {
      this.awardScore(200, 'CLEAN SHEET! (Zero Pickups)', '🛡️');
    }

    try {
      if (typeof statsManager !== 'undefined') {
        this.scoreSummary = statsManager.recordGameResult({
          humanRank,
          totalPlayers: this.players.length,
          shitheadIsHuman: shitheadIsHuman || (this.shithead && this.shithead.isHuman),
          matchScore: this.matchScore,
          cleanSheet: isCleanSheet,
          difficulty: this.aiDifficulty || 'medium'
        });
      } else if (typeof localStorage !== 'undefined') {
        const statsStr = localStorage.getItem('shithead_pwa_stats');
        const stats = statsStr ? JSON.parse(statsStr) : { gamesPlayed: 0, wins: 0, losses: 0, shitheads: 0 };
        stats.gamesPlayed++;
        if (humanRank === 1) stats.wins++;
        else if (shitheadIsHuman) stats.shitheads++;
        else stats.losses++;
        localStorage.setItem('shithead_pwa_stats', JSON.stringify(stats));
      }
    } catch (e) {
      console.warn('Error recording stats:', e);
    }
  }

  saveStats() {
    const humanPlace = this.winners.findIndex(w => w.isHuman) + 1;
    const shitheadIsHuman = this.shithead && this.shithead.isHuman;
    this.saveHumanResult(humanPlace > 0 ? humanPlace : this.players.length, shitheadIsHuman);
  }

  serializeState() {
    return {
      playerCount: this.playerCount,
      aiDifficulty: this.aiDifficulty,
      ruleSettings: this.rules.options,
      deck: { cards: this.deck.cards },
      playPile: this.playPile,
      burnPile: this.burnPile,
      players: this.players,
      activePlayerIndex: this.activePlayerIndex,
      playDirection: this.playDirection,
      gamePhase: this.gamePhase,
      winners: this.winners.map(w => w.id),
      shithead: this.shithead ? this.shithead.id : null,
      isFastSimulating: this.isFastSimulating,
      statusMessage: this.statusMessage,
      statsRecorded: this.statsRecorded,
      matchScore: this.matchScore,
      humanPickupCount: this.humanPickupCount,
      scoreSummary: this.scoreSummary,
      timestamp: Date.now()
    };
  }

  loadSerializedState(data) {
    if (!data) return false;
    this.playerCount = data.playerCount || 4;
    this.aiDifficulty = data.aiDifficulty || 'medium';
    this.rules = new Rules(data.ruleSettings || {});
    this.ai = new AI(this.aiDifficulty, this.rules);

    this.deck = Deck.fromJSON(data.deck);
    this.playPile = (data.playPile || []).map(c => Card.fromJSON(c));
    this.burnPile = (data.burnPile || []).map(c => Card.fromJSON(c));

    this.players = (data.players || []).map(p => ({
      id: p.id,
      name: p.name,
      isHuman: !!p.isHuman,
      hand: (p.hand || []).map(c => Card.fromJSON(c)),
      faceUp: (p.faceUp || []).map(c => Card.fromJSON(c)),
      faceDown: (p.faceDown || []).map(c => Card.fromJSON(c)),
      ready: !!p.ready,
      finished: !!p.finished
    }));

    this.activePlayerIndex = typeof data.activePlayerIndex === 'number' ? data.activePlayerIndex : 0;
    this.playDirection = typeof data.playDirection === 'number' ? data.playDirection : 1;
    this.gamePhase = data.gamePhase || 'PLAYING';
    this.isFastSimulating = !!data.isFastSimulating;
    this.statusMessage = data.statusMessage || '';
    this.statsRecorded = !!data.statsRecorded;
    this.matchScore = data.matchScore || 0;
    this.humanPickupCount = data.humanPickupCount || 0;
    this.scoreSummary = data.scoreSummary || null;

    this.winners = (data.winners || []).map(wId => this.players.find(p => p.id === wId)).filter(Boolean);
    this.shithead = data.shithead ? this.players.find(p => p.id === data.shithead) : null;

    return true;
  }

  static ACTIVE_GAME_KEY = 'shithead_active_game_v1';

  saveActiveGame() {
    if (typeof localStorage === 'undefined') return;
    try {
      if (this.gamePhase === 'ENDED') {
        localStorage.removeItem(GameEngine.ACTIVE_GAME_KEY);
      } else {
        localStorage.setItem(GameEngine.ACTIVE_GAME_KEY, JSON.stringify(this.serializeState()));
      }
    } catch (e) {
      console.warn('Error saving active game state:', e);
    }
  }

  static getSavedActiveGame() {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(GameEngine.ACTIVE_GAME_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.gamePhase && parsed.gamePhase !== 'ENDED') {
        return parsed;
      }
    } catch (e) {
      console.warn('Error reading active game state:', e);
    }
    return null;
  }

  static clearSavedActiveGame() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(GameEngine.ACTIVE_GAME_KEY);
    } catch (e) {}
  }

  getState() {
    return {
      gamePhase: this.gamePhase,
      activePlayer: this.getCurrentPlayer(),
      activePlayerIndex: this.activePlayerIndex,
      playDirection: this.playDirection,
      ruleSettings: this.rules.options,
      players: this.players,
      playPile: this.playPile,
      burnPile: this.burnPile,
      deckRemaining: this.deck.remaining,
      effectiveTopCard: this.rules.getEffectiveTopCard(this.playPile),
      selectedCardIds: Array.from(this.selectedCardIds),
      statusMessage: this.statusMessage,
      winners: this.winners,
      shithead: this.shithead,
      isFastSimulating: this.isFastSimulating,
      matchScore: this.matchScore,
      humanPickupCount: this.humanPickupCount,
      scoreSummary: this.scoreSummary
    };
  }

  notifyStateChange() {
    this.saveActiveGame();
    this.onStateChange(this.getState());
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GameEngine;
}
